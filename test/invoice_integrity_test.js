const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
(async () => {
    const dom = new JSDOM(html, {url:'http://invoice-integrity.local',runScripts:'dangerously',pretendToBeVisual:true});
    const w = dom.window, alerts = [];
    w.alert = message => alerts.push(String(message)); w.confirm = () => true;
    w.console.warn = () => {};
    const script = w.document.createElement('script'); script.textContent = fs.readFileSync('app.js', 'utf8'); w.document.body.appendChild(script);
    await new Promise(resolve => setTimeout(resolve,100));
    const d = w.document;
    const set = (id,value) => { assert(d.getElementById(id),id); d.getElementById(id).value = String(value); };
    w.eval(`db=createEmptyDatabase(); db.cariler=[{id:1,kodu:'C-1',adi:'Müşteri',bakiye:0},{id:2,kodu:'C-2',adi:'Tedarikçi',bakiye:0}]; db.kasaHesaplari=[{id:3,ad:'Banka',tip:'banka',bakiye:10000}];`);
    const db = w.eval('db');
    w.renderCariler();
    function invoice(type,customer,no,base,rate) {
        w.setInvoiceTab(type); w.openFaturaModal();
        set('input-fatura-firma',customer); w.populateInvoiceOrderOptions();
        set('input-fatura-no',no); set('input-fatura-tarih','2026-09-15');
        set('input-fatura-matrah',base); set('input-fatura-kdv-orani',rate); w.updateInvoiceTaxPreview('matrah');
        set('input-fatura-aciklama','Kaydedilen açıklama');
        w.saveFatura(); const item=db.faturalar.find(f=>f.faturaNo===no); assert(item, alerts.join('\n')); return item;
    }
    function payment(inv,amount) {
        w.openInvoicePayment(inv.id); set('input-islem-tutar',amount); set('input-islem-kasa',3); w.saveIslem();
        return db.islemler.at(-1);
    }
    const first = invoice('kesilen',1,'FT-001',1000,10);
    const second = invoice('kesilen',1,'FT-002',500,0);
    assert.equal(first.odemeDurumu,'odenmedi'); assert.equal(db.cariler[0].bakiye,1600);
    let movement=payment(first,400);
    assert.equal(movement.paymentInvoiceId,first.id);
    assert.equal(first.odemeDurumu,'kismi'); assert.equal(w.getInvoicePaymentSummary(first).remaining,700);
    const firstRow = [...d.querySelectorAll('#invoices-tbody tr')].find(row => row.textContent.includes('FT-001'));
    assert(firstRow.textContent.includes('Kısmi Ödendi') && firstRow.textContent.includes('Kalan: ₺700,00'), 'Visible invoice list must update immediately after payment');
    assert.equal(second.odemeDurumu,'odenmedi'); assert.equal(db.cariler[0].bakiye,1200); assert.equal(db.kasaHesaplari[0].bakiye,10400);
    w.printInvoiceDocument(first.id);
    assert(d.querySelector('.print-preview-frame').srcdoc.includes('Kısmi Ödendi'));
    d.getElementById('btn-print-preview-close').click();
    w.showFaturaDetail(first.id);
    assert(d.getElementById('modal-fatura-detail').textContent.includes('Kalan Tutar'));
    const firstPayment=movement;
    w.openEditCariMovement(firstPayment.id); set('input-islem-tutar',250); w.saveIslem();
    assert.equal(w.getInvoicePaymentSummary(first).paid,250);
    assert.equal(w.getInvoicePaymentSummary(first).remaining,850);
    assert.equal(db.cariler[0].bakiye,1350); assert.equal(db.kasaHesaplari[0].bakiye,10250);
    assert(firstPayment.reversedBy); const corrected=db.islemler.find(m=>m.correctionOf===firstPayment.id);
    assert.equal(corrected.paymentInvoiceId,first.id);
    w.reverseCariMovement(corrected.id);
    assert.equal(first.odemeDurumu,'odenmedi'); assert.equal(db.cariler[0].bakiye,1600); assert.equal(db.kasaHesaplari[0].bakiye,10000);
    const beforeOverpay=JSON.stringify(db);
    payment(first,1101); assert.equal(JSON.stringify(db),beforeOverpay,'Overpayment must leave all ledgers untouched');
    assert(alerts.at(-1).includes('kalan tutarı'));
    payment(first,1100); assert.equal(first.odemeDurumu,'odendi'); assert.equal(w.getInvoicePaymentSummary(first).remaining,0);
    const beforeDelete=JSON.stringify(db); w.deleteFatura(first.id); assert.equal(JSON.stringify(db),beforeDelete,'Cannot orphan active invoice payments');
    // A general collection changes the account but is never guessed onto another invoice.
    w.openIslemModal(1,'Müşteri'); set('input-islem-tutar',100); set('input-islem-kasa',3); w.saveIslem();
    assert.equal(w.getInvoicePaymentSummary(second).paid,0);
    assert.equal(db.cariler[0].bakiye,400);
    // Supplier payments follow the opposite cash/account direction.
    const purchase=invoice('alinan',2,'AL-001',200,0);
    const cashBefore=db.kasaHesaplari[0].bakiye;
    movement=payment(purchase,80);
    assert.equal(purchase.odemeDurumu,'kismi'); assert.equal(w.getInvoicePaymentSummary(purchase).remaining,120);
    assert.equal(db.cariler[1].bakiye,-120); assert.equal(db.kasaHesaplari[0].bakiye,cashBefore-80);
    w.reverseCariMovement(movement.id); assert.equal(purchase.odemeDurumu,'odenmedi'); assert.equal(db.cariler[1].bakiye,-200);
    // Reassign a payment during correction: both invoices must update.
    movement=payment(second,100);
    const third=invoice('kesilen',1,'FT-003',300,0);
    w.openEditCariMovement(movement.id); set('input-islem-payment-invoice-id',third.id); set('input-islem-tutar',100); w.saveIslem();
    assert.equal(w.getInvoicePaymentSummary(second).paid,0); assert.equal(w.getInvoicePaymentSummary(third).paid,100);
    // Customer mismatch must be rejected even if a stale/tampered select value is submitted.
    w.openIslemModal(2,'Tedarikçi');
    d.getElementById('input-islem-payment-invoice-id').innerHTML=`<option value="${second.id}">Yanlış cari</option>`;
    set('input-islem-payment-invoice-id',second.id); set('input-islem-kasa',3); set('input-islem-tutar',10);
    const beforeMismatch=JSON.stringify(db); w.saveIslem(); assert.equal(JSON.stringify(db),beforeMismatch);
    // Saved print content survives later work order, customer and issuer edits.
    db.isEmirleri=[{id:20,orderNo:'EMR-20',customerId:1,customerName:'Müşteri',description:'Orijinal iş',durum:'Teslim Edildi',bakiyeCariyeYansitildi:true,total:1080,subTotal:900,tax:180,taxRate:20,discountAmount:100,discountPercent:10}];
    w.setInvoiceTab('kesilen'); w.openFaturaModal(); set('input-fatura-firma',1); w.populateInvoiceOrderOptions();
    set('input-fatura-order',20); w.applyInvoiceOrderSelection(); set('input-fatura-no','FT-SNAPSHOT'); w.saveFatura();
    const frozen=db.faturalar.find(f=>f.faturaNo==='FT-SNAPSHOT'); assert(frozen);
    const saved=JSON.stringify(frozen.documentSnapshot);
    Object.assign(db.isEmirleri[0],{total:9999,subTotal:9999,tax:0,description:'Değişen iş'});
    db.cariler[0].adi='Değişen müşteri'; db.ayarlar.firmaAdi='Değişen firma';
    await w.saveDB();
    assert.equal(JSON.stringify(frozen.documentSnapshot),saved);
    assert.equal(w.getInvoiceDocumentLine(frozen).total,1080);
    w.printInvoiceDocument(frozen.id); const print=d.querySelector('.print-preview-frame').srcdoc;
    assert(!print.includes('Değişen müşteri')&&!print.includes('Değişen firma')&&!print.includes('Değişen iş'));
    d.getElementById('btn-print-preview-close').click();
    // Legacy totals win over incompatible current work-order amounts; normalization is idempotent.
    const legacy={id:30,tur:'kesilen',cariId:1,firma:'Müşteri',orderId:20,tutar:110,matrah:null,kdvTutari:null,kdvOrani:10,aciklama:'Eski kayıt',odemeDurumu:'kismi'};
    db.faturalar.push(legacy);
    const financialBefore=[db.cariler.map(c=>c.bakiye),db.kasaHesaplari.map(c=>c.bakiye),db.islemler.length];
    const normalized=w.validateAndNormalizeDB(db); const normalizedLegacy=normalized.faturalar.find(f=>f.id===30);
    assert.equal(normalizedLegacy.documentSnapshot.line.total,110); assert.equal(normalizedLegacy.documentSnapshot.line.subTotal,100); assert.equal(normalizedLegacy.documentSnapshot.line.tax,10);
    assert.equal(JSON.stringify(w.validateAndNormalizeDB(normalized)),JSON.stringify(normalized));
    assert.equal(w.getInvoicePaymentSummary(legacy).remaining,null,'Do not invent legacy partial-payment amounts');
    w.showFaturaDetail(30); set('invoice-history-paid',40); w.saveInvoicePaymentHistory(30);
    assert.equal(w.getInvoicePaymentSummary(legacy).remaining,70);
    w.showFaturaDetail(30); set('invoice-history-paid',30); w.saveInvoicePaymentHistory(30);
    assert.equal(w.getInvoicePaymentSummary(legacy).remaining,80,'Historical amount corrections remain possible without deleting records');
    assert.equal(JSON.stringify([db.cariler.map(c=>c.bakiye),db.kasaHesaplari.map(c=>c.bakiye),db.islemler.length]),JSON.stringify(financialBefore));
    // PDF reporting and screen detail use the same actual rate, including tax-free records.
    for(const [rate,total,tax] of [[0,100,0],[1,101,1],[10,110,10],[20,120,20]]) {
        const sample={id:40+rate,tur:'alinan',firma:'Tedarikçi',cariId:2,faturaNo:'KDV-'+rate,tutar:total,kdvOrani:rate};
        db.faturalar.push(sample); w.showFaturaDetail(sample.id);
        assert.equal(w.getInvoiceDocumentLine(sample).tax,tax); assert.equal(w.getInvoiceDocumentLine(sample).subTotal,100);
        assert(d.getElementById('modal-fatura-detail').textContent.includes(w.formatCurrency(tax)));
    }
    assert.equal(w.getSavedInvoiceAmounts({tutar:110,matrah:100,kdvTutari:10}).taxRate,10,'Infer a missing rate from stored amounts');
    assert.equal(w.getSavedInvoiceAmounts({tutar:100,matrah:100,kdvTutari:0}).taxRate,0);
    const oldOpen={id:90,tur:'kesilen',cariId:1,firma:'Değişen müşteri',orderId:91,tutar:200,odemeDurumu:'odenmedi'};
    db.faturalar.push(oldOpen);
    db.islemler.push({id:92,cariId:1,firma:'Değişen müşteri',orderId:91,tutar:50,tip:'Tahsilat (Gelen)',bakiyeDegisimi:-50,isGelir:true});
    w.syncInvoicePaymentStates(db); assert.equal(oldOpen.odemeDurumu,'kismi');
    db.islemler.at(-1).reversedBy=93; w.syncInvoicePaymentStates(db); assert.equal(oldOpen.odemeDurumu,'odenmedi');
    const roundTrip=w.validateAndNormalizeDB(JSON.parse(JSON.stringify(db)));
    assert.equal(w.getInvoicePaymentSummary(roundTrip.faturalar.find(f=>f.id===first.id),'',roundTrip).remaining,0);
    // Regression: each invoice form must show its own order selector independently.
    w.eval("db=createEmptyDatabase(); db.cariler=[{id:1,kodu:'C-1',adi:'Test',bakiye:0}]; db.kasaHesaplari=[{id:3,ad:'Banka',tip:'banka',bakiye:1000}];");
    const reviewDB=w.eval('db'); w.renderCariler();
    w.setInvoiceTab('alinan'); w.openFaturaModal();
    assert.equal(d.getElementById('input-fatura-order').parentElement.style.display,'none');
    w.openIslemModal(1,'Test'); set('input-islem-tipi','fatura_kes'); w.updateIslemTipiInfo();
    assert.equal(d.getElementById('input-islem-order-id').parentElement.style.display,'block');
    assert.equal(d.getElementById('input-fatura-order').parentElement.style.display,'none');
    w.setInvoiceTab('kesilen'); w.openFaturaModal();
    set('input-islem-tipi','tahsilat'); w.updateIslemTipiInfo();
    assert.equal(d.getElementById('input-islem-order-id').parentElement.style.display,'none');
    assert.equal(d.getElementById('input-fatura-order').parentElement.style.display,'block');
    const ledger=()=>w.getCariLedgerLines(reviewDB.cariler[0],w.getCariStatementLines(reviewDB.cariler[0]),reviewDB.cariler[0].bakiye);
    // New outgoing/incoming cancellations leave no invented opening balance or collection.
    for (const type of ['kesilen','alinan']) {
        w.setInvoiceTab(type); w.openFaturaModal(); set('input-fatura-firma',1); w.populateInvoiceOrderOptions();
        set('input-fatura-no','CANCEL-'+type); set('input-fatura-matrah',1000); set('input-fatura-kdv-orani',0); w.updateInvoiceTaxPreview('matrah'); w.saveFatura();
        const item=reviewDB.faturalar.at(-1); assert(item);
        const cashBefore=JSON.stringify(reviewDB.kasaHesaplari);
        w.deleteFatura(item.id); assert.equal(reviewDB.cariler[0].bakiye,0);
        assert.equal(ledger().length,0); assert.equal(JSON.stringify(reviewDB.kasaHesaplari),cashBefore);
    }
    assert.equal(reviewDB.islemler.length,4,'Retain both original and cancellation records for the audit history');
    // Legacy entries from the account form had an invoice number but no invoice ID.
    reviewDB.islemler=[
        {id:10,cariId:1,firma:'Test',tip:'Fatura Kesildi (ESKI)',faturaNo:'ESKI',tutar:1000,bakiyeDegisimi:1000},
        {id:11,cariId:1,firma:'Test',tip:'Fatura Silindi (ESKI)',faturaId:12,faturaNo:'ESKI',tutar:1000,bakiyeDegisimi:-1000}
    ];
    assert.equal(ledger().length,0);
    // An unrelated real collection and true opening balance must remain visible.
    reviewDB.islemler.push({id:13,cariId:1,firma:'Test',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,isGelir:true});
    reviewDB.cariler[0].bakiye=300;
    assert.equal(ledger().find(line=>line.code==='DEVİR').debit,500);
    assert.equal(ledger().filter(line=>line.credit>0).length,1);
    assert.equal(ledger().find(line=>line.credit>0).credit,200);
    // Do not hide a cancellation whose original cannot be verified.
    reviewDB.islemler=reviewDB.islemler.filter(m=>m.id!==10);
    assert(ledger().some(line=>line.credit===1000));
    // Account-form invoicing of a delivered order neither doubles debt nor creates a collection on cancellation.
    reviewDB.islemler=[]; reviewDB.cariler[0].bakiye=1000;
    reviewDB.isEmirleri=[{id:20,orderNo:'EMR-20',customerId:1,customerName:'Test',total:1000,subTotal:1000,tax:0,taxRate:0,durum:'Teslim Edildi',bakiyeCariyeYansitildi:true}];
    w.openIslemModal(1,'Test'); set('input-islem-tipi','fatura_kes'); w.updateIslemTipiInfo();
    set('input-islem-order-id',20); w.applySelectedOrderToInvoice(); set('input-islem-fatura-no','ORDER-CANCEL'); w.saveIslem();
    assert.equal(reviewDB.cariler[0].bakiye,1000); assert.equal(reviewDB.faturalar.length,1);
    assert.equal(reviewDB.islemler[0].faturaId,reviewDB.faturalar[0].id);
    w.deleteFatura(reviewDB.faturalar[0].id);
    assert.equal(ledger().length,1); assert.equal(ledger()[0].debit,1000); assert.equal(ledger()[0].credit,0);
    // Restoring an implicit legacy invoice link also restores the invoice payment limit.
    reviewDB.cariler[0].bakiye=800;
    reviewDB.faturalar=[{id:30,tur:'kesilen',cariId:1,firma:'Test',orderId:20,tutar:1000,faturaNo:'OLD-30',paymentTrackingVersion:1,odemeDurumu:'kismi'}];
    reviewDB.islemler=[{id:40,cariId:1,firma:'Test',orderId:20,tutar:200,tip:'Tahsilat (Gelen)',bakiyeDegisimi:-200,isGelir:true}];
    w.openEditCariMovement(40);
    assert.equal(d.getElementById('input-islem-payment-invoice-id').value,'30');
    set('input-islem-kasa',3); set('input-islem-tutar',1200);
    const beforeLegacyOverpay=JSON.stringify(reviewDB); w.saveIslem();
    assert.equal(JSON.stringify(reviewDB),beforeLegacyOverpay,'Reject excess legacy correction without changing any ledger');
    set('input-islem-tutar',300); w.saveIslem();
    const legacyCorrection=reviewDB.islemler.find(m=>m.correctionOf===40);
    assert.equal(legacyCorrection.paymentInvoiceId,30);
    assert.equal(w.getInvoicePaymentSummary(reviewDB.faturalar[0]).paid,300);
    assert.equal(w.getInvoicePaymentSummary(reviewDB.faturalar[0]).remaining,700);
    w.reverseCariMovement(legacyCorrection.id);
    assert.equal(w.getInvoicePaymentSummary(reviewDB.faturalar[0]).paid,0);
    dom.window.close();
    console.log('Invoice integrity: partial/full payments, corrections, reversals, supplier direction, overpayment and deletion guards, invoice reassignment, customer isolation, frozen documents, legacy payment preservation, VAT rates and persistence passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
