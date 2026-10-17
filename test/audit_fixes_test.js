const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://audit-fixes.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;const alerts=[];w.alert=m=>alerts.push(String(m));let accept=true;w.confirm=()=>accept;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),set=(id,v)=>{const e=d.getElementById(id);e.value=String(v);return e;};
 const errors=()=>w.buildAccountCheckReport().findings.filter(f=>f.severity==='error');
 const all=()=>w.buildAccountCheckReport().findings;
 const reset=()=>{alerts.length=0;w.eval("db=createEmptyDatabase();db.cariler=[{id:10,kodu:'C-10',adi:'Müşteri A',tip:'musteri',bakiye:0,ledgerOpeningBalance:0},{id:11,kodu:'C-11',adi:'Tedarikçi B',tip:'tedarikci',bakiye:0,ledgerOpeningBalance:0}]");};
 const balance=()=>db().cariler[0].bakiye;

 // 1. Deleting an invoice that carried the order's receivable returns the order to "not reflected".
 const order=()=>{const o={id:w.createRecordId(),orderNo:'EMR-T1',customerId:10,customerName:'Müşteri A',islemTipi:'lazer',durum:'Beklemede',total:1200,subTotal:1000,tax:200,taxRate:20,stokId:'0'};db().isEmirleri.push(o);return o;};
 const status=(o,value)=>{set('input-order-id',o.id);const e=set('input-order-status',value);e.innerHTML=`<option value="${value}">${value}</option>`;e.value=value;w.updateOrderStatus();};
 const invoice=(o,no)=>{set('input-fatura-tur','kesilen');w.renderCariler();set('input-fatura-firma',10);w.populateInvoiceOrderOptions();set('input-fatura-order',o.id);w.applyInvoiceOrderSelection();set('input-fatura-no',no);set('input-fatura-tarih','2026-10-10');w.saveFatura();return db().faturalar.find(f=>f.faturaNo===no);};
 reset();let o=order();accept=false;status(o,'Teslim Edildi');accept=true;
 assert.equal(balance(),0);let f=invoice(o,'F-1');assert.equal(balance(),1200);assert.equal(o.bakiyeCariyeYansitildi,true);
 w.deleteFatura(f.id);assert.equal(balance(),0);assert.notEqual(o.bakiyeCariyeYansitildi,true,'Deleted invoice no longer marks the order as reflected');
 f=invoice(o,'F-2');assert.equal(balance(),1200,'Re-invoicing charges the customer again');assert.equal(f.cariBakiyeDegisimi,1200);assert.equal(all().length,0,JSON.stringify(all()));
 w.deleteFatura(f.id);status(o,'İptal');assert.equal(balance(),0,'Cancelling after invoice deletion does not reverse a charge that no longer exists');assert.equal(all().length,0);
 // Reflected delivery: the invoice adds nothing and deleting it keeps the delivery charge.
 reset();o=order();status(o,'Teslim Edildi');assert.equal(balance(),1200);f=invoice(o,'F-3');assert.equal(balance(),1200);w.deleteFatura(f.id);assert.equal(o.bakiyeCariyeYansitildi,true);assert.equal(balance(),1200);status(o,'İptal');assert.equal(balance(),0);assert.equal(all().length,0);
 // Account check reports an order whose flag and charges disagree.
 reset();o=order();status(o,'Teslim Edildi');o.bakiyeCariyeYansitildi=false;assert(all().some(x=>x.category==='İş Emri'&&x.severity==='review'));

 // 2. Undoing a settled cheque marks the original movement, so it cannot be reversed again.
 const cheque=no=>{w.openCekSenetModal();set('input-ceksenet-tip','alinan_cek');w.updateCekSenetStatusOptions();w.populateKasaOptions();set('input-ceksenet-cari',10);set('input-ceksenet-no',no);set('input-ceksenet-vade','2026-11-01');set('input-ceksenet-tutar',500);set('input-ceksenet-durum','tahsil_edildi');set('input-ceksenet-kasa',1);w.saveCekSenet();return db().cekSenetler.find(c=>c.belgeNo===no);};
 reset();let c=cheque('CEK-1');assert.equal(balance(),-500);let original=db().islemler.find(m=>m.id===c.cariIslemId);
 w.updateCekSenetStatus(c.id,'beklemede');assert.equal(balance(),0);assert(original.reversedBy);assert(!w.canReverseCariMovement(original));
 const reversal=db().islemler.find(m=>m.id===original.reversedBy);assert.equal(reversal.reversalOf,original.id);assert(!w.canReverseCariMovement(reversal));
 w.reverseCariMovement(original.id);w.reverseCariMovement(reversal.id);assert.equal(balance(),0,'Neither side of a cheque reversal can be undone again');assert.equal(errors().length,0,JSON.stringify(errors()));
 reset();c=cheque('CEK-2');original=db().islemler.find(m=>m.id===c.cariIslemId);w.deleteCekSenet(c.id);assert.equal(balance(),0);assert(!w.canReverseCariMovement(original));assert.equal(db().kasaHesaplari[0].bakiye,0);assert.equal(errors().length,0);

 // 3. Archive results reach the live record even after an atomic save replaced the database.
 reset();let finishArchive;w.electronAPI={archiveAttachment:()=>new Promise(r=>finishArchive=r)};
 const attachment={name:'fatura.pdf',path:'/tmp/fatura.pdf',note:''};
 assert((await w.commitSheetPurchase({token:'archive-1',cariId:11,material:'ST37',mm:2,en:1000,boy:2000,quantity:1,weight:30,price:40,tax:0,date:'2026-10-10',payment:'none',attachment})).success);
 w.scheduleAttachmentArchive(attachment,'Cari Islemler','Tedarikçi B');finishArchive({success:true,path:'/arsiv/fatura.pdf'});await new Promise(r=>setTimeout(r,20));
 assert.equal(db().islemler.find(m=>m.sheetPurchase).ek.archivedPath,'/arsiv/fatura.pdf');assert.equal(db().islemler.find(m=>m.sheetPurchase).ek.archiveStatus,'Arşivlendi');w.electronAPI={};

 // 4. Account transactions use the chosen date for the movement, cash record and invoice.
 reset();w.openIslemModal(10,'Müşteri A');assert.equal(d.getElementById('input-islem-tarih').value,w.eval('toDateInputValue(new Date())'));
 set('input-islem-tipi','tahsilat');w.updateIslemTipiInfo();set('input-islem-tutar',300);set('input-islem-kasa',1);set('input-islem-tarih','2026-09-15');w.saveIslem();
 let move=db().islemler.at(-1);assert(move.tarih.startsWith('15.09.2026'),move.tarih);assert(db().kasaHareketleri.find(m=>m.id===move.kasaHareketId).tarih.startsWith('15.09.2026'));
 // Corrections stay on the day they are made, so printed periods do not change retroactively.
 w.openEditCariMovement(move.id);assert(d.getElementById('islem-tarih-container').hidden);set('input-islem-tutar',350);w.saveIslem();
 const today=w.eval("new Date().toLocaleDateString('tr-TR')");move=db().islemler.find(m=>m.correctionOf===move.id);assert(move.tarih.startsWith(today),move.tarih);
 w.openIslemModal(10,'Müşteri A');assert(!d.getElementById('islem-tarih-container').hidden,'New entries show the date field again');
 w.openIslemModal(10,'Müşteri A');set('input-islem-tipi','fatura_kes');w.updateIslemTipiInfo();set('input-islem-tutar',100);set('input-islem-fatura-no','IF-1');set('input-islem-tarih','2026-09-01');w.saveIslem();
 assert.equal(db().faturalar.find(x=>x.faturaNo==='IF-1').tarih,'01.09.2026');
 const count=db().islemler.length;w.openIslemModal(10,'Müşteri A');set('input-islem-tipi','tahsilat');w.updateIslemTipiInfo();set('input-islem-tutar',10);set('input-islem-kasa',1);set('input-islem-tarih',w.eval('(()=>{const f=new Date();f.setDate(f.getDate()+3);return toDateInputValue(f);})()'));w.saveIslem();
 assert.equal(db().islemler.length,count,'Future-dated payments are rejected');assert(alerts.some(a=>a.includes('bugünden ileri')));
 w.openIslemModal(11,'Tedarikçi B');set('input-islem-tipi','sac_alimi');w.updateIslemTipiInfo();assert(d.getElementById('islem-tarih-container').hidden,'Sheet purchases keep their own purchase date field');
 assert.equal(errors().length,0,JSON.stringify(errors()));

 // 6. A stock edit cannot turn waiting KG reservations into more plates than exist.
 reset();db().stoklar.push({id:5,kodu:'STK-4MM-01',cinsi:'ST37',mm:'4',en:1000,boy:2000,ebat:'1000x2000',miktar:0,kg:94.2,maliyet:30,sahibiTipi:'biz'});
 db().stokHareketleri.push({id:6,stokId:5,tip:'Stok Girişi',alan:'kg',miktar:94.2,onceki:0,sonraki:94.2});
 db().isEmirleri.push({id:20,orderNo:'EMR-20',stokId:5,durum:'Beklemede',islemTipi:'hammadde',kgAmount:10,customerId:'internal',total:0},{id:21,orderNo:'EMR-21',stokId:5,durum:'Beklemede',islemTipi:'hammadde',kgAmount:10,customerId:'internal',total:0});
 w.openStokDuzenleModal(5);set('input-duzenle-stok-miktar',1);w.updateStok();
 const stock=db().stoklar[0];assert.equal(stock.miktar,0,'Edit that strands the waiting orders is refused');assert.equal(stock.kg,94.2);assert.equal(stock.en,1000);assert(alerts.at(-1).includes('EMR')||alerts.at(-1).includes('ayırıyor'),alerts.at(-1));
 db().isEmirleri.length=0;w.openStokDuzenleModal(5);set('input-duzenle-stok-miktar',1);w.updateStok();assert.equal(stock.miktar,1,'Same edit is allowed without waiting orders');
 dom.window.close();

 // 5. Routine backups keep the recent window plus one per day (90 days) and one per month (24 months).
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lazer-retention-'));
 try {
  const handlers=new Map();const now=new Date('2026-10-17T12:00:00.000Z');
  class Window {constructor(){this.webContents={setWindowOpenHandler(){},on(){},session:{setPermissionRequestHandler(){}}};}loadFile(){}on(){}}
  const electron={app:{requestSingleInstanceLock:()=>true,getPath:name=>path.join(root,name),whenReady:()=>({then:fn=>fn()}),on(){},getVersion:()=>'test'},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},shell:{},net:{}};
  class FixedDate extends Date { constructor(...args){super(...(args.length?args:[now.getTime()]));} static now(){return now.getTime();} }
  const project=path.resolve(__dirname,'..');
  vm.runInNewContext(fs.readFileSync(path.join(project,'main.js'),'utf8'),{require:name=>name==='electron'?electron:name==='./backup-status'?require('../backup-status'):require(name),__dirname:project,process,Buffer,URL,Date:FixedDate,AbortController,setTimeout,clearTimeout,console:{error(){},log(){}}});
  const backupRoot=path.join(root,'documents','AkLazerYedek');
  const make=(daysAgo,index)=>{const dir=path.join(backupRoot,'eski');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`yedek-${daysAgo}-${index}.json`);fs.writeFileSync(file,'{}');const t=(now.getTime()-daysAgo*86400000-index*1000)/1000;fs.utimesSync(file,t,t);return file;};
  for(let i=0;i<80;i++)make(0,i);                       // today: more than the recent window
  for(let day=1;day<=120;day++)for(let i=0;i<3;i++)make(day,i); // three saves a day for 120 days
  for(let month=5;month<=30;month++)make(month*30+5,0);  // monthly history beyond 90 days
  const trusted={sender:{getURL:()=>pathToFileURL(path.join(project,'index.html')).href}};
  assert((await handlers.get('veri-degisti')(trusted,'{"cariler":[]}')).success);
  const remaining=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/^yedek-.*\.json$/.test(e.name))remaining.push(p);}};walk(backupRoot);
  const names=new Set(remaining.map(p=>path.basename(p)));
  for(let day=1;day<=90;day++)assert(names.has(`yedek-${day}-0.json`),`Newest backup of day ${day} is kept`);
  assert(!names.has('yedek-5-1.json')&&!names.has('yedek-5-2.json'),'Older same-day copies beyond the window are removed');
  const months=new Set(remaining.map(p=>{const t=fs.statSync(p).mtime;return (now-t)/86400000>90?`${t.getFullYear()}-${t.getMonth()}`:null;}).filter(Boolean));
  assert(months.size>=20&&months.size<=24,`Monthly history is kept and bounded (${months.size})`);
  assert(remaining.length<60+90+24+1,`Retention stays bounded (${remaining.length})`);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }

 console.log('Audit fixes: invoice deletion and order receivable, cheque reversal links, live attachment archive, dated account transactions, daily/monthly backup retention and stock edit reservations passed.');
})().catch(e=>{console.error(e);process.exit(1)});
