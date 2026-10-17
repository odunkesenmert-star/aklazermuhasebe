const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const dom=new JSDOM(html,{url:'http://readable-codes.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document,alerts=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const copy=x=>JSON.parse(JSON.stringify(x)),db=()=>w.eval('db');
 const reset=()=>w.eval('activeQuoteId=null;db=createEmptyDatabase()');
 reset();const year=new Date().getFullYear();
 // Thickness counters are independent, decimal-normalized, durable and don't advance for previews.
 const initial=JSON.stringify(db());assert.equal(w.stockCodeForThickness('10.0'),'STK-10MM-01');assert.equal(JSON.stringify(db()),initial);
 assert.equal(w.stockCodeForThickness(10,true),'STK-10MM-01');assert.equal(w.stockCodeForThickness(8,true),'STK-8MM-01');assert.equal(w.stockCodeForThickness(10,true),'STK-10MM-02');
 assert.equal(w.stockCodeForThickness('1,5',true),'STK-1.5MM-01');assert.equal(w.stockCodeForThickness('1.50',true),'STK-1.5MM-02');
 for(const value of ['',0,-1,'bad','1e2',Infinity])assert.throws(()=>w.stockCodeForThickness(value,true));
 let snapshot=copy(db());reset();w.__snapshot=snapshot;w.eval('db=validateAndNormalizeDB(window.__snapshot)');assert.equal(w.stockCodeForThickness(10),'STK-10MM-03');
 db().ayarlar.numaralandirma.stok.prefix='LEV';assert.equal(w.stockCodeForThickness(10,true),'LEV-10MM-01');db().ayarlar.numaralandirma.stok.prefix='STK';assert.equal(w.stockCodeForThickness(10),'STK-10MM-03');
 // Existing/imported cards, including archived cards and former aliases, reserve their numbers.
 db().stoklar.push({id:20,kodu:'STK-8MM-07',mm:8,isPasif:true,miktar:0,kg:0,codeAliases:['STK-8MM-09']});assert.equal(w.stockCodeForThickness(8),'STK-8MM-10');
 await w.saveDB(true);db().stoklar=[];await w.saveDB(true);assert.equal(w.stockCodeForThickness(8),'STK-8MM-10');
 // All new document numbers are readable and annual counters restart without reusing earlier series.
 reset();const expected={cari:'CAR-0001',isEmri:`EMR-${year}-0001`,teklif:`TEK-${year}-0001`,fatura:`FTR-${year}-0001`,hizliSatis:`SAT-${year}-0001`,sacKesim:`KES-${year}-0001`,hareket:`HRK-${year}-0001`,cekSenet:`CS-${year}-0001`,odemePlani:`VP-${year}-0001`,kasa:'KASA-002'};
 for(const [type,code] of Object.entries(expected)){const before=JSON.stringify(db());assert.equal(w.previewSerialNo(type),code);assert.equal(JSON.stringify(db()),before);assert.equal(w.generateSerialNo(type),code);}
 const realYear=w.Date.prototype.getFullYear;w.Date.prototype.getFullYear=()=>year+1;assert.equal(w.generateSerialNo('teklif'),`TEK-${year+1}-0001`);assert.equal(w.stockCodeForThickness(10),'STK-10MM-01');
 w.Date.prototype.getFullYear=()=>year;assert.equal(w.generateSerialNo('teklif'),`TEK-${year}-0002`);w.Date.prototype.getFullYear=realYear;
 db().ayarlar.numaralandirma.teklif.prefix='ONR';assert.equal(w.generateSerialNo('teklif'),`ONR-${year}-0001`);db().ayarlar.numaralandirma.teklif.prefix='TEK';assert.equal(w.previewSerialNo('teklif'),`TEK-${year}-0003`);
 // Manual document numbers survive deletion and a save in the same session.
 db().faturalar.push({id:23,faturaNo:`FTR-${year}-0099`,tutar:0,paidAmount:0,tarih:'04.10.2026'});await w.saveDB(true);db().faturalar=[];await w.saveDB(true);assert.equal(w.previewSerialNo('fatura'),`FTR-${year}-0100`);
 // Migration keeps financial legs and old document references intact; stock/card aliases are retained.
 reset();const legacy=copy(db());legacy.schemaVersion=8;
 legacy.cariler=[{id:100,kodu:'C-001',adi:'Tedarikçi',bakiye:-47287,tip:'tedarikci'},{id:101,kodu:'CAR-0008',adi:'Mevcut yeni kod',bakiye:0}];
 legacy.stoklar=[{id:3,kodu:'STK-0009',mm:10,originCutId:30,sourceStockId:1,miktar:1,kg:678.24,maliyet:37.5,partNo:1},{id:1,kodu:'STK-0007',mm:10,miktar:0,kg:0,maliyet:37.5},{id:2,kodu:'STK-0008',mm:8,miktar:2,kg:565.2,maliyet:37.5},{id:4,kodu:'STK-0007',mm:10,miktar:0,kg:0,isPasif:true,maliyet:37.5}];
 legacy.islemler=[{id:5,cariId:100,tutar:47287,bakiyeDegisimi:-47287,aciklama:'ALM-STK-0007',sheetPurchase:{stockId:1,stockCode:'STK-0007'}}];
 legacy.sacKesimleri=[{id:30,status:'active',movements:[],quantity:1,consumedKg:706.5,kesimNo:'KSM-2026-00001',stokId:1,sourceCode:'STK-0007',pieces:[{stockId:3,code:'STK-0009'}]}];
 legacy.teklifler=[{id:6,teklifNo:'TEK-2026-0004',stokId:3,customerId:100,total:1200}];legacy.isEmirleri=[{id:7,orderNo:'EMR-000002',stokId:3,customerId:100,total:1200}];legacy.faturalar=[{id:8,faturaNo:'FTR-2026-0003',cariId:100,tutar:1200}];
 const original=JSON.stringify(legacy),migrated=w.migrateDatabase(legacy);assert.equal(JSON.stringify(legacy),original);
 assert.equal(migrated.stoklar[1].kodu,'STK-10MM-01');assert.equal(migrated.stoklar[0].kodu,'STK-10MM-01');assert.equal(migrated.stoklar[3].kodu,'STK-10MM-01');assert.equal(migrated.stoklar[2].kodu,'STK-8MM-01');
 assert(migrated.stoklar[0].codeAliases.includes('STK-0009'));assert(migrated.stoklar[0].codeAliases.includes('STK-0007'));assert.equal(migrated.cariler[0].kodu,'CAR-0009');assert(migrated.cariler[0].codeAliases.includes('C-001'));
 for(const key of ['islemler','sacKesimleri','teklifler','isEmirleri','faturalar'])assert.equal(JSON.stringify(migrated[key]),JSON.stringify(legacy[key]),key);
 assert.equal(JSON.stringify(w.migrateDatabase(migrated)),JSON.stringify(migrated));
 w.__snapshot=migrated;w.eval('db=validateAndNormalizeDB(window.__snapshot)');d.getElementById('stok-search').value='STK-0009';assert.equal(w.getFilteredStoklarForReport()[0].id,3);d.getElementById('cari-search').value='C-001';assert.equal(w.getFilteredCarilerForReport()[0].id,100);
 assert(w.getWorkspaceSearchItems('STK-0009').some(r=>r.kind==='Stok'));assert(w.getWorkspaceSearchItems('C-001').some(r=>r.kind==='Cari'));
 w.openAyarlarModal();w.setSettingsTab('numbering');assert(d.getElementById('code-migration-list').textContent.includes('STK-10MM-01'));const noAdvance=JSON.stringify(db().ayarlar.numaralandirma);w.renderNumberingExamples();w.renderNumberingExamples();assert.equal(JSON.stringify(db().ayarlar.numaralandirma),noAdvance);
 d.getElementById('input-num-cari-prefix').value='BAD-PREFIX';w.saveAyarlar();assert(alerts.at(-1).includes('ön ekleri'));assert.equal(JSON.stringify(db().ayarlar.numaralandirma),noAdvance);
 // Actual stock entry/edit form: a thickness correction previews the code and keeps its old alias.
 reset();for(const [key,val] of Object.entries({cinsi:'ST37',mm:8,miktar:2,kg:565.2,en:1500,boy:3000,maliyet:37.5,kritik:0,sahibi:'biz'}))d.getElementById('input-stok-'+key).value=val;
 d.getElementById('input-stok-kg').dataset.basis='manual';w.renderStockCodeHint();assert(d.getElementById('new-stock-code-hint').textContent.includes('STK-8MM-01'));w.saveStok();assert.equal(db().stoklar[0].kodu,'STK-8MM-01');
 const id=db().stoklar[0].id;w.openStokDuzenleModal(id);d.getElementById('input-duzenle-stok-mm').value='10';w.renderStockCodeHint(true);assert(d.getElementById('edit-stock-code-hint').textContent.includes('STK-8MM-01 → STK-10MM-01'));w.updateStok();assert.equal(db().stoklar[0].id,id);assert.equal(db().stoklar[0].kodu,'STK-10MM-01');assert(db().stoklar[0].codeAliases.includes('STK-8MM-01'));
 d.getElementById('stok-search').value='STK-8MM-01';assert.equal(w.getFilteredStoklarForReport()[0].id,id);
 // Multi-line previews match committed codes and only changed thickness gets a new code.
 reset();db().cariler.push({id:100,kodu:'CAR-0001',adi:'Tedarikçi',bakiye:0,ledgerOpeningBalance:0,tip:'tedarikci'});w.openIslemModal(100,'Tedarikçi');d.getElementById('input-islem-tipi').value='sac_alimi';w.updateIslemTipiInfo();
 const line=(mm)=>({material:'ST37',mm,en:1500,boy:3000,quantity:1,weight:100,price:37.5,tax:0});
 for(const [key,val] of Object.entries(line(8)))d.getElementById('sheet-purchase-'+key).value=val;w.addSheetPurchaseLine(line(10));w.addSheetPurchaseLine(line(8));w.updateSheetPurchaseSummary();
 const hints=[...d.querySelectorAll('.sheet-purchase-line .stock-code-hint')].map(el=>el.textContent);assert(hints[0].includes('STK-8MM-01'));assert(hints[1].includes('STK-10MM-01'));assert(hints[2].includes('STK-8MM-02'));
 await w.saveIslem();let movement=db().islemler.find(m=>m.sheetPurchase&&!m.reversedBy);assert.deepEqual(copy(movement.sheetPurchase.lines.map(l=>l.stockCode)),['STK-8MM-01','STK-10MM-01','STK-8MM-02']);assert.equal(movement.movementNo,`HRK-${year}-0001`);
 w.openEditSheetPurchase(movement);d.querySelector('.sheet-purchase-line:not([data-first]) [data-field="mm"]').value='12';w.updateSheetPurchaseSummary();assert(d.querySelector('.sheet-purchase-line:not([data-first]) .stock-code-hint').textContent.includes('STK-10MM-01 → STK-12MM-01'));
 await w.saveIslem();movement=db().islemler.find(m=>m.sheetPurchase&&!m.reversedBy);assert.deepEqual(copy(movement.sheetPurchase.lines.map(l=>l.stockCode)),['STK-8MM-01','STK-12MM-01','STK-8MM-02']);assert(db().stoklar.find(s=>s.id===movement.sheetPurchase.lines[1].stockId).codeAliases.includes('STK-10MM-01'));assert.equal(w.buildAccountCheckReport().findings.length,0);
 assert.equal(w.stockCodeForThickness(10),'STK-10MM-02');assert.equal(w.stockCodeForThickness(8),'STK-8MM-03');
 const correctedStock=db().stoklar.find(s=>s.id===movement.sheetPurchase.lines[1].stockId);
 const cut=await w.commitSheetCut({token:'new-alias-piece',stockId:correctedStock.id,quantity:1,weight:100,scrapKg:0,pieces:[{en:1500,boy:2000,quantity:1}]});assert(cut.success,cut.error);
 const remnant=db().stoklar.find(s=>s.id===cut.cut.pieces[0].stockId);assert.equal(remnant.kodu,'STK-12MM-01');assert(remnant.codeAliases.includes('STK-10MM-01'));
 assert((await w.commitSheetCut(null,cut.cut.id)).success);
 // Failure to save rolls back allocations along with purchase records.
 const previous=JSON.stringify(db());w.electronAPI={saveDBToFile:async()=>({success:false,error:'disk'})};const failure=await w.commitSheetPurchase({...w.sheetPurchaseInput(),token:'failure',lines:[line(20)]});assert(!failure.success);assert.equal(JSON.stringify(db()),previous);w.electronAPI={};
 // Safety backup takes the unchanged legacy input, and a failed backup blocks migration persistence.
 let backed;w.electronAPI={sendBackup:async(data,opts)=>{assert(opts.safety);backed=JSON.parse(data);return {success:true}}};await w.backupBeforeReadableCodes(JSON.stringify(legacy));assert.equal(JSON.stringify(backed),JSON.stringify(legacy));
 w.electronAPI={sendBackup:async()=>({success:false,error:'no space'})};await assert.rejects(w.backupBeforeReadableCodes(JSON.stringify(legacy)),/güvenlik yedeği/);
 if(process.env.LAZER_CODE_CHECK_FILE){
  const raw=JSON.parse(fs.readFileSync(process.env.LAZER_CODE_CHECK_FILE,'utf8')),before=JSON.stringify(raw),updated=w.migrateDatabase(raw);
  for(const key of ['islemler','kasaHesaplari','kasaHareketleri','faturalar','hizliSatislar','isEmirleri','teklifler','stokHareketleri'])assert.equal(JSON.stringify(updated[key]),JSON.stringify(raw[key]),key);
  assert.equal(JSON.stringify(updated.cariler.map(({kodu,codeAliases,...rest})=>rest)),JSON.stringify(raw.cariler.map(({kodu,codeAliases,...rest})=>rest)));
  updated.stoklar.forEach((s,i)=>{for(const key of ['id','miktar','kg','maliyet','mm','en','boy','isPasif','cutVoided'])assert.equal(s[key],raw.stoklar[i][key],key);});
  assert.equal(JSON.stringify(w.buildAccountCheckReport(updated).findings),JSON.stringify(w.buildAccountCheckReport(raw).findings));assert.equal(JSON.stringify(raw),before);
  console.log('Existing data read-only migration passed:',JSON.stringify(updated.stoklar.filter(s=>!s.isPasif&&s.miktar>0).map(s=>({from:s.codeAliases,to:s.kodu,part:s.partNo,quantity:s.miktar,kg:s.kg}))));
 }
 dom.window.close();console.log('Readable codes: thickness/decimal serials, previews, annual rollover, prefix reuse, manual/deleted numbers, aliases/search, migration, real forms, multi-line correction, disk rollback and safety backups passed.');
})().catch(e=>{console.error(e);process.exit(1)});
