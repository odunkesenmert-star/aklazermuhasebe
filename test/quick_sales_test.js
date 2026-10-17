const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
(async()=>{
 const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const dom=new JSDOM(html,{url:'http://quick-sale.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document; w.alert=()=>{};w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const reset=()=>{w.eval('db=createEmptyDatabase()');return w.eval('db');};
 const current=()=>w.eval('db');
 let n=0;const input=(extras={})=>({token:'test-'+(++n),description:'Parça kesimi',name:'',total:350,cashId:1,date:'2026-09-25',tax:20,stockId:'',unit:'miktar',quantity:'',...extras});
 let database=reset();database.cariler.push({id:9,adi:'Perakende Müşteri',bakiye:17,ledgerOpeningBalance:17});
 let result=await w.commitQuickSale(input());assert.equal(result.success,true,result.error);let sale=result.sale;
 assert.equal(current().cariler.length,2,'A similarly named regular customer is not the system account');
 assert.equal(current().cariler[0].bakiye,17);assert.equal(current().cariler[1].bakiye,0);
 assert.equal(current().islemler.length,2);assert.equal(current().kasaHareketleri.length,1);assert.equal(current().kasaHesaplari[0].bakiye,350);
 assert.equal(current().islemler.filter(w.isActiveIncomeMovement).reduce((n,m)=>n+m.tutar,0),350);
 assert.equal(w.buildAccountCheckReport().findings.length,0,JSON.stringify(w.buildAccountCheckReport().findings));
 const ledger=w.getCariLedgerLines(current().cariler[1],[],0);assert(ledger.some(line=>line.code===sale.satisNo),'Statement identifies the quick-sale number');
 const unchanged=JSON.stringify(current());assert(!(await w.commitQuickSale(input({token:sale.submitToken}))).success);assert.equal(JSON.stringify(current()),unchanged);
 assert(!w.canEditCariMovement(current().islemler[0]));assert(!w.canEditCariMovement(current().islemler[1]));
 result=await w.commitQuickSale(input({cashId:2,name:'Ali'}),sale.id);assert(result.success,result.error);const replacement=result.sale;
 assert.equal(current().kasaHesaplari[0].bakiye,0);assert.equal(current().kasaHesaplari[1].bakiye,350);assert.equal(current().cariler[1].bakiye,0);
 w.openStatModal('gelir');assert.equal(w.currentStatData.reduce((n,m)=>n+m.tutar,0),350);w.closeModal('modal-stat-detail');
 assert.equal(current().hizliSatislar[0].status,'corrected');assert.equal(current().hizliSatislar[0].correctedBy,replacement.id);
 assert.equal(current().islemler.filter(w.isActiveIncomeMovement).reduce((n,m)=>n+m.tutar,0),350,'Correction is not another income');
 assert.equal(w.buildAccountCheckReport().findings.length,0,JSON.stringify(w.buildAccountCheckReport().findings));
 const beforeReplay=JSON.stringify(current());assert(!(await w.commitQuickSale(input(),sale.id)).success);assert.equal(JSON.stringify(current()),beforeReplay);
 result=await w.commitQuickSale(null,replacement.id,true);assert(result.success,result.error);assert.equal(current().kasaHesaplari[1].bakiye,0);assert.equal(current().cariler[1].bakiye,0);
 assert.equal(current().islemler.filter(w.isActiveIncomeMovement).length,0);assert.equal(w.buildAccountCheckReport().findings.length,0);
 const cancelled=JSON.stringify(current());assert(!(await w.commitQuickSale(null,replacement.id,true)).success);assert.equal(JSON.stringify(current()),cancelled);
 database=reset();database.stoklar=[{id:10,cinsi:'Sac',miktar:10,kg:100,sahibiTipi:'isletme'},{id:11,cinsi:'Emanet',miktar:10,kg:100,sahibiTipi:'musteri'}];
 database.isEmirleri=[{id:20,stokId:10,durum:'Beklemede',stokQty:8,stokDusuldu:false}];
 const base=JSON.stringify(current());
 for(const extra of [{total:0},{total:-1},{total:Infinity},{tax:18},{tax:1},{tax:10},{date:'2026-02-31'},{description:''},{cashId:999},{stockId:11,quantity:1},{stockId:10,quantity:3},{stockId:10,quantity:0},{stockId:10,quantity:1,unit:'other'}]) {const r=await w.commitQuickSale(input(extra));assert(!r.success,JSON.stringify(extra));assert.equal(JSON.stringify(current()),base);}
 result=await w.commitQuickSale(input({stockId:10,quantity:2}));assert(result.success,result.error);sale=result.sale;assert.equal(current().stoklar[0].miktar,8);
 result=await w.commitQuickSale(input({stockId:10,quantity:1,total:120}),sale.id);assert(result.success,result.error);sale=result.sale;assert.equal(current().stoklar[0].miktar,9);assert.equal(current().kasaHesaplari[0].bakiye,120);
 result=await w.commitQuickSale(null,sale.id,true);assert(result.success,result.error);assert.equal(current().stoklar[0].miktar,10);
 result=await w.commitQuickSale(input({stockId:10,quantity:1.25,unit:'kg'}));assert(result.success,result.error);sale=result.sale;assert.equal(current().stoklar[0].kg,98.75);assert.equal(current().stoklar[0].miktar,10);
 await w.commitQuickSale(null,sale.id,true);assert.equal(current().stoklar[0].kg,100);
 // Missing or mismatched links block correction without changing any record.
 result=await w.commitQuickSale(input());sale=result.sale;current().kasaHareketleri.find(m=>m.id===sale.cashMovementId).tutar=1;
 const damaged=JSON.stringify(current());assert(!(await w.commitQuickSale(null,sale.id,true)).success);assert.equal(JSON.stringify(current()),damaged);assert(w.buildAccountCheckReport().findings.some(f=>f.category==='Hızlı Satış'));
 // Failed persistence, retry, concurrent submissions and backup failure.
 reset();const cacheBefore=w.localStorage.getItem('AkLazerDB');const liveBefore=JSON.stringify(current());
 w.electronAPI={saveDBToFile:async()=>({success:false,error:'Disk dolu'})};
 const retry=input();assert(!(await w.commitQuickSale(retry)).success);assert.equal(JSON.stringify(current()),liveBefore);assert.equal(w.localStorage.getItem('AkLazerDB'),cacheBefore);
 let resolve;w.electronAPI.saveDBToFile=()=>new Promise(r=>resolve=r);const pending=w.commitQuickSale(retry);assert(!(await w.commitQuickSale(retry)).success);assert.equal(JSON.stringify(current()),liveBefore);resolve({success:true});assert((await pending).success);
 assert.equal(current().hizliSatislar.length,1);assert.equal(current().kasaHesaplari[0].bakiye,350);
 w.electronAPI={saveDBToFile:async()=>({success:true}),sendBackup:async()=>({success:false,error:'Yedek hatası'})};result=await w.commitQuickSale(input());assert(result.success&&result.backupWarning);assert.equal(current().hizliSatislar.length,2);
 w.electronAPI={};
 const restored=w.validateAndNormalizeDB(JSON.parse(JSON.stringify(current())));assert.equal(restored.hizliSatislar.length,2);assert.equal(w.validateAndNormalizeDB({schemaVersion:4,cariler:[]}).hizliSatislar.length,0);
 // VAT choices and preservation of historical rates during a cash-account correction.
 reset(); result=await w.commitQuickSale(input({tax:0,total:120}));assert(result.success);assert.equal(result.sale.kdvTutari,0);assert.equal(result.sale.matrah,120);
 result=await w.commitQuickSale(input({tax:20,total:120}));assert.equal(result.sale.kdvTutari,20);assert.equal(result.sale.matrah,100);
 const legacy=current().hizliSatislar.at(-1);legacy.kdvOrani=10;legacy.matrah=109.09;legacy.kdvTutari=10.91;
 const legacyBefore=JSON.stringify(legacy);w.openQuickSale(legacy.id);assert.equal(d.getElementById('quick-sale-tax').value,'10');assert.equal(JSON.stringify(legacy),legacyBefore);
 result=await w.commitQuickSale(input({tax:10,total:120,cashId:2}),legacy.id);assert(result.success,result.error);assert.equal(result.sale.kdvOrani,10);
 w.closeModal('modal-quick-sale');w.openQuickSale();assert.deepEqual([...d.getElementById('quick-sale-tax').options].map(o=>o.value),['20','0']);w.closeModal('modal-quick-sale');
 // Exhausted historical cards must not appear as another available thickness.
 database=reset();database.stoklar=[
 {id:20,kodu:'OLD-10MM',cinsi:'ST37',mm:10,miktar:0,kg:0,sahibiTipi:'biz'},
 {id:21,kodu:'NEW-10MM',cinsi:'ST37',mm:10,miktar:1,kg:706.5,sahibiTipi:'biz'},
 {id:22,kodu:'NEW-8MM',cinsi:'ST37',mm:8,miktar:2,kg:565.2,sahibiTipi:'biz'},
 {id:23,kodu:'ARCHIVED',cinsi:'ST37',mm:10,miktar:1,kg:500,isPasif:true,sahibiTipi:'biz'},
 {id:24,kodu:'KG-ONLY',cinsi:'ST37',mm:4,miktar:0,kg:30,sahibiTipi:'biz'},
 {id:25,kodu:'COUNT-ONLY',cinsi:'ST37',mm:5,miktar:1,kg:0,sahibiTipi:'biz'}];
 w.openQuickSale();const stockOptions=()=>[...d.getElementById('quick-sale-stock').options];assert(!stockOptions().some(o=>o.value==='20'||o.value==='23'));assert(stockOptions().some(o=>o.value==='24'));assert(stockOptions().some(o=>o.value==='25'));
 assert(stockOptions().find(o=>o.value==='21').textContent.includes('Stok: 1 plaka / 706,5 KG'));assert(stockOptions().find(o=>o.value==='22').textContent.includes('Stok: 2 plaka / 565,2 KG'));
 // A sale that consumed the final stock must still be editable and reversible.
 result=await w.commitQuickSale(input({stockId:25,unit:'miktar',quantity:1}));assert(result.success,result.error);sale=result.sale;w.openQuickSale();assert(!stockOptions().some(o=>o.value==='25'));w.openQuickSale(sale.id);assert.equal(d.getElementById('quick-sale-stock').value,'25');assert(d.getElementById('quick-sale-stock-hint').textContent.includes('1 adet'));
 assert((await w.commitQuickSale(input({stockId:25,unit:'miktar',quantity:1,total:400}),sale.id)).success);assert.equal(current().stoklar.find(s=>s.id===25).miktar,0);
 // Form submission, optional names, safe printed output and actual print shell.
 reset();w.openQuickSale();assert(d.getElementById('modal-quick-sale').classList.contains('active'));assert(d.getElementById('quick-sale-date').value);
 d.getElementById('quick-sale-description').value='Küçük kesim';d.getElementById('quick-sale-total').value='240';d.getElementById('quick-sale-cash').value='1';await w.saveQuickSale();
 assert.equal(current().hizliSatislar.length,1);assert(!d.getElementById('modal-quick-sale').classList.contains('active'));sale=current().hizliSatislar[0];
 const printed=w.getQuickSalePrintHTML(sale);assert(!printed.includes('Perakende Müşteri'));assert(!printed.includes('document-card-label'));assert(printed.includes('₺240,00'));
 w.printQuickSale(sale.id);const frame=d.querySelector('#print-preview-overlay iframe');assert(frame);assert(frame.srcdoc.includes('TR04 0001 0090 1065 8664 4050 01'));d.getElementById('print-preview-overlay').closePreview();
 assert(w.getQuickSalePrintHTML({...sale,customerName:'<img src=x>',aciklama:'<script>bad</script>'}).includes('&lt;img'));
 assert(!w.getQuickSalePrintHTML({...sale,customerName:'<img src=x>'}).includes('<img src=x>'));
 for(let i=0;i<55;i++)current().hizliSatislar.push({...sale,id:100+i,satisNo:'HZS-TEST-'+i,customerName:'ÖMER'});
 w.renderQuickSales();assert.equal(d.querySelectorAll('#quick-sales-tbody tr').length,25);w.changeQuickSalesPage(1);assert(d.getElementById('quick-sales-page-info').textContent.includes('2 / 3'));
 d.getElementById('quick-sales-search').value='omer';w.filterQuickSales();assert(d.getElementById('quick-sales-page-info').textContent.includes('55 kayıt'));
 d.getElementById('quick-sales-search').value='does not exist';w.filterQuickSales();assert(d.getElementById('quick-sales-tbody').textContent.includes('satış yok'));
 dom.window.close();console.log('Quick sales: atomic payment and stock, account isolation, corrections, cancellation, duplicate guards, persistence failure/retry, migration, filters and print passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
