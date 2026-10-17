const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://sheet-cut.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document,alerts=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db');
 const reset=()=>{w.eval(`db=createEmptyDatabase();db.stoklar=[{id:10,kodu:'STK-10',cinsi:'DKP Sac',en:1500,boy:3000,mm:2,ebat:'1500x3000',miktar:10,kg:1000,maliyet:1000,sahibiTipi:'biz',sahibi:'Biz',cariId:''}];`);};
 let n=0;const input=(extras={})=>({token:'cut-'+(++n),stockId:10,orderId:'',quantity:1,weight:100,scrapKg:5,note:'Raf A',pieces:[{en:1500,boy:800,quantity:1},{en:500,boy:400,quantity:2}],...extras});
 const commit=async(data,id)=>{const r=await w.commitSheetCut(data,id);assert(r.success,r.error);return r.cut;};
 reset();const initial=JSON.stringify(db());let cut=await commit(input());assert.equal(db().stoklar[0].miktar,9);assert.equal(db().stoklar[0].kg,900);assert.equal(db().stoklar.length,3);assert.equal(db().fireler[0].kg,5);assert.equal(db().islemler.length,0,'A cut is not another financial purchase/sale');
 assert.equal(db().stoklar[1].cinsi,'DKP Sac');assert.equal(db().stoklar[1].mm,2);assert.equal(db().stoklar[1].miktar,1);assert.equal(db().stoklar[2].miktar,2);assert.equal(db().stoklar[1].kg,26.67);assert.equal(db().stoklar[1].maliyet,1000);
 assert.equal(db().stoklar[1].kodu,'STK-10');assert.equal(db().stoklar[2].kodu,'STK-10');assert.notEqual(db().stoklar[1].partNo,db().stoklar[2].partNo);assert.equal(db().stoklar[1].originCutId,cut.id);
 w.updateQuoteMaterials();assert([...d.getElementById('quote-material').options].some(o=>o.value==cut.pieces[0].stockId&&o.textContent.includes('1500x800')));
 const snapshot=JSON.stringify(db());assert(!(await w.commitSheetCut(input({token:cut.submitToken}))).success);assert.equal(JSON.stringify(db()),snapshot);
 w.deleteStok(10);w.deleteStok(cut.pieces[0].stockId);w.deleteFire(cut.scrapId);assert.equal(JSON.stringify(db()),snapshot);
 // Chained cutting, dependency protection, and reverse-order undo.
 const child=await commit(input({stockId:cut.pieces[0].stockId,weight:26.67,scrapKg:1,pieces:[{en:600,boy:800,quantity:1}]}));
 assert.equal(db().stoklar.find(s=>s.id===cut.pieces[0].stockId).miktar,0);
 assert(!(await w.commitSheetCut(null,cut.id)).success,'Parent cannot be restored while its remnants are used');
 await commit(null,child.id);await commit(null,cut.id);assert.equal(db().stoklar[0].miktar,10);assert.equal(db().stoklar[0].kg,1000);assert.equal(db().fireler.length,0);
 assert(db().stoklar.slice(1).every(s=>s.miktar===0&&s.cutVoided));const undone=JSON.stringify(db());assert(!(await w.commitSheetCut(null,cut.id)).success);assert.equal(JSON.stringify(db()),undone);
 w.updateQuoteMaterials();assert(![...d.getElementById('quote-material').options].some(o=>o.value==cut.pieces[0].stockId));
 // Geometry, ownership inheritance, stock reservation, and invalid numeric input.
 reset();const original=JSON.stringify(db());
 for(const extra of [{quantity:0},{quantity:1.5},{quantity:11},{weight:-1},{weight:0},{weight:1001},{scrapKg:101},{pieces:[{en:2000,boy:3500,quantity:1}]},{pieces:[{en:1500,boy:3000,quantity:1}]},{pieces:[{en:1000,boy:1000,quantity:5}]},{pieces:[{en:10,boy:10,quantity:-1}]},{pieces:[{en:'nan',boy:10,quantity:1}]}]){const r=await w.commitSheetCut(input(extra));assert(!r.success,JSON.stringify(extra));assert.equal(JSON.stringify(db()),original);}
 db().isEmirleri.push({id:20,stokId:10,stokQty:10,durum:'Beklemede',orderNo:'EMR-20',customerId:'internal',islemTipi:'lazer',total:0,tarih:'02.10.2026'});
 assert(!(await w.commitSheetCut(input())).success);cut=await commit(input({orderId:20,quantity:10,weight:1000}));assert.equal(db().stoklar[0].miktar,0);assert.equal(db().isEmirleri[0].stokDusuldu,true);
 const status=(id,status)=>{d.getElementById('input-order-id').value=id;d.getElementById('input-order-status').value=status;w.updateOrderStatus();};
 status(20,'Teslim Edildi');assert.equal(db().isEmirleri[0].durum,'Teslim Edildi');assert.equal(db().stoklar[0].miktar,0,'Delivery does not deduct a second time');
 status(20,'İptal');assert.equal(db().isEmirleri[0].durum,'Teslim Edildi','Active cut prevents unsafe order cancellation');
 await commit(null,cut.id);assert.equal(db().stoklar[0].miktar,0,'Undo preserves a now-delivered order deduction');assert.equal(db().stoklar[0].kg,0);
 status(20,'İptal');assert.equal(db().stoklar[0].miktar,10);assert.equal(db().stoklar[0].kg,1000);assert.equal(db().isEmirleri[0].durum,'İptal');
 // A previously delivered order already removed the plate; legacy weight is explicit.
 reset();db().stoklar[0].miktar=9;db().isEmirleri.push({id:21,stokId:10,stokQty:1,stokDusuldu:true,stokDusulenMiktar:1,stokDusulenAlan:'miktar',durum:'Teslim Edildi',customerId:'internal',orderNo:'EMR-21',total:0});
 cut=await commit(input({orderId:21}));assert.equal(db().stoklar[0].miktar,9);assert.equal(db().stoklar[0].kg,900);assert(!(await w.commitSheetCut(input({orderId:21}))).success);
 await commit(null,cut.id);assert.equal(db().stoklar[0].miktar,9);assert.equal(db().stoklar[0].kg,1000);
 // Previously deducted remainder weight must not be deducted again.
 reset();db().stoklar[0].miktar=0;db().stoklar[0].kg=0;db().isEmirleri.push({id:22,stokId:10,stokQty:1,stokDusuldu:true,stokDusulenMiktar:1,stokDusulenAlan:'miktar',stokDusulenKg:100,durum:'Teslim Edildi',customerId:'internal',orderNo:'EMR-22',total:0});
 cut=await commit(input({orderId:22}));assert.equal(db().stoklar[0].kg,0);await commit(null,cut.id);assert.equal(db().stoklar[0].kg,0);
 // A remnant used by a later order loses its count and KG once, and restores both on cancellation.
 reset();cut=await commit(input());let childPiece=cut.pieces[0];
 db().isEmirleri.push({id:23,stokId:childPiece.stockId,stokQty:1,durum:'Beklemede',customerId:'internal',orderNo:'EMR-23',islemTipi:'lazer',total:0});
 status(23,'Teslim Edildi');assert.equal(db().stoklar.find(s=>s.id===childPiece.stockId).miktar,0);assert.equal(db().stoklar.find(s=>s.id===childPiece.stockId).kg,0);
 status(23,'İptal');assert.equal(db().stoklar.find(s=>s.id===childPiece.stockId).kg,childPiece.kg);await commit(null,cut.id);
 // Before delivery, undo returns the source and reopens its order reservation.
 reset();db().isEmirleri.push({id:24,stokId:10,stokQty:1,durum:'Beklemede',customerId:'internal',orderNo:'EMR-24',islemTipi:'lazer',total:0});cut=await commit(input({orderId:24}));await commit(null,cut.id);assert.equal(db().stoklar[0].miktar,10);assert.equal(db().stoklar[0].kg,1000);assert.equal(db().isEmirleri[0].stokDusuldu,false);assert.equal(w.getReservedStockQuantity(10),1);
 assert.equal(w.buildAccountCheckReport().findings.filter(f=>f.category==='Sac Kesimi').length,0);
 // Emanet ownership stays attached to the original owner.
 reset();db().cariler.push({id:1,adi:'Müşteri',bakiye:0});Object.assign(db().stoklar[0],{sahibiTipi:'musteri',sahibi:'Müşteri',cariId:1,maliyet:0});cut=await commit(input());const rem=db().stoklar.find(s=>s.id===cut.pieces[0].stockId);assert.equal(rem.cariId,1);assert.equal(rem.sahibiTipi,'musteri');assert.equal(rem.maliyet,0);
 // Quick sales and their cancellation keep remainder count and KG together.
 reset();cut=await commit(input());let piece=cut.pieces[0];let sale=await w.commitQuickSale({token:'rem-sale',stockId:piece.stockId,quantity:1,unit:'miktar',total:120,tax:20,cashId:1,date:'2026-10-02',description:'Kalan parça',name:''});assert(sale.success,sale.error);assert.equal(db().stoklar.find(s=>s.id===piece.stockId).kg,0);assert(!(await w.commitSheetCut(null,cut.id)).success);
 assert((await w.commitQuickSale(null,sale.sale.id,true)).success);assert.equal(db().stoklar.find(s=>s.id===piece.stockId).kg,piece.kg);await commit(null,cut.id);
 // Disk failure rolls back every stock, history, numbering and scrap change.
 reset();const before=JSON.stringify(db());w.electronAPI={saveDBToFile:async()=>({success:false,error:'disk dolu'})};let r=await w.commitSheetCut(input());assert(!r.success);assert.equal(JSON.stringify(db()),before);
 let resolve;w.electronAPI.saveDBToFile=()=>new Promise(r=>resolve=r);const pending=w.commitSheetCut(input());assert(!(await w.commitSheetCut(input())).success);assert(!(await w.commitQuickSale({})).success);resolve({success:true});assert((await pending).success);w.electronAPI={};
 assert.equal(w.validateAndNormalizeDB(JSON.parse(JSON.stringify(db()))).sacKesimleri.length,1);assert.equal(w.validateAndNormalizeDB({schemaVersion:5,stoklar:[]}).sacKesimleri.length,0);
 // Real form wiring, multiple rows, safe history and filtering.
 reset();w.openSheetCut(10);d.querySelector('#sheet-cut-rows [data-field="en"]').value='1500';d.querySelector('#sheet-cut-rows [data-field="boy"]').value='800';d.getElementById('sheet-cut-note').value='<img src=x>';await w.saveSheetCut();assert.equal(db().sacKesimleri.length,1);assert(!d.getElementById('modal-sheet-cut').classList.contains('active'));w.renderSheetCuts();assert(!d.querySelector('#sheet-cut-history img'));assert(d.getElementById('sheet-cut-history').textContent.includes('<img src=x>'));
 d.getElementById('sheet-cut-search').value='NO SUCH';w.renderSheetCuts();assert(d.getElementById('sheet-cut-history').textContent.includes('Henüz kesim'));
 dom.window.close();console.log('Sheet cutting: linked stock, geometry, reservations, ownership, order double-deduction, dependent undo, weight, cash sale, persistence rollback, migration and UI passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
