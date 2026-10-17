const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://audit-fixes-2.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;const alerts=[];w.alert=m=>alerts.push(String(m));w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),set=(id,v)=>{const e=d.getElementById(id);if(e.type==='checkbox')e.checked=!!v;else e.value=String(v);return e;};
 const options=id=>[...d.getElementById(id).options].map(o=>o.value).filter(Boolean);
 const findings=()=>w.buildAccountCheckReport().findings;
 const reset=()=>{alerts.length=0;w.eval("db=createEmptyDatabase();db.cariler=[{id:10,kodu:'C-10',adi:'Müşteri A',tip:'musteri',bakiye:0,ledgerOpeningBalance:0}];db.kasaHesaplari.push({id:3,kodu:'K-3',ad:'Eski Banka',tip:'banka',bakiye:0,ledgerOpeningBalance:0,isPasif:false});db.personeller=[{id:50,kodu:'P-1',ad:'Ali',maas:30000,maasTipi:'aylik',durum:'Aktif'}]");};
 const account=id=>db().kasaHesaplari.find(k=>k.id===id);
 const passivate=id=>{account(id).isPasif=true;};
 const today=w.eval('toDateInputValue(new Date())'),tomorrow=w.eval('(()=>{const t=new Date();t.setDate(t.getDate()+1);return toDateInputValue(t);})()');

 // 1. A cheque cannot be closed without its account and cash effect.
 const chequeForm=(no,status,kasa)=>{w.openCekSenetModal();set('input-ceksenet-tip','alinan_cek');w.updateCekSenetStatusOptions();set('input-ceksenet-cari',10);set('input-ceksenet-no',no);set('input-ceksenet-vade','2026-11-01');set('input-ceksenet-tutar',500);set('input-ceksenet-durum',status);set('input-ceksenet-kasa',kasa);};
 reset();chequeForm('CEK-1','beklemede',3);w.saveCekSenet();passivate(3);
 w.openCekSenetModal();assert(!options('input-ceksenet-kasa').includes('3'),'A leftover passive choice is not offered on a new cheque');
 w.openCekSenetModal(db().cekSenetler[0].id);set('input-ceksenet-durum','tahsil_edildi');set('input-ceksenet-kasa',3);w.saveCekSenet();
 let cheque=db().cekSenetler[0];assert.equal(cheque.durum,'beklemede','Settling with a passive account is refused');assert.equal(cheque.cariYansitildi,false);assert.equal(db().cariler[0].bakiye,0);
 chequeForm('CEK-2','tahsil_edildi',1);w.saveCekSenet();cheque=db().cekSenetler.find(c=>c.belgeNo==='CEK-2');assert(cheque.cariYansitildi);assert.equal(db().cariler[0].bakiye,-500);
 w.eval('db.cekSenetler[0].durum="tahsil_edildi"');assert(findings().some(f=>f.category==='Çek / Senet'&&f.severity==='error'),'Account check reports a settled cheque without effect');w.eval('db.cekSenetler[0].durum="beklemede"');
 // Undoing a cheque whose account was passivated keeps the record and balances unchanged.
 reset();chequeForm('CEK-3','tahsil_edildi',3);w.saveCekSenet();cheque=db().cekSenetler[0];
 w.eval('db.kasaHareketleri.push({id:9001,kasaId:3,kasaAdi:"Eski Banka",tip:"cikis",tutar:500,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 w.updateCekSenetStatus(cheque.id,'beklemede');assert.equal(cheque.durum,'tahsil_edildi');assert(cheque.cariYansitildi);assert.equal(account(3).bakiye,0);
 w.deleteCekSenet(cheque.id);assert.equal(db().cekSenetler.length,1,'Settled cheque on a passive account is not deleted');assert.equal(account(3).bakiye,0);

 // 2. Payroll documents keep the paid period's wage after a raise.
 reset();w.openPayrollModal('',50);set('input-puantaj-personel',50);set('input-puantaj-ay','2026-09');set('input-puantaj-eksik',0);set('input-puantaj-odendi',true);w.populateKasaOptions();set('input-puantaj-kasa',1);w.savePuantaj();
 let record=db().personelPuantajlari[0];assert.equal(record.netMaas,30000);assert.equal(record.bazUcret,30000);
 db().personeller[0].maas=36000;w.printPayrollStatement('payroll-'+record.id);
 let html=d.querySelector('#print-preview-overlay iframe').getAttribute('srcdoc');assert(html.includes('Net Ödenecek</td><td>₺30.000,00'),'Printed net stays at the paid amount');assert(html.includes('Baz ücret: ₺30.000,00'));
 w.openPayrollModal(record.id);set('input-puantaj-not','Düzeltme');w.savePuantaj();record=db().personelPuantajlari[0];assert.equal(record.netMaas,30000,'Editing an old period keeps its saved wage');assert.equal(db().kasaHesaplari[0].bakiye,-30000);
 // Legacy record without a saved wage prints its stored totals.
 delete record.bazUcret;w.printPayrollStatement('payroll-'+record.id);html=d.querySelector('#print-preview-overlay iframe').getAttribute('srcdoc');assert(html.includes('Net Ödenecek</td><td>₺30.000,00'));assert(html.includes('baz ücreti kayıtta yok'));

 // 3. Money never moves on a passive account; the user gets the reason.
 reset();w.openKasaHareketModal();set('input-kasa-hareket-hesap',3);set('input-kasa-hareket-tip','giris');set('input-kasa-hareket-tutar',100);w.saveKasaHareket();
 const manual=db().kasaHareketleri[0];w.eval('db.kasaHareketleri.push({id:9002,kasaId:3,kasaAdi:"Eski Banka",tip:"cikis",tutar:100,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 w.undoManualCashMovement(manual.id);assert(!manual.reversedBy);assert.equal(account(3).bakiye,0);assert(alerts.at(-1).includes('pasif'));
 assert.equal(w.addCashMovement(3,{tip:'giris',tutar:5}),null,'Low-level posting to a passive account is refused');
 reset();w.openGiderModal();set('input-gider-kategori','Kira');set('input-gider-tutar',1000);set('input-gider-kasa',3);set('input-gider-tarih','2026-10-01');w.saveGider();
 const expense=db().giderler[0];w.eval('db.kasaHareketleri.push({id:9003,kasaId:3,kasaAdi:"Eski Banka",tip:"giris",tutar:1000,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 w.openGiderModal(expense.id);set('input-gider-tutar',1200);w.saveGider();assert.equal(expense.tutar,1000,'Expense on a passive account is not re-posted');assert.equal(account(3).bakiye,0);
 w.deleteGider(expense.id);assert.equal(db().giderler.length,1);assert.equal(account(3).bakiye,0);
 w.openGiderModal();assert(!options('input-gider-kasa').includes('3'));
 reset();w.openPayrollModal('',50);set('input-puantaj-personel',50);set('input-puantaj-ay','2026-08');set('input-puantaj-odendi',true);w.populateKasaOptions();set('input-puantaj-kasa',3);w.savePuantaj();record=db().personelPuantajlari[0];
 w.eval('db.kasaHareketleri.push({id:9004,kasaId:3,kasaAdi:"Eski Banka",tip:"giris",tutar:30000,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 w.openPayrollModal(record.id);set('input-puantaj-prim',500);w.savePuantaj();assert.equal(record.netMaas,30000,'Payroll paid from a passive account is not re-posted');assert.equal(account(3).bakiye,0);
 w.deletePuantaj(record.id);assert.equal(db().personelPuantajlari.length,1);assert.equal(account(3).bakiye,0);
 assert.equal(findings().filter(f=>f.severity==='error').length,0,JSON.stringify(findings()));
 w.eval('db.kasaHesaplari.find(k=>k.id===3).bakiye=50');assert(findings().some(f=>f.category==='Kasa / Banka'&&f.detail.includes('Pasif hesabın bakiyesi')));
 // Account movement reversal and quick sale cancellation on a passive account are refused.
 reset();w.openIslemModal(10,'Müşteri A');set('input-islem-tipi','tahsilat');w.updateIslemTipiInfo();set('input-islem-tutar',200);set('input-islem-kasa',3);w.saveIslem();const payment=db().islemler.at(-1);
 w.eval('db.kasaHareketleri.push({id:9005,kasaId:3,kasaAdi:"Eski Banka",tip:"cikis",tutar:200,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 w.reverseCariMovement(payment.id);assert(!payment.reversedBy);assert.equal(db().cariler[0].bakiye,-200);
 w.openEditCariMovement(payment.id);set('input-islem-tutar',250);w.saveIslem();assert(!payment.reversedBy,'Correction of a payment on a passive account is refused');
 reset();let sale=await w.commitQuickSale({token:'qs-1',description:'s',name:'',total:100,cashId:3,date:'2026-10-10',tax:20});assert(sale.success,sale.error);
 w.eval('db.kasaHareketleri.push({id:9006,kasaId:3,kasaAdi:"Eski Banka",tip:"cikis",tutar:100,kaynak:"manuel",tarih:"01.10.2026"});db.kasaHesaplari.find(k=>k.id===3).bakiye=0');passivate(3);
 const cancel=await w.commitQuickSale(null,sale.sale.id,true);assert(!cancel.success);assert(cancel.error.includes('pasif'));

 // 4. One payroll record per person and period, also when editing.
 reset();for(const month of ['2026-07','2026-08']){w.openPayrollModal('',50);set('input-puantaj-personel',50);set('input-puantaj-ay',month);set('input-puantaj-odendi',false);w.savePuantaj();}
 w.openPayrollModal(db().personelPuantajlari[0].id);set('input-puantaj-ay','2026-08');w.savePuantaj();
 assert.deepEqual([...db().personelPuantajlari.map(r=>r.donem)].sort(),['2026-07','2026-08']);

 // 5. Quote status follows the order lifecycle.
 const quoteForm=minutes=>{w.eval('activeQuoteId=null;activeQuoteFingerprint=""');set('quote-type','lazer');w.renderCariler();set('quote-customer',10);w.updateQuoteMaterials();set('quote-material','0');set('quote-minutes',minutes);set('quote-rate',10);set('quote-tax-rate',20);w.calculateQuote();};
 reset();quoteForm(10);w.approveQuoteAsOrder();let quote=db().teklifler[0];w.setQuoteStatus(quote.id,'Reddedildi');assert.equal(quote.durum,'Onaylandı','Converted quote cannot be rejected');
 w.showQuoteDetail(quote.id);assert(!d.querySelector('#modal-quote-detail .quote-detail-status-actions'));
 quoteForm(20);w.saveQuote();quote=db().teklifler.at(-1);w.setQuoteStatus(quote.id,'Reddedildi');w.approveSavedQuoteAsOrder(quote.id);assert(!quote.orderId,'Rejected quote is not converted');
 quoteForm(20);w.approveQuoteAsOrder();assert(!quote.orderId);
 w.setQuoteStatus(quote.id,'Revize Edildi');w.approveSavedQuoteAsOrder(quote.id);assert(quote.orderId,'Revised quote can be converted');

 // 6. Received/paid money cannot be dated in the future.
 reset();let result=await w.commitQuickSale({token:'qs-future',description:'s',name:'',total:100,cashId:1,date:tomorrow,tax:20});assert(!result.success);assert(result.error.includes('ileri'));
 result=await w.commitQuickSale({token:'qs-today',description:'s',name:'',total:100,cashId:1,date:today,tax:20});assert(result.success,result.error);
 w.eval("db.cariler.push({id:11,kodu:'C-11',adi:'Tedarikçi',tip:'tedarikci',bakiye:0,ledgerOpeningBalance:0})");
 result=await w.commitSheetPurchase({token:'sp-future',cariId:11,material:'ST37',mm:2,en:1000,boy:2000,quantity:1,weight:30,price:40,tax:0,date:tomorrow,payment:'none'});assert(!result.success);assert(result.error.includes('ileri'));

 // 7. Excel export carries numeric values for amounts and keeps codes as text.
 assert.equal(w.parseExportMoney('₺1.234,56'),1234.56);assert.equal(w.parseExportMoney('₺-1.200,00'),-1200);assert.equal(w.parseExportMoney('-₺15,00'),-15);assert.equal(w.parseExportMoney('+₺7,50'),7.5);assert.equal(w.parseExportMoney('0012'),null);
 let exported='';w.downloadTextFile=(name,content)=>{exported=content;};w.eval('downloadTextFile=window.downloadTextFile');
 reset();w.eval("db.cariler[0].bakiye=1234.56");w.exportListToCSV('accounts');
 assert(exported.includes('x:num="1234.56"'),'Balance cell is numeric');assert(exported.includes('C-10</td>'),'Code stays plain text');

 console.log('Audit fixes 2: cheque settlement, saved payroll wages, passive accounts, unique payroll periods, quote status, future dates and numeric Excel export passed.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
