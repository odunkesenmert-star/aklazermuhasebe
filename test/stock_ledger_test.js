const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://ledger.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.alert=()=>{};w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),set=(id,v)=>{d.getElementById(id).value=v;};
 const reset=()=>w.eval("db=createEmptyDatabase();db.cariler=[{id:10,kodu:'C-10',adi:'Tedarikçi',tip:'tedarikci',bakiye:0,ledgerOpeningBalance:0}]");
 const findings=()=>w.buildAccountCheckReport().findings;
 const kgSum=id=>w.roundMoney(db().stokHareketleri.filter(m=>m.stokId===id&&m.alan==='kg').reduce((n,m)=>n+m.miktar,0));
 let n=0;const tok=()=>'ledger-'+(++n);

 // Manually entered stock records its weight, so KG history starts from zero.
 reset();
 for(const [id,v] of Object.entries({'input-stok-sahibi':'biz','input-stok-cinsi':'ST37','input-stok-mm':2,'input-stok-miktar':2,'input-stok-kg':60,'input-stok-en':1000,'input-stok-boy':2000,'input-stok-maliyet':40}))set(id,v);
 w.saveStok();let stock=db().stoklar[0];
 assert.equal(stock.kg,60);assert.equal(kgSum(stock.id),60);assert.equal(findings().length,0,JSON.stringify(findings()));

 // Editing the weight writes a KG correction movement.
 w.openStokDuzenleModal(stock.id);set('input-duzenle-stok-kg',58);w.updateStok();
 assert.equal(stock.kg,58);assert.equal(kgSum(stock.id),58);assert(db().stokHareketleri.some(m=>m.tip==='Stok Düzeltme'&&m.alan==='kg'&&m.miktar===-2));assert.equal(findings().length,0,JSON.stringify(findings()));

 // Weight cannot go below KG reserved by open orders.
 db().isEmirleri.push({id:77,stokId:stock.id,islemTipi:'hammadde',kgAmount:29,durum:'Beklemede'});
 w.openStokDuzenleModal(stock.id);set('input-duzenle-stok-kg',20);w.updateStok();assert.equal(stock.kg,58);w.renderStoklar();assert(d.getElementById('inventory-tbody').textContent.includes('Rezerve: 29 KG | Kullanılabilir: 29 KG'));db().isEmirleri.pop();
 // Deleting stock closes both the plate and the KG history.
 w.deleteStok(stock.id);assert(!db().stoklar.some(s=>s.id===stock.id));assert(db().stokHareketleri.some(m=>m.tip==='Stok Silindi'&&m.alan==='kg'&&m.miktar===-58));

 // KG sale from purchased plates: plate and KG move together and share the sale date; cancel restores both.
 reset();
 let r=await w.commitSheetPurchase({token:tok(),cariId:10,material:'ST37',mm:2,en:1000,boy:2000,quantity:2,weight:30,price:40,tax:0,date:'2026-10-10',payment:'none'});assert(r.success,r.error);
 stock=db().stoklar[0];
 r=await w.commitQuickSale({token:tok(),description:'15 kg sac',name:'',total:600,cashId:1,date:'2026-10-11',tax:20,stockId:stock.id,quantity:15,unit:'kg'});assert(r.success,r.error);
 stock=db().stoklar[0];assert.equal(stock.kg,15);assert.equal(stock.miktar,1);
 const saleMoves=db().stokHareketleri.filter(m=>m.ref===r.sale.satisNo);assert.equal(saleMoves.length,2);assert(saleMoves.every(m=>m.tarih===r.sale.tarih));assert.equal(findings().length,0,JSON.stringify(findings()));
 assert((await w.commitQuickSale(null,r.sale.id,true)).success);stock=db().stoklar[0];assert.equal(stock.kg,30);assert.equal(stock.miktar,2);assert.equal(findings().length,0,JSON.stringify(findings()));

 // The sale form states plainly when a sale will not change stock.
 w.openQuickSale();assert(d.getElementById('quick-sale-stock-details').open);
 assert(d.getElementById('quick-sale-summary').textContent.includes('Malzeme seçilmedi: stok miktarı değişmeyecek.'));
 set('quick-sale-stock',String(stock.id));w.updateQuickSaleStockHint();assert(d.getElementById('quick-sale-summary').textContent.includes('miktar girilmedi'));
 set('quick-sale-unit','kg');set('quick-sale-quantity',15);d.getElementById('quick-sale-quantity').dispatchEvent(new w.Event('input'));
 assert(d.getElementById('quick-sale-summary').textContent.includes('Stoktan düşülecek: 15 KG'));

 // Legacy data whose first KG movement starts from a non-zero value is surfaced for review.
 reset();db().stoklar.push({id:5,kodu:'STK-X',cinsi:'ST37',mm:10,miktar:0,kg:0,sahibiTipi:'biz'});
 db().stokHareketleri.push({id:6,stokId:5,tip:'Sac Kesimi',alan:'kg',miktar:-710,onceki:710,sonraki:0});
 const legacy=findings();assert.equal(legacy.length,1);assert.equal(legacy[0].severity,'review');assert(legacy[0].detail.includes('İlk KG girişi'));

 console.log('Stock ledger: manual KG entry/edit history, KG reservation guard, paired sale movements, no-stock sale warning and legacy gap detection passed.');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
