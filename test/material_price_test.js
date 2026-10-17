const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://material-price.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;const alerts=[];w.alert=m=>alerts.push(String(m));w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),set=(id,v)=>{const e=d.getElementById(id);e.value=String(v);return e;};
 const fire=(id,type='change')=>d.getElementById(id).dispatchEvent(new w.Event(type,{bubbles:true}));
 const price=()=>d.getElementById('quote-material-price').value,hint=()=>d.getElementById('quote-material-price-hint');
 w.eval(`db=createEmptyDatabase();
  db.cariler=[{id:10,kodu:'CAR-1',adi:'Güven Asansör',tip:'musteri',bakiye:0,ledgerOpeningBalance:0},{id:11,kodu:'CAR-2',adi:'Öztürk Makina',tip:'musteri',bakiye:0,ledgerOpeningBalance:0}];
  db.stoklar=[{id:5,kodu:'STK-3MM-01',cinsi:'ST37',mm:3,en:1500,boy:3000,ebat:'1500x3000',miktar:10,kg:1059.75,maliyet:37.5,sahibiTipi:'biz'},
   {id:7,kodu:'STK-3MM-09',cinsi:'ST37',mm:3,en:1500,boy:3000,ebat:'1500x3000',miktar:1,kg:105.975,maliyet:20,sahibiTipi:'musteri',cariId:10,sahibi:'Güven Asansör'}];
  db.stokHareketleri=[{id:1,stokId:5,tip:'Stok Girişi',alan:'miktar',miktar:10,onceki:0,sonraki:10},{id:2,stokId:5,tip:'Stok Girişi',alan:'kg',miktar:1059.75,onceki:0,sonraki:1059.75},
   {id:3,stokId:7,tip:'Stok Girişi',alan:'miktar',miktar:1,onceki:0,sonraki:1},{id:4,stokId:7,tip:'Stok Girişi',alan:'kg',miktar:105.975,onceki:0,sonraki:105.975}];`);
 const plateWeight=105.975;
 const choose=(type,customer,material)=>{w.eval('activeQuoteId=null;activeQuoteFingerprint=""');set('quote-type',type);w.updateQuoteTypeUI();w.renderCariler();set('quote-customer',customer);fire('quote-customer');w.updateQuoteMaterials();set('quote-material',material);fire('quote-material');};
 const laser=()=>{set('quote-material-qty',2);set('quote-minutes',60);set('quote-rate',30);set('quote-discount',0);set('quote-tax-rate',20);set('quote-description','Panel');};

 // Default margin is 0: the suggested price equals cost, so existing totals are unchanged.
 choose('lazer',10,5);assert.equal(price(),'37.5');assert(!d.getElementById('quote-material-price-group').hidden);
 // Default margin from settings.
 w.openAyarlarModal();set('input-ayar-malzeme-kar',20);w.saveAyarlar();assert.equal(db().ayarlar.karlilik.malzemeKarOrani,20);
 w.openAyarlarModal();set('input-ayar-malzeme-kar',-5);alerts.length=0;w.saveAyarlar();assert.equal(db().ayarlar.karlilik.malzemeKarOrani,20);assert(alerts.length);
 choose('lazer',10,5);assert.equal(price(),'45');assert(hint().textContent.includes('Maliyet ₺37,50/KG')&&hint().textContent.includes('maliyet + %20'));assert(!hint().classList.contains('is-warning'));

 // A typed price is used, saved and drives the material amount; cost stays for profitability.
 laser();set('quote-material-price',50);fire('quote-material-price','input');assert(hint().textContent.includes('Kâr %33,33'));
 w.calculateQuote();assert(d.getElementById('summary-mat').textContent.includes(w.formatCurrency(w.roundMoney(50*plateWeight)*2)));
 w.saveQuote();let quote=db().teklifler.at(-1);
 assert.equal(quote.materialKgPrice,50);assert.equal(quote.materialCostKg,37.5);assert.equal(quote.materialKey,'st37|3');assert.equal(quote.materialCost,w.roundMoney(w.roundMoney(50*plateWeight)*2));
 w.approveSavedQuoteAsOrder(quote.id);const order=db().isEmirleri.at(-1);
 assert.equal(order.costMaterial,w.roundMoney(37.5*plateWeight*2),'Profitability uses purchase cost');assert(order.grossProfit>0);

 // The same customer gets their last price again, even on a newer stock card with a different cost.
 w.eval("db.stoklar.push({id:6,kodu:'STK-3MM-02',cinsi:'st37 ',mm:'3',en:1500,boy:3000,ebat:'1500x3000',miktar:5,kg:529.875,maliyet:40,sahibiTipi:'biz'});db.stokHareketleri.push({id:8,stokId:6,tip:'Stok Girişi',alan:'miktar',miktar:5,onceki:0,sonraki:5},{id:9,stokId:6,tip:'Stok Girişi',alan:'kg',miktar:529.875,onceki:0,sonraki:529.875})");
 choose('lazer',10,6);assert.equal(price(),'50');assert(hint().textContent.includes('son fiyat ₺50,00/KG')&&hint().textContent.includes(quote.teklifNo));
 // Another customer has no history: cost of this card plus margin.
 choose('lazer',11,6);assert.equal(price(),'48');
 // Internal production uses cost.
 choose('lazer','internal',6);assert.equal(price(),'40');
 // Customer-owned material has no sale price.
 choose('lazer',10,7);assert(d.getElementById('quote-material-price-group').hidden);laser();w.calculateQuote();assert(d.getElementById('summary-mat').textContent.includes('0,00'));

 // Below-cost prices warn.
 choose('lazer',11,5);set('quote-material-price',30);fire('quote-material-price','input');assert(hint().classList.contains('is-warning')&&hint().textContent.includes('maliyetin altında'));
 set('quote-material-price',-1);fire('quote-material-price','input');laser();alerts.length=0;assert.equal(w.getQuoteData(),null);assert(alerts.at(-1).includes('Malzeme satış fiyatı'));

 // Raw material sales use the same memory on their KG price field and record it.
 choose('hammadde',10,5);assert.equal(d.getElementById('quote-kg-price').value,'50');assert(!d.getElementById('quote-kg-price-hint').hidden&&d.getElementById('quote-material-price-hint').hidden);
 set('quote-kg-amount',w.roundMoney(plateWeight));set('quote-kg-price',55);fire('quote-kg-price','input');w.calculateQuote();w.saveQuote();quote=db().teklifler.at(-1);
 assert.equal(quote.materialKgPrice,55);assert.equal(quote.materialKey,'st37|3');
 choose('lazer',10,5);assert.equal(price(),'55','Latest quote for the customer wins, whatever the work type');

 // A typed price survives a work-type change but not a material change.
 set('quote-material-price',61);fire('quote-material-price','input');set('quote-type','bukum');w.updateQuoteTypeUI();assert.equal(price(),'61');
 set('quote-material',6);fire('quote-material');assert.equal(price(),'55');

 // Older quotes without a KG price reload with the price that reproduces their saved amount.
 w.eval(`db.teklifler.push({id:900,teklifNo:'TEK-ESKI',tarih:'01.09.2026',durum:'Beklemede',islemTipi:'lazer',customerId:'11',customerName:'Öztürk Makina',description:'Eski',minutes:10,rate:30,kgAmount:0,kgPrice:0,stokId:'5',stokQty:1,operationCost:300,materialCost:${w.roundMoney(37.5*plateWeight)},subTotalBeforeDiscount:${w.roundMoney(300+37.5*plateWeight)},discountPercent:0,discountAmount:0,subTotal:${w.roundMoney(300+37.5*plateWeight)},taxRate:0,tax:0,total:${w.roundMoney(300+37.5*plateWeight)}})`);
 w.loadQuote(900);assert.equal(price(),'37.5');const reloaded=w.getQuoteData();assert.equal(reloaded.total,db().teklifler.find(q=>q.id===900).total);

 // Printed quote shows the material weight and KG price.
 w.printQuoteById(db().teklifler.find(q=>q.materialKgPrice===50).id);const printed=d.querySelector('.print-preview-frame').getAttribute('srcdoc');
 assert(printed.includes('₺50,00/KG')&&printed.includes(`${w.formatPrintQuantity(w.roundMoney(w.roundMoney(50*plateWeight)*2/50))} KG`));
 // Material choices state that the listed price is cost.
 w.updateQuoteMaterials();assert([...d.getElementById('quote-material').options].some(o=>o.textContent.includes('Maliyet ₺37,50/KG')));

 console.log('Material price: default margin, last price per customer and material, internal and customer-owned material, below-cost warning, raw material sales, profitability, legacy quotes and print passed.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
