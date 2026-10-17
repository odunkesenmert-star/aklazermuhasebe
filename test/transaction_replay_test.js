const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

(async () => {
    const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const dom = new JSDOM(html, {url:'http://replay-test.local', runScripts:'dangerously', pretendToBeVisual:true});
    const w = dom.window, d = w.document;
    w.alert = () => {}; w.confirm = () => true;
    const script = d.createElement('script'); script.textContent = fs.readFileSync('app.js','utf8'); d.body.append(script);
    await new Promise(resolve => setTimeout(resolve,100));
    const pending = [];
    w.confirmAction = (_message, onConfirm) => pending.push(onConfirm);
    const reset = () => {
        assert.equal(pending.length,0);
        w.eval(`db=createEmptyDatabase();db.cariler=[{id:1,adi:'Test Cari',bakiye:1000,ledgerOpeningBalance:1000}];db.kasaHesaplari=[{id:2,ad:'Nakit Kasa',tip:'nakit',bakiye:0,ledgerOpeningBalance:0}];`);
        return w.eval('db');
    };
    const twice = action => {
        action(); action(); assert.equal(pending.length,2);
        pending.shift()(); const first = JSON.stringify(w.eval('db'));
        pending.shift()(); assert.equal(JSON.stringify(w.eval('db')),first,'Second confirmation must not repeat any financial or audit mutation');
    };

    let db = reset();
    w.openKasaHareketModal();
    d.getElementById('input-kasa-hareket-hesap').value='2';
    d.getElementById('input-kasa-hareket-tutar').value='500';
    w.saveKasaHareket(); w.saveKasaHareket();
    assert.equal(db.kasaHesaplari[0].bakiye,500);
    assert.equal(db.kasaHareketleri.length,1,'Repeated cash submission must create one movement');
    twice(()=>w.undoManualCashMovement(db.kasaHareketleri[0].id));
    assert.equal(db.kasaHesaplari[0].bakiye,0);

    db=reset();
    const receipt=w.addCariMovement(db.cariler[0],{tip:'Tahsilat (Gelen)',tutar:200,bakiyeDegisimi:-200,isGelir:true});
    receipt.kasaHareketId=w.addCashMovement(2,{tip:'giris',tutar:200,kaynak:'cari-islem',refId:receipt.id}).id;
    twice(()=>w.reverseCariMovement(receipt.id));
    assert.equal(db.cariler[0].bakiye,1000); assert.equal(db.kasaHesaplari[0].bakiye,0);
    assert.equal(db.islemler.length,2); assert.equal(db.kasaHareketleri.length,2);

    const paidPlan = () => {
        const data=reset();
        data.odemePlanlari.push({id:30,planNo:'VP-30',cariId:1,firma:'Test Cari',tip:'tahsilat',tutar:200,durum:'beklemede'});
        w.markPaymentPlanPaid(30,2);
        assert.equal(data.cariler[0].bakiye,800); assert.equal(data.kasaHesaplari[0].bakiye,200);
        return data;
    };
    db=paidPlan(); twice(()=>w.undoPaymentPlanSettlement(30));
    assert.equal(db.cariler[0].bakiye,1000); assert.equal(db.kasaHesaplari[0].bakiye,0);
    assert.equal(db.odemePlanlari[0].durum,'beklemede');
    db=paidPlan(); twice(()=>w.deletePaymentPlan(30));
    assert.equal(db.cariler[0].bakiye,1000); assert.equal(db.kasaHesaplari[0].bakiye,0);
    assert.equal(db.odemePlanlari.length,0);
    assert.equal(db.islemler[0].reversedBy,db.islemler[1].id,'Deleted paid plan retains reciprocal reversal links');
    assert.equal(w.buildAccountCheckReport().findings.filter(f=>f.severity==='error').length,0);
    db=paidPlan(); db.kasaHareketleri=[];
    const missingCashSnapshot=JSON.stringify(db); w.deletePaymentPlan(30); pending.shift()();
    assert.equal(JSON.stringify(db),missingCashSnapshot,'Missing linked cash movement must leave the paid plan and customer balance intact');

    const unpaidInvoice = () => {
        const data=reset();
        const charge=w.addCariMovement(data.cariler[0],{tip:'Kesilen Fatura (FT-40)',tutar:500,bakiyeDegisimi:500,faturaId:40});
        data.faturalar.push({id:40,tur:'kesilen',cariId:1,firma:'Test Cari',faturaNo:'FT-40',tutar:500,cariYansitildi:true,cariBakiyeDegisimi:500,cariIslemId:charge.id,paymentTrackingVersion:1});
        return data;
    };
    db=unpaidInvoice(); twice(()=>w.deleteFatura(40));
    assert.equal(db.cariler[0].bakiye,1000); assert.equal(db.faturalar.length,0); assert.equal(db.islemler.length,2);
    db=unpaidInvoice(); w.deleteFatura(40);
    w.addCariMovement(db.cariler[0],{tip:'Tahsilat (Gelen)',tutar:100,bakiyeDegisimi:-100,paymentInvoiceId:40,isGelir:true});
    const paidDuringConfirmation=JSON.stringify(db); pending.shift()();
    assert.equal(JSON.stringify(db),paidDuringConfirmation,'An invoice paid while confirmation was open cannot be deleted');

    let backupOptions;
    w.electronAPI={sendBackup:async (_data,options)=>{backupOptions=options;return {success:true};}};
    assert((await w.createSafetyBackup(JSON.stringify(db))).success);
    assert.equal(backupOptions.safety,true,'Restore/reset must request a protected safety snapshot');
    dom.window.close();
    console.log('Transaction replay: cash double-submit, repeated reversals, plan deletion, invoice payment race, missing cash protection and safety-backup request passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
