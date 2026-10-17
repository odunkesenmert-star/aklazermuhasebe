const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://cut-sale.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.alert=()=>{};w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'); const reset=()=>w.eval("db=createEmptyDatabase();db.stoklar=[{id:10,kodu:'STK-10',cinsi:'ST37',en:1500,boy:3000,mm:10,miktar:1,kg:353.25,maliyet:1000,sahibiTipi:'biz'}];db.stokHareketleri=[{id:1,stokId:10,tip:'Stok Girişi',alan:'miktar',miktar:1,onceki:0,sonraki:1},{id:2,stokId:10,tip:'Stok Girişi',alan:'kg',miktar:353.25,onceki:0,sonraki:353.25}]");
 let n=0;const input=(extra={})=>({token:'sale-cut-'+(++n),description:'2 delikli parça',total:1800,cashId:1,date:'2026-10-03',tax:0,stockId:10,unit:'miktar',quantity:1,cut:{en:1500,boy:800,pieces:[{en:1500,boy:2200,quantity:1}]},...extra});
 reset();let r=await w.commitQuickSale(input());assert(r.success,r.error);let sale=r.sale;
 assert.equal(db().stoklar[0].miktar,0);assert.equal(db().stoklar[0].kg,0);assert.equal(db().stoklar[1].miktar,1);assert.equal(db().stoklar[1].kg,259.05);assert.equal(db().kasaHesaplari[0].bakiye,1800);assert.equal(w.buildAccountCheckReport().findings.length,0);
 assert(!(await w.commitSheetCut(null,sale.sheetCutId)).success,'Cannot detach sale cut');
 r=await w.commitQuickSale(input({total:1900}),sale.id);assert(r.success,r.error);assert.equal(db().hizliSatislar[0].correctedBy,r.sale.id);sale=r.sale;assert.equal(db().kasaHesaplari[0].bakiye,1900);assert.equal(db().stoklar.filter(s=>s.originCutId&&!s.isPasif).length,1);assert.equal(w.buildAccountCheckReport().findings.length,0);
 let snapshot=JSON.stringify(db());assert(!(await w.commitQuickSale(input({token:sale.submitToken}))).success);assert.equal(JSON.stringify(db()),snapshot);
 const piece=db().stoklar.find(s=>s.originCutId&&!s.isPasif);
 r=await w.commitQuickSale(input({stockId:piece.id,cut:null,total:100}));assert(r.success,r.error);const child=r.sale;snapshot=JSON.stringify(db());assert(!(await w.commitQuickSale(null,sale.id,true)).success);assert.equal(JSON.stringify(db()),snapshot);
 assert((await w.commitQuickSale(null,child.id,true)).success);assert((await w.commitQuickSale(null,sale.id,true)).success);assert.equal(db().stoklar[0].miktar,1);assert.equal(db().stoklar[0].kg,353.25);assert.equal(db().kasaHesaplari[0].bakiye,0);assert.equal(w.buildAccountCheckReport().findings.length,0);
 reset();snapshot=JSON.stringify(db());for(const extra of [{quantity:1.5},{quantity:2},{stockId:''},{cut:{en:1600,boy:3100,pieces:[]}},{cut:{en:1500,boy:800,pieces:[{en:1500,boy:2500,quantity:1}]}}]){assert(!(await w.commitQuickSale(input(extra))).success);assert.equal(JSON.stringify(db()),snapshot);}
 w.electronAPI={saveDBToFile:async()=>({success:false,error:'disk'})};assert(!(await w.commitQuickSale(input())).success);assert.equal(JSON.stringify(db()),snapshot);w.electronAPI={};
 // Regression: partial cuts without remnants must never silently consume the whole plate.
 reset();snapshot=JSON.stringify(db());
 for(const cut of [{en:250,boy:630,pieces:[]},{en:250,boy:630,remainderMode:'manual',pieces:[]},{en:250,boy:630,remainderMode:'bad',pieces:[]}]) {
  r=await w.commitQuickSale(input({cut}));assert(!r.success);assert.equal(JSON.stringify(db()),snapshot);
 }
 // Reproduce the user's exact source and dimensions, without pressing a calculate button.
 w.eval("db.stoklar[0].boy=5760;db.stoklar[0].kg=678.24;db.stokHareketleri[1].miktar=db.stokHareketleri[1].sonraki=678.24;db.stoklar[0].maliyet=37.5");
 w.openQuickSale();const set=(id,v)=>d.getElementById('quick-sale-'+id).value=v;
 for(const [key,value] of Object.entries({stock:10,mode:'cut',quantity:1,'cut-en':250,'cut-boy':630,description:'10MM 1 ADET TAP 4 ADET PARÇA',total:1250,cash:1}))set(key,value);
 w.updateQuickSaleStockHint();
 assert.equal(d.querySelectorAll('#quick-sale-cut-rows .sheet-cut-row').length,2);
 assert.equal(d.querySelector('#quick-sale-cut-rows [data-field="boy"]').value,'5130');
 await w.saveQuickSale();sale=db().hizliSatislar[0];assert(sale);assert.equal(sale.cut.remainderMode,'auto');
 assert.equal(db().sacKesimleri[0].pieces.length,2);assert.equal(db().stoklar[1].kg,604.06);assert.equal(db().stoklar[2].kg,61.82);
 assert.equal(db().stoklar[1].kodu,db().stoklar[0].kodu);assert.equal(db().stoklar[1].maliyet,37.5);
 assert.equal(db().kasaHesaplari[0].bakiye,1250);assert.equal(w.buildAccountCheckReport().findings.length,0);
 w.openQuickSale(sale.id);assert.equal(d.querySelectorAll('#quick-sale-cut-rows .sheet-cut-row').length,2);
 set('cut-boy',700);w.updateQuickSaleWeight();assert.equal(d.querySelector('#quick-sale-cut-rows [data-field="boy"]').value,'5060');
 // Manual measurements remain editable and are preserved on every preview update.
 set('remainder-mode','manual');w.updateQuickSaleRemainderMode();
 const field=d.querySelector('#quick-sale-cut-rows [data-field="boy"]');field.value=5000;field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(field.value,'5000');assert.equal(field.readOnly,false);
 assert((await w.commitQuickSale(null,sale.id,true)).success);assert.equal(db().stoklar[0].kg,678.24);assert.equal(db().stoklar[0].miktar,1);
 // Domain calculations also generate remnants when callers provide no precomputed rows.
 reset();w.eval('db.stoklar[0].miktar=2;db.stoklar[0].kg=706.5;db.stokHareketleri[0].miktar=db.stokHareketleri[0].sonraki=2;db.stokHareketleri[1].miktar=db.stokHareketleri[1].sonraki=706.5');
 r=await w.commitQuickSale(input({quantity:2,cut:{en:3000,boy:800,remainderMode:'auto',pieces:[]}}));assert(r.success,r.error);
 assert.equal(r.sale.cut.pieces[0].en,700);assert.equal(r.sale.cut.pieces[0].boy,3000);assert.equal(r.sale.cut.pieces[0].quantity,2);
 assert.equal(db().stoklar[1].kg,329.7);assert.equal(w.buildAccountCheckReport().findings.length,0);
 // Full plate usage needs no remnants; intentionally discarded leftovers require an explicit choice.
 reset();r=await w.commitQuickSale(input({cut:{en:1500,boy:3000,remainderMode:'auto',pieces:[]}}));assert(r.success,r.error);assert.equal(db().sacKesimleri[0].pieces.length,0);
 reset();r=await w.commitQuickSale(input({cut:{en:250,boy:630,remainderMode:'none',pieces:[]}}));assert(r.success,r.error);assert.equal(db().sacKesimleri[0].pieces.length,0);assert.equal(r.sale.cut.remainderMode,'none');
 reset();snapshot=JSON.stringify(db());r=await w.commitQuickSale(input({cut:{en:250,boy:630,remainderMode:'none',pieces:[{en:100,boy:100,quantity:1}]}}));assert(!r.success);assert.equal(JSON.stringify(db()),snapshot);
 // No misleading remaining-KG preview in explicit no-remnant mode.
 w.openQuickSale();for(const [key,value] of Object.entries({stock:10,mode:'cut',quantity:1,'cut-en':250,'cut-boy':630}))set(key,value);
 w.updateQuickSaleStockHint();set('remainder-mode','none');w.updateQuickSaleRemainderMode();assert.equal(d.querySelectorAll('#quick-sale-cut-rows .sheet-cut-row').length,0);assert(d.getElementById('quick-sale-weight-summary').textContent.includes('0,00 kg'));
 console.log('Measured quick sales: dimensions, remainder, correction, cancellation, dependencies, atomic failure, and actual form passed.');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
