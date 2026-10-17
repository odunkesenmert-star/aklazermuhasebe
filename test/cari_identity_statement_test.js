const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

(async () => {
    const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const dom = new JSDOM(html, { url: 'http://cari-identity.local', runScripts: 'dangerously', pretendToBeVisual: true });
    const { window: w } = dom;
    const script = w.document.createElement('script');
    script.textContent = fs.readFileSync('app.js', 'utf8');
    w.document.body.append(script);
    await new Promise(resolve => setTimeout(resolve, 100));

    w.eval(`db=createEmptyDatabase();
        db.cariler=[{id:1,adi:'Aynı Müşteri',bakiye:700},{id:2,adi:'Aynı Müşteri',bakiye:700}];
        db.faturalar=[
            {id:11,tur:'kesilen',cariId:1,firma:'Aynı Müşteri',faturaNo:'A-11',tutar:1000,tarih:'01.09.2026',paymentTrackingVersion:1},
            {id:12,tur:'kesilen',cariId:2,firma:'Aynı Müşteri',faturaNo:'B-12',tutar:1000,tarih:'01.09.2026',paymentTrackingVersion:1},
            {id:13,tur:'kesilen',firma:'Aynı Müşteri',faturaNo:'BELIRSIZ',tutar:500,tarih:'01.09.2026',paymentTrackingVersion:1},
            {id:14,tur:'kesilen',cariId:999,firma:'Aynı Müşteri',faturaNo:'ESKI-ID',tutar:400,tarih:'01.09.2026',paymentTrackingVersion:1}
        ];
        db.islemler=[
            {id:21,cariId:1,firma:'Aynı Müşteri',tip:'Tahsilat (Gelen)',tutar:300,bakiyeDegisimi:-300,isGelir:true,paymentInvoiceId:11,tarih:'02.09.2026'},
            {id:22,cariId:2,firma:'Aynı Müşteri',tip:'Tahsilat (Gelen)',tutar:300,bakiyeDegisimi:-300,isGelir:true,paymentInvoiceId:12,tarih:'02.09.2026'},
            {id:23,firma:'Aynı Müşteri',tip:'Tahsilat (Gelen)',tutar:100,bakiyeDegisimi:-100,isGelir:true,tarih:'02.09.2026'},
            {id:24,cariId:999,firma:'Aynı Müşteri',tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,isGelir:true,tarih:'02.09.2026'}
        ];`);
    const db = w.eval('db');
    assert.equal(w.findCariByReference(null, 'Aynı Müşteri'), null, 'A shared name is not an account identity');
    assert.equal(w.findCariByReference(999, 'Aynı Müşteri'), null, 'A missing explicit ID cannot fall back to a name');
    for (const [index, invoiceNo] of [[0, 'A-11'], [1, 'B-12']]) {
        const cari = db.cariler[index];
        const sales = w.getCariStatementLines(cari);
        const movements = w.getCariMovementLines(cari, sales);
        const ledger = w.getCariLedgerLines(cari, sales, cari.bakiye);
        assert.deepEqual([...sales].map(line => line.faturaNo), [invoiceNo]);
        assert.equal(movements.length, 1);
        assert.equal(movements[0].id, index === 0 ? 21 : 22);
        assert.deepEqual([...ledger].map(line => line.balance), [1000, 700]);
        assert.equal(w.getInvoicePaymentSummary(db.faturalar[index]).paid, 300);
    }
    assert.equal(w.getInvoicePaymentSummary(db.faturalar[2]).paid, 0, 'An unlinked legacy invoice cannot claim another account payment');
    assert.equal(w.invoiceMatchesCari(db.faturalar[0], 2, 'Aynı Müşteri'), false);
    db.isEmirleri.push({id:40,cariId:'',customerId:2,customerName:'Aynı Müşteri',orderNo:'IS-40',total:80,durum:'Teslim Edildi',tarih:'03.09.2026'});
    assert.equal(w.getCariStatementLines(db.cariler[0]).some(line => line.orderNo === 'IS-40'), false);
    assert.equal(w.getCariStatementLines(db.cariler[1]).some(line => line.orderNo === 'IS-40'), true);

    w.eval(`db=createEmptyDatabase();
        db.cariler=[{id:1,adi:'Tek Müşteri',bakiye:700}];
        db.faturalar=[{id:31,tur:'kesilen',firma:'Tek Müşteri',faturaNo:'ESKI-31',tutar:1000,tarih:'01.09.2026',paymentTrackingVersion:1}];
        db.islemler=[{id:32,firma:'Tek Müşteri',tip:'Tahsilat (Gelen)',tutar:300,bakiyeDegisimi:-300,isGelir:true,paymentInvoiceId:31,tarih:'02.09.2026'}];`);
    const legacy = w.eval('db');
    assert.equal(w.findCariByReference(null, 'Tek Müşteri').id, 1);
    assert.equal(w.getCariStatementLines(legacy.cariler[0]).length, 1);
    assert.equal(w.getCariMovementLines(legacy.cariler[0]).length, 1);
    assert.equal(w.getInvoicePaymentSummary(legacy.faturalar[0]).paid, 300);
    dom.window.close();
    console.log('Cari identity: duplicate names stay separate; ambiguous and stale legacy references are excluded; unique legacy names remain usable.');
})().catch(error => { console.error(error); process.exitCode = 1; });
