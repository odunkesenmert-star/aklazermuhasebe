const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://cut-sale.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.alert=()=>{};w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'); const reset=()=>w.eval("db=createEmptyDatabase();db.stoklar=[{id:10,kodu:'STK-10',cinsi:'ST37',en:1500,boy:3000,mm:10,miktar:1,kg:353.25,maliyet:1000,sahibiTipi:'biz'}];db.stokHareketleri=[{id:1,stokId:10,tip:'Stok Girişi',alan:'miktar',miktar:1,onceki:0,sonraki:1}]");
 let n=0;const input=(extra={})=>({token:'sale-cut-'+(++n),description:'2 delikli parça',total:1800,cashId:1,date:'2026-10-03',tax:0,stockId:10,unit:'miktar',quantity:1,cut:{en:1500,boy:800,pieces:[{en:1500,boy:2200,quantity:1}]},...extra});
 reset();db().stoklar[0].kg=0;
 assert.equal(w.sheetWeightBasis(db().stoklar[0]).total,353.25);
 assert.equal(w.sheetWeightBasis({...db().stoklar[0],cinsi:'Alüminyum'}).total,121.5);
 assert.equal(w.sheetWeightBasis({...db().stoklar[0],cinsi:'Paslanmaz 304'}).total,355.5);
 assert.throws(()=>w.sheetWeightBasis({...db().stoklar[0],cinsi:'Bilinmeyen'}));
 assert.equal(w.sheetWeightBasis({...db().stoklar[0],cinsi:'Bilinmeyen'},'7850').total,353.25);
 assert.equal(w.sheetWeightBasis({...db().stoklar[0],kg:360}).total,360);
 let r=await w.commitQuickSale(input());assert(r.success,r.error);let sale=r.sale;
 assert.equal(db().stoklar[0].kg,0);assert.equal(db().stoklar[0].weightBasis,'estimate');assert.equal(db().stoklar[1].kg,259.05);assert.equal(db().stoklar[1].weightBasis,'estimate');
 assert.equal(w.buildAccountCheckReport().findings.length,0);
 w.openQuickSale(sale.id);assert(d.getElementById('quick-sale-weight-summary').textContent.includes('259,05'));
 assert((await w.commitQuickSale(null,sale.id,true)).success);assert.equal(db().stoklar[0].kg,353.25);
 reset();r=await w.commitQuickSale(input({cut:{en:1500,boy:800,remainingKg:255,pieces:[{en:1500,boy:2200,quantity:1}]}}));assert(r.success,r.error);assert.equal(db().stoklar[1].kg,255);assert.equal(db().stoklar[1].weightBasis,'manual');
 assert((await w.commitQuickSale(null,r.sale.id,true)).success);assert.equal(db().stoklar[0].kg,353.25);
 reset();let snapshot=JSON.stringify(db());for(const remainingKg of [-1,0,354,'NaN',Infinity]){assert(!(await w.commitQuickSale(input({cut:{en:1500,boy:800,remainingKg,pieces:[{en:1500,boy:2200,quantity:1}]}}))).success);assert.equal(JSON.stringify(db()),snapshot);}
 reset();db().stoklar[0].kg=0;snapshot=JSON.stringify(db());w.electronAPI={saveDBToFile:async()=>({success:false,error:'disk'})};assert(!(await w.commitQuickSale(input())).success);assert.equal(JSON.stringify(db()),snapshot);w.electronAPI={};
 w.openQuickSale();const set=(id,v)=>d.getElementById('quick-sale-'+id).value=v;set('stock',10);set('mode','cut');set('quantity',1);set('cut-en',1500);set('cut-boy',800);w.updateQuickSaleStockHint();w.suggestQuickSaleRemainders();assert(d.getElementById('quick-sale-weight-summary').textContent.includes('259,05'));assert(d.getElementById('quick-sale-weight-summary').textContent.includes('94,20'));set('cut-remaining-kg',255);w.updateQuickSaleWeight();assert(d.getElementById('quick-sale-weight-summary').textContent.includes('255,00'));set('description','test');set('total',1800);set('cash',1);await w.saveQuickSale();assert.equal(db().stoklar[1].kg,255);
 reset();db().stoklar[0].kg=0;w.openSheetCut(10);assert.equal(d.getElementById('sheet-cut-weight').value,'353.25');const row=d.querySelector('#sheet-cut-rows');row.querySelector('[data-field=en]').value=1500;row.querySelector('[data-field=boy]').value=2200;await w.saveSheetCut();assert.equal(db().stoklar[1].kg,259.05);
 for(const [key,value] of Object.entries({cinsi:'ST37',en:1500,boy:3000,mm:10,miktar:2}))d.getElementById('input-stok-'+key).value=value;
 assert(w.calculateNewSheetWeight(true));assert.equal(d.getElementById('input-stok-kg').value,'706.5');
 console.log('Sheet weight: density, recorded KG priority, manual remainder, preview, missing KG initialization, undo, disk rollback and entry calculator passed.');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
