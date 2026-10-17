const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://stock-consistency.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document,alerts=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),copy=x=>JSON.parse(JSON.stringify(x));
 const reset=()=>{alerts.length=0;w.eval("db=createEmptyDatabase();db.stoklar=[{id:10,kodu:'STK-8MM-01',cinsi:'ST37',en:1500,boy:3000,mm:8,miktar:2,kg:565.2,maliyet:37.5,sahibiTipi:'biz',weightBasis:'estimate'}];db.stokHareketleri=[{id:1,stokId:10,tip:'Stok Girişi',alan:'miktar',miktar:2,onceki:0,sonraki:2},{id:2,stokId:10,tip:'Stok Girişi',alan:'kg',miktar:565.2,onceki:0,sonraki:565.2}]");};
 let counter=0;const input=extra=>({token:'consistency-'+(++counter),description:'Sac satışı',total:1000,cashId:1,date:'2026-10-07',tax:0,stockId:10,unit:'miktar',quantity:1,...extra});
 const order=(extra={})=>({id:20,orderNo:'EMR-20',stokId:10,stokQty:1,islemTipi:'lazer',durum:'Beklemede',customerId:'internal',total:0,...extra});
 const status=value=>{d.getElementById('input-order-id').value=20;d.getElementById('input-order-status').value=value;w.updateOrderStatus();};
 reset();let r=await w.commitQuickSale(input());assert(r.success,r.error);assert.equal(db().stoklar[0].miktar,1);assert.equal(db().stoklar[0].kg,282.6);assert.equal(r.sale.stockKg,282.6);assert.equal(w.buildAccountCheckReport().findings.length,0);
 r=await w.commitQuickSale(input({quantity:2}),r.sale.id);assert(r.success,r.error);assert.equal(db().stoklar[0].miktar,0);assert.equal(db().stoklar[0].kg,0);
 assert((await w.commitQuickSale(null,r.sale.id,true)).success);assert.equal(db().stoklar[0].kg,565.2);assert.equal(db().stoklar[0].miktar,2);assert.equal(w.buildAccountCheckReport().findings.length,0);
 reset();r=await w.commitQuickSale(input({unit:'kg',quantity:282.6}));assert(r.success,r.error);assert.equal(db().stoklar[0].miktar,1);assert.equal(db().stoklar[0].kg,282.6);assert.equal(r.sale.stockPlateQty,1);assert.equal(w.buildAccountCheckReport().findings.length,0);
 assert((await w.commitQuickSale(null,r.sale.id,true)).success);assert.equal(db().stoklar[0].kg,565.2);assert.equal(db().stoklar[0].miktar,2);
 reset();let before=JSON.stringify(db());for(const extra of [{quantity:.5},{unit:'kg',quantity:100},{unit:'kg',quantity:565.19}]){assert(!(await w.commitQuickSale(input(extra))).success);assert.equal(JSON.stringify(db()),before);}
 reset();db().isEmirleri.push(order());assert.equal(w.getReservedStockQuantity(10,'kg'),282.6);assert.equal(w.getAvailableStockQuantity(db().stoklar[0],'kg'),282.6);
 assert(!(await w.commitQuickSale(input({unit:'kg',quantity:565.2}))).success);status('Teslim Edildi');assert.equal(db().stoklar[0].kg,282.6);assert.equal(db().stoklar[0].miktar,1);assert.equal(db().isEmirleri[0].stokDusulenKg,282.6);assert.equal(w.buildAccountCheckReport().findings.length,0);
 // A later linked cutting entry uses the weight already deducted by delivery exactly once.
 r=await w.commitSheetCut({token:'delivered-cut',stockId:10,orderId:20,quantity:1,weight:282.6,scrapKg:0,pieces:[{en:1500,boy:2000,quantity:1}]});assert(r.success,r.error);assert.equal(db().stoklar[0].kg,282.6);assert.equal(db().stoklar[1].kg,188.4);
 assert((await w.commitSheetCut(null,r.cut.id)).success);assert.equal(db().stoklar[0].kg,282.6);status('İptal');assert.equal(db().stoklar[0].kg,565.2);assert.equal(db().stoklar[0].miktar,2);
 reset();db().isEmirleri.push(order({islemTipi:'hammadde',kgAmount:282.6}));assert.equal(w.getReservedStockQuantity(10),1);assert.equal(w.getAvailableStockQuantity(db().stoklar[0]),1);
 assert(!(await w.commitQuickSale(input({quantity:2}))).success);status('Teslim Edildi');assert.equal(db().stoklar[0].kg,282.6);assert.equal(db().stoklar[0].miktar,1);status('İptal');assert.equal(db().stoklar[0].miktar,2);assert.equal(db().stoklar[0].kg,565.2);
 // Confirmation may remain open while stock changes: revalidate before financial mutation.
 reset();db().cariler.push({id:100,adi:'Müşteri',bakiye:0,ledgerOpeningBalance:0});db().isEmirleri.push(order({customerId:100,customerName:'Müşteri',total:100}));let confirm;w.confirmAction=(_,fn)=>{confirm=fn};status('Teslim Edildi');assert(confirm);db().stoklar[0].miktar=0;db().stoklar[0].kg=0;before=JSON.stringify(db());confirm();assert.equal(JSON.stringify(db()),before);assert(alerts.length);
 // Deleted/inactive sources cannot deliver an order or charge a customer.
 reset();db().isEmirleri.push(order());db().stoklar[0].isPasif=true;before=JSON.stringify(db());status('Teslim Edildi');assert.equal(JSON.stringify(db()),before);
 // Audit catches broken quantity chains, paired movement loss and historical missing KG.
 reset();db().isEmirleri.push(order());status('Teslim Edildi');let bad=copy(db());bad.stokHareketleri=bad.stokHareketleri.filter(m=>m.alan!=='kg');assert(w.buildStockCheckFindings(bad).some(f=>f.detail.includes('bağlı plaka')));
 bad=copy(db());bad.stoklar[0].kg=565.2;delete bad.isEmirleri[0].stokDusulenKg;assert(w.buildStockCheckFindings(bad).some(f=>f.detail.includes('KG düşümü')));assert(w.buildStockCheckFindings(bad).some(f=>f.detail.includes('son stok hareketi')));
 reset();r=await w.commitQuickSale(input());bad=copy(db());bad.stokHareketleri=bad.stokHareketleri.filter(m=>m.id!==r.sale.stockKgMovementId);assert(w.getQuickSaleLinkError(bad.hizliSatislar[0],bad).includes('plaka / KG'));
 // Historical empty remnant records are reported but can still be cancelled safely.
 reset();r=await w.commitQuickSale(input({cut:{en:250,boy:630,remainderMode:'none',pieces:[]}}));assert(r.success,r.error);delete db().hizliSatislar[0].cut.remainderMode;assert(w.buildAccountCheckReport().findings.some(f=>f.detail.includes('kalan parçaları')));assert((await w.commitQuickSale(null,r.sale.id,true)).success);assert.equal(db().stoklar[0].kg,565.2);
 // Persistent save failure leaves count, KG, accounting and numbering unchanged.
 reset();before=JSON.stringify(db());w.electronAPI={saveDBToFile:async()=>({success:false,error:'disk'})};assert(!(await w.commitQuickSale(input())).success);assert.equal(JSON.stringify(db()),before);
 if(process.env.LAZER_STOCK_AUDIT_FILE){const actual=JSON.parse(fs.readFileSync(process.env.LAZER_STOCK_AUDIT_FILE,'utf8'));console.log('Actual-data read-only audit:',JSON.stringify(w.buildAccountCheckReport(actual).findings));}
 dom.window.close();console.log('Stock consistency: sheet count/KG pairs, cancellation, linked cuts, mixed-unit reservations, stale confirmation, audit detection and save rollback passed.');
})().catch(e=>{console.error(e);process.exit(1)});
