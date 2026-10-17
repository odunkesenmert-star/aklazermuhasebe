const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://stock-identity.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.alert=()=>{};w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),copy=x=>JSON.parse(JSON.stringify(x));
 const reset=()=>w.eval("activeQuoteId=null;db=createEmptyDatabase();db.cariler=[{id:100,adi:'Tedarikçi',tip:'tedarikci',bakiye:0,ledgerOpeningBalance:0}];db.stoklar=[{id:8,kodu:'STK-0008',cinsi:'ST37',en:1500,boy:6000,ebat:'1500x6000',mm:10,miktar:1,kg:706.5,maliyet:37.5,sahibiTipi:'biz'}]");
 reset();w.eval('db=validateAndNormalizeDB(db)');const serial=JSON.stringify(db().ayarlar.numaralandirma.stok);
 let r=await w.commitSheetCut({token:'first',stockId:8,quantity:1,weight:706.5,scrapKg:0,pieces:[{en:1500,boy:4000,quantity:1},{en:1500,boy:1000,quantity:1}]});assert(r.success,r.error);
 const cut=r.cut,first=cut.pieces[0].stockId,second=cut.pieces[1].stockId;
 assert(db().stoklar.every(s=>s.kodu==='STK-0008'));assert.equal(JSON.stringify(db().ayarlar.numaralandirma.stok),serial);
 assert.equal(db().stoklar[1].partNo,1);assert.equal(db().stoklar[2].partNo,2);assert.equal(db().stoklar[1].rootStockId,8);
 w.updateQuoteMaterials();const options=[...d.getElementById('quote-material').options];assert(!options.some(o=>o.value==='8'));
 assert(options.some(o=>o.value==first&&o.textContent.includes('Parça 1')&&o.textContent.includes('1500x4000')));
 assert(options.some(o=>o.value==second&&o.textContent.includes('Parça 2')&&o.textContent.includes('1500x1000')));
 w.openQuickSale();assert(d.getElementById('quick-sale-stock').textContent.includes('Parça 1'));
 // Same stock code does not conflate physical pieces or their usage.
 const sibling=copy(db().stoklar.find(s=>s.id===second));
 r=await w.commitSheetCut({token:'nested',stockId:first,quantity:1,weight:471,scrapKg:0,pieces:[{en:1500,boy:3000,quantity:1}]});assert(r.success,r.error);
 assert.equal(db().stoklar.at(-1).kodu,'STK-0008');assert.equal(db().stoklar.at(-1).partNo,3);assert.deepEqual(copy(db().stoklar.find(s=>s.id===second)),sibling);
 assert(!(await w.commitSheetCut(null,cut.id)).success);assert((await w.commitSheetCut(null,r.cut.id)).success);assert((await w.commitSheetCut(null,cut.id)).success);assert.equal(db().stoklar[0].miktar,1);assert.equal(db().stoklar[0].kg,706.5);
 // Existing links and financial amounts survive migration, even with out-of-order nested pieces.
 reset();let legacy=copy(db());legacy.schemaVersion=7;
 legacy.stoklar[0].miktar=0;legacy.stoklar[0].kg=0;
 legacy.stoklar.unshift({id:10,kodu:'STK-0010',originCutId:21,sourceStockId:9,miktar:1,kg:200,maliyet:37.5},{id:9,kodu:'STK-0009',originCutId:20,sourceStockId:8,miktar:0,kg:0,maliyet:37.5});
 legacy.sacKesimleri=[{id:20,stokId:8,sourceCode:'STK-0008',pieces:[{stockId:9,code:'STK-0009'}]},{id:21,stokId:9,sourceCode:'STK-0009',pieces:[{stockId:10,code:'STK-0010'}]}];
 legacy.islemler=[{id:31,cariId:100,tutar:47287,bakiyeDegisimi:-47287}];legacy.teklifler=[{id:32,stokId:10,total:1800}];legacy.stokHareketleri=[{id:33,stokId:10,stokKodu:'STK-0010',miktar:1}];
 const original=JSON.stringify(legacy),migrated=w.migrateDatabase(legacy);
 assert.equal(JSON.stringify(legacy),original);assert(migrated.stoklar.every(s=>s.kodu==='STK-10MM-01'));
 assert.equal(migrated.stoklar[0].identityMigration.previousCode,'STK-0010');assert.equal(migrated.stoklar[0].rootStockId,8);
 for(const key of ['islemler','teklifler','stokHareketleri'])assert.deepEqual(copy(migrated[key]),legacy[key]);
 assert.deepEqual(copy(migrated.stoklar.map(s=>[s.id,s.miktar,s.kg,s.maliyet])),legacy.stoklar.map(s=>[s.id,s.miktar,s.kg,s.maliyet]));
 assert.equal(migrated.sacKesimleri[1].sourceCode,'STK-0008');assert.equal(migrated.sacKesimleri[1].pieces[0].code,'STK-0008');
 assert.equal(JSON.stringify(w.migrateDatabase(migrated)),JSON.stringify(migrated));
 const broken=w.migrateDatabase({schemaVersion:7,stoklar:[{id:1,kodu:'STK-1',originCutId:1,sourceStockId:2},{id:2,kodu:'STK-2',originCutId:2,sourceStockId:1},{id:3,kodu:'STK-3',originCutId:3,sourceStockId:99}]});
 assert(broken.stoklar.every(s=>s.identityReviewRequired));assert.equal(broken.stoklar[0].kodu,'STK-1');
 // Loading a saved quote cannot silently switch consumed stock to customer material.
 reset();db().stoklar[0].miktar=0;db().stoklar[0].kg=0;
 db().teklifler.push({id:40,teklifNo:'TEK-40',stokId:8,stokQty:1,customerId:'internal',islemTipi:'lazer',minutes:10,rate:120,total:1200,taxRate:0});
 w.loadQuote(40);assert.equal(d.getElementById('quote-material').value,'8');
 w.eval('activeQuoteId=null');w.updateQuoteMaterials();assert(![...d.getElementById('quote-material').options].some(o=>o.value==='8'));
 // Existing order's own reservation is visible, but not offered to new quotes.
 reset();db().isEmirleri.push({id:51,stokId:8,stokQty:1,durum:'Beklemede',customerId:'internal',islemTipi:'lazer'});
 db().teklifler.push({id:50,orderId:51,teklifNo:'TEK-50',stokId:8,stokQty:1,customerId:'internal',islemTipi:'lazer',minutes:10,rate:120,kgAmount:0,kgPrice:50,total:1200,taxRate:0,discountPercent:0});
 w.updateQuoteMaterials();assert(![...d.getElementById('quote-material').options].some(o=>o.value==='8'));
 w.loadQuote(50);w.updateQuoteMaterials();assert.equal(d.getElementById('quote-material').value,'8');assert(d.getElementById('quote-material').selectedOptions[0].textContent.includes('Kullanılabilir: 0'));
 // Correcting a multi-line purchase preserves codes across removed/reordered/new lines.
 reset();db().stoklar=[];
 const line=(mm)=>({material:'ST37',mm,en:1500,boy:3000,quantity:1,weight:100,price:37.5,tax:0});
 const purchase=extra=>({token:'purchase',cariId:100,lines:[line(8),line(10),line(12)],date:'2026-10-04',payment:'none',...extra});
 r=await w.commitSheetPurchase(purchase());assert(r.success,r.error);const m=r.movement,codes=m.sheetPurchase.lines.map(l=>l.stockCode),nextBefore=db().ayarlar.numaralandirma.stok.next;
 w.openEditSheetPurchase(m);const rows=[...d.querySelectorAll('.sheet-purchase-line')];rows[1].remove();w.addSheetPurchaseLine(line(20));
 const form=w.sheetPurchaseInput();r=await w.commitSheetPurchase(form,m.id);assert(r.success,r.error);
 assert.equal(r.movement.sheetPurchase.lines[0].stockCode,codes[0]);assert.equal(r.movement.sheetPurchase.lines[1].stockCode,codes[2]);assert(!codes.includes(r.movement.sheetPurchase.lines[2].stockCode));assert.equal(db().ayarlar.numaralandirma.stok.next,nextBefore+1);
 assert.equal(w.buildAccountCheckReport().findings.length,0);
 const before=JSON.stringify(db()),invalid=purchase({token:'invalid',lines:[{...line(8),existingStockId:999}]});assert(!(await w.commitSheetPurchase(invalid,r.movement.id)).success);assert.equal(JSON.stringify(db()),before);
 if(process.env.LAZER_IDENTITY_CHECK_FILE){
  const raw=JSON.parse(fs.readFileSync(process.env.LAZER_IDENTITY_CHECK_FILE,'utf8')),before=JSON.stringify(raw),updated=w.migrateDatabase(raw);
  for(const key of ['islemler','kasaHesaplari','kasaHareketleri','faturalar','hizliSatislar','isEmirleri','teklifler','stokHareketleri'])assert.equal(JSON.stringify(updated[key]),JSON.stringify(raw[key]),key);
  assert.equal(updated.stoklar.length,raw.stoklar.length);
  assert.equal(JSON.stringify(updated.cariler.map(({kodu,codeAliases,...rest})=>rest)),JSON.stringify(raw.cariler.map(({kodu,codeAliases,...rest})=>rest)));
  updated.stoklar.forEach((s,i)=>{for(const key of ['id','miktar','kg','maliyet','mm','en','boy','isPasif','cutVoided'])assert.equal(s[key],raw.stoklar[i][key],key);});
  assert.equal(JSON.stringify(w.buildAccountCheckReport(updated).findings),JSON.stringify(w.buildAccountCheckReport(raw).findings));
  assert.equal(JSON.stringify(raw),before);
  console.log('Existing data read-only verification passed:',JSON.stringify(updated.stoklar.filter(s=>s.originCutId&&!s.isPasif).map(s=>({old:s.identityMigration.previousCode,code:s.kodu,part:s.partNo,quantity:s.miktar,kg:s.kg}))));
 }
 dom.window.close();console.log('Stock identity: stable codes, distinct physical pieces, nested cut/undo, serials, legacy migration, cycles, retained quotes, reservations and multi-line purchase corrections passed.');
})().catch(e=>{console.error(e);process.exit(1)});
