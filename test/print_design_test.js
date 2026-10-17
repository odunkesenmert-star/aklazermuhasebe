const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://print-design.local',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document;const alerts=[];w.alert=m=>alerts.push(String(m));w.confirm=()=>true;w.console.warn=()=>{};
 const script=d.createElement('script');script.textContent=fs.readFileSync('app.js','utf8');d.body.append(script);await new Promise(r=>setTimeout(r,100));
 const db=()=>w.eval('db'),set=(id,v)=>{const e=d.getElementById(id);e.value=String(v);return e;};
 const printed=()=>new JSDOM(d.querySelector('.print-preview-frame').getAttribute('srcdoc')).window.document;
 const source=()=>d.querySelector('.print-preview-frame').getAttribute('srcdoc');
 const reset=()=>{alerts.length=0;w.eval(`db=createEmptyDatabase();db.ayarlar.firmaAdi='AK LAZER Fiber Lazer Kesimleri';db.ayarlar.telefon='0537 588 31 95';db.ayarlar.adres='Yeni Sanayi Sitesi';
  db.cariler=[{id:10,kodu:'CAR-0004',adi:'GÜVEN ASANSÖR',tip:'musteri',tel:'-',adres:'',bakiye:0,ledgerOpeningBalance:0},{id:11,kodu:'CAR-0005',adi:'ÖZTÜRK MAKİNA',tip:'musteri',tel:'0532 111 22 33',adres:'OSB 3. Bölge',vergiDairesi:'Aslanbey',vergiNo:'1234567890',bakiye:0,ledgerOpeningBalance:0}];
  db.stoklar=[{id:5,kodu:'STK-3MM-01',cinsi:'ST37',mm:3,en:1500,boy:3000,ebat:'1500x3000',miktar:10,kg:1059.75,maliyet:38,sahibiTipi:'biz'}];
  db.stokHareketleri=[{id:6,stokId:5,tip:'Stok Girişi',alan:'miktar',miktar:10,onceki:0,sonraki:10},{id:7,stokId:5,tip:'Stok Girişi',alan:'kg',miktar:1059.75,onceki:0,sonraki:1059.75}];`);};
 const quoteForm=(extra={})=>{w.eval('activeQuoteId=null;activeQuoteFingerprint=""');const v={type:'lazer',customer:11,material:5,qty:2,description:'Kabin paneli',minutes:95,rate:30,discount:5,tax:20,...extra};
  set('quote-type',v.type);w.updateQuoteTypeUI();w.renderCariler();set('quote-customer',v.customer);w.updateQuoteMaterials();set('quote-material',v.material);set('quote-material-qty',v.qty);set('quote-description',v.description);set('quote-minutes',v.minutes);set('quote-rate',v.rate);set('quote-discount',v.discount);set('quote-tax-rate',v.tax);w.calculateQuote();};

 // Amounts in words.
 assert.equal(w.formatAmountInWords(12430.67),'On iki bin dört yüz otuz Türk Lirası altmış yedi Kuruş');
 assert.equal(w.formatAmountInWords(1000),'Bin Türk Lirası');
 assert.equal(w.formatAmountInWords(1001001),'Bir milyon bin bir Türk Lirası');
 assert.equal(w.formatAmountInWords(0.05),'Sıfır Türk Lirası beş Kuruş');

 // Settings: company identity, bank and quote defaults are saved and validated.
 reset();w.openAyarlarModal();
 assert.equal(d.getElementById('input-belge-iban').value,'TR04 0001 0090 1065 8664 4050 01','Bank defaults keep the account used before');
 set('input-ayar-eposta','info@aklazer.com.tr');set('input-ayar-web','aklazer.com.tr <b>x</b>');set('input-ayar-vergi-dairesi','Aslanbey');set('input-ayar-vergi-no','1234567890');
 set('input-belge-teslim-suresi','Onaydan sonra 3 iş günü');set('input-belge-odeme','Teslimatta nakit / havale');set('input-belge-teslim-sekli','Atölyeden teslim');set('input-belge-hazirlayan','Mert Odunkesen');
 set('input-belge-gecerlilik',30);set('input-belge-kosullar','Birinci koşul\n\nİkinci koşul');set('input-belge-iban','tr04000100901065866440500 1');w.saveAyarlar();
 let settings=w.getDocumentSettings();assert.equal(db().ayarlar.eposta,'info@aklazer.com.tr');assert.equal(settings.iban,'TR04 0001 0090 1065 8664 4050 01');assert.equal(settings.teklifGecerlilikGun,30);assert.equal(settings.teklifKosullari,'Birinci koşul\nİkinci koşul');
 for(const [id,value,tab] of [['input-ayar-eposta','yanlis','company'],['input-ayar-vergi-no','12ab','company'],['input-belge-iban','TR12','documents'],['input-belge-gecerlilik',0,'documents']]){
  w.openAyarlarModal();set(id,value);const before=JSON.stringify(db().ayarlar);alerts.length=0;w.saveAyarlar();assert.equal(JSON.stringify(db().ayarlar),before,id+' rejected');assert(alerts.length,id);assert(d.getElementById('settings-panel-'+tab).classList.contains('active'));}
 const normalized=w.eval('validateAndNormalizeDB({ayarlar:{belge:{teklifGecerlilikGun:900,iban:5}}})').ayarlar.belge;assert.equal(normalized.teklifGecerlilikGun,15);assert.equal(normalized.iban,'TR04 0001 0090 1065 8664 4050 01');

 // Quote form terms come from settings, can be edited per quote and are saved and restored.
 w.applyQuoteTermDefaults(true);assert.equal(d.getElementById('quote-teslim-suresi').value,'Onaydan sonra 3 iş günü');assert.equal(d.getElementById('quote-gecerlilik-gun').value,'30');
 quoteForm();set('quote-teslim-suresi','5 iş günü');set('quote-gecerlilik-gun',10);w.saveQuote();let quote=db().teklifler.at(-1);assert.equal(quote.teslimSuresi,'5 iş günü');assert.equal(quote.gecerlilikGun,10);assert.equal(quote.odemeSekli,'Teslimatta nakit / havale');
 set('quote-teslim-suresi','');w.applyQuoteTermDefaults();assert.equal(d.getElementById('quote-teslim-suresi').value,'Onaydan sonra 3 iş günü','Empty fields are filled');set('quote-odeme-sekli','Peşin');w.applyQuoteTermDefaults();assert.equal(d.getElementById('quote-odeme-sekli').value,'Peşin','Typed values are kept');
 w.loadQuote(quote.id);assert.equal(d.getElementById('quote-teslim-suresi').value,'5 iş günü');assert.equal(d.getElementById('quote-gecerlilik-gun').value,'10');
 set('quote-gecerlilik-gun',400);alerts.length=0;assert.equal(w.getQuoteData(),null);assert(alerts.at(-1).includes('geçerlilik'));set('quote-gecerlilik-gun',10);

 // Quote document: identity, validity date, itemized lines, terms, payment box and acceptance.
 w.printQuoteById(quote.id);let doc=printed(),text=doc.body.textContent;
 assert(text.includes('info@aklazer.com.tr')&&text.includes('Aslanbey')&&text.includes('1234567890'),'Company e-mail and tax identity are printed');
 assert(source().includes('aklazer.com.tr &lt;b&gt;x&lt;/b&gt;')&&!doc.querySelector('.company-contact b b'),'Settings text is escaped');
 const validUntil=w.eval(`addDaysToTRDate(${JSON.stringify(quote.tarih)},10)`);assert(validUntil);
 assert(text.includes('Teklif No')&&text.includes(quote.teklifNo));assert(text.includes(validUntil)&&text.includes('10 gün geçerlidir'));
 assert(text.includes('Teslim süresi')&&text.includes('5 iş günü')&&text.includes('Atölyeden teslim')&&text.includes('Mert Odunkesen'));
 const rows=[...doc.querySelectorAll('.doc-lines tbody tr')];assert.equal(rows.length,2,'Operation and material are separate lines');
 assert(rows[0].textContent.includes('Lazer Kesim')&&rows[0].textContent.includes('95')&&rows[0].textContent.includes('30,00'));
 assert(rows[1].textContent.includes('Sac Malzeme')&&rows[1].textContent.includes('1500 × 3000 mm')&&rows[1].textContent.includes('plaka'));
 assert.equal([...doc.querySelectorAll('.doc-lines .line-amount')].map(c=>c.textContent).join('|'),`${w.formatCurrency(quote.operationCost)}|${w.formatCurrency(quote.materialCost)}`);
 assert(text.includes('Birinci koşul')&&text.includes('İkinci koşul'));assert(doc.querySelector('.pay-box').textContent.includes('TR04 0001 0090 1065 8664 4050 01'));
 assert(doc.querySelector('.amount-words').textContent.includes(w.formatAmountInWords(quote.total)));assert(text.includes('Müşteri Onayı'));
 assert(!doc.querySelector('.print-payment-footer'),'Quotes carry payment details inline');
 // Draft quote without a number, customer without phone: no placeholders or duplicated titles.
 quoteForm({customer:10,material:'0',description:''});w.printCurrentQuote();doc=printed();text=doc.body.textContent;
 assert(!text.includes('Teklif No'));assert(!/·\s*-/.test(text),'Placeholder phone "-" is not printed');assert.equal(doc.querySelectorAll('.doc-lines .line-desc').length,0,'No repeated title as description');
 assert(text.includes('Malzeme müşteriden'));
 // Without an IBAN no payment box or footer is printed.
 w.eval("db.ayarlar.belge.iban=''");w.printCurrentQuote();assert(!printed().querySelector('.pay-box'));w.eval("db.ayarlar.belge.iban='TR04 0001 0090 1065 8664 4050 01'");

 // Invoice: breakdown and issuer are frozen at creation.
 reset();w.eval("db.ayarlar.web='aklazer.com.tr'");quoteForm();w.approveQuoteAsOrder();const order=db().isEmirleri.at(-1);
 set('input-order-id',order.id);const status=d.getElementById('input-order-status');status.innerHTML='<option>Teslim Edildi</option>';status.value='Teslim Edildi';w.updateOrderStatus();
 set('input-fatura-tur','kesilen');set('input-fatura-firma',11);w.populateInvoiceOrderOptions();set('input-fatura-order',order.id);w.applyInvoiceOrderSelection();set('input-fatura-no','FT-DESIGN');set('input-fatura-tarih','2026-10-15');w.saveFatura();
 const invoice=db().faturalar.at(-1);assert.equal(invoice.documentSnapshot.items.length,2);
 Object.assign(order,{operationCost:1,materialCost:1,description:'Değişen iş'});w.eval("db.ayarlar.firmaAdi='Değişen Firma';db.ayarlar.web='degisen.com'");
 w.printInvoiceDocument(invoice.id);doc=printed();assert.equal(doc.querySelectorAll('.doc-lines tbody tr').length,2);assert(!doc.body.textContent.includes('Değişen'));assert(!source().includes('degisen.com')&&source().includes('AK LAZER Fiber Lazer Kesimleri · aklazer.com.tr'));
 // Work order: production facts and handover acceptance.
 w.printOrderStatement(order.id);text=printed().body.textContent;assert(text.includes('İş Bilgileri')&&text.includes('Kesim süresi')&&text.includes('95 dk')&&text.includes(db().teklifler.at(-1).teklifNo)&&text.includes('Teslim Alan'));

 // Account statement: reconciliation wording follows the balance side.
 w.printAccountStatement(11);text=printed().body.textContent;assert(text.includes(`${w.formatCurrency(order.total)} borç bakiyesi vermektedir`));assert(text.includes('Cari Hesap Onayı'));
 w.printAccountStatement(10);text=printed().body.textContent;assert(text.includes('hesabınız kapalıdır'));

 // Payroll: identity numbers, overtime detail and separate bonus.
 reset();w.eval("db.personeller=[{id:50,kodu:'P-1',ad:'Ahmet Yılmaz',gorev:'Operatör',maas:32000,maasTipi:'aylik',durum:'Aktif',tcKimlikNo:'12345678901',sgkSicilNo:'4612345678'}]");
 w.openPayrollModal('',50);set('input-puantaj-personel',50);set('input-puantaj-ay','2026-09');set('input-puantaj-mesai-saat',12);set('input-puantaj-mesai-ucret',250);set('input-puantaj-prim',500);d.getElementById('input-puantaj-odendi').checked=false;w.savePuantaj();
 w.printPayrollStatement('payroll-'+db().personelPuantajlari[0].id);text=printed().body.textContent;
 assert(text.includes('T.C. Kimlik No 12345678901')&&text.includes('SGK Sicil No 4612345678'));assert(text.includes('Fazla Mesai (12 saat × ₺250,00)')&&text.includes('Prim'));assert(text.includes('Ödeme bekliyor'));assert(text.includes('Maaş Bordrosu'));

 console.log('Print design: settings, quote terms, identity, itemized lines, words, payment box, acceptance, frozen invoices, reconciliation and payroll details passed.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
