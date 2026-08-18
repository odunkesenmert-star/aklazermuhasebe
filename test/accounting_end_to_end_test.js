const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://accounting-audit.local' });

let storage = {};
Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    value: {
        getItem: key => storage[key] || null,
        setItem: (key, value) => { storage[key] = value; },
        removeItem: key => { delete storage[key]; },
        clear: () => { storage = {}; }
    }
});

const alerts = [];
dom.window.alert = message => alerts.push(String(message));
dom.window.confirm = () => true;

const script = dom.window.document.createElement('script');
script.textContent = fs.readFileSync('./app.js', 'utf8');
dom.window.document.body.appendChild(script);

setTimeout(() => {
    let failures = 0;
    let checks = 0;
    const assert = (condition, message) => {
        checks++;
        if (condition) console.log(`PASS: ${message}`);
        else {
            failures++;
            console.error(`FAIL: ${message}`);
        }
    };
    const set = (id, value) => {
        const element = dom.window.document.getElementById(id);
        if (!element) throw new Error(`Form alanı bulunamadı: ${id}`);
        if (element.type === 'checkbox') element.checked = !!value;
        else element.value = String(value);
        return element;
    };
    const balance = cari => Math.round((Number(cari.bakiye) || 0) * 100) / 100;
    const cashBalance = account => Math.round((Number(account.bakiye) || 0) * 100) / 100;
    const changeOrderStatus = (order, status) => {
        set('input-order-id', order.id);
        const statusEl = set('input-order-status', status);
        statusEl.innerHTML = `<option value="${status}">${status}</option>`;
        statusEl.value = status;
        dom.window.updateOrderStatus();
    };

    try {
        dom.window.eval('db = createEmptyDatabase(); activeQuoteId = null; activeQuoteFingerprint = "";');
        const db = dom.window.eval('db');
        ['cariler', 'stoklar', 'islemler', 'teklifler', 'giderler', 'faturalar', 'isEmirleri', 'fireler',
            'personeller', 'personelPuantajlari', 'cekSenetler', 'odemePlanlari', 'kasaHesaplari',
            'kasaHareketleri', 'stokHareketleri', 'denetimKayitlari'].forEach(key => { db[key] = []; });

        console.log('\n--- Kimlik ve açılış kontrolleri ---');
        const rapidIds = dom.window.eval('Array.from({ length: 5000 }, () => createRecordId())');
        assert(new Set(rapidIds).size === rapidIds.length, 'Hızlı oluşturulan 5.000 kayıt kimliği çakışmıyor.');

        dom.window.openKasaHesapModal();
        set('input-kasa-ad', 'Muhasebe Test Bankası');
        set('input-kasa-tip', 'banka');
        set('input-kasa-bakiye', 50000);
        dom.window.saveKasaHesap();
        const bank = db.kasaHesaplari[0];
        assert(bank && cashBalance(bank) === 50000, 'Banka hesabı 50.000 TL açılış bakiyesiyle kaydediliyor.');

        const addCari = (name, phone) => {
            set('input-cari-adi', name);
            set('input-cari-tel', phone);
            dom.window.saveCari();
            return db.cariler.find(item => item.adi === name);
        };
        const customer = addCari('Muhasebe Test Müşterisi', '0555 100 1000');
        const supplier = addCari('Muhasebe Test Tedarikçisi', '0555 200 2000');
        assert(!!customer && !!supplier && customer.id !== supplier.id, 'Müşteri ve tedarikçi carileri ayrı kaydediliyor.');

        set('input-stok-sahibi', 'biz');
        dom.window.toggleStokCariSelect();
        set('input-stok-cinsi', 'S235 Test Sacı');
        set('input-stok-mm', 5);
        set('input-stok-miktar', 20);
        set('input-stok-kg', 2000);
        set('input-stok-en', 1500);
        set('input-stok-boy', 3000);
        set('input-stok-maliyet', 1000);
        set('input-stok-kritik', 2);
        dom.window.saveStok();
        const stock = db.stoklar[0];
        assert(stock && stock.miktar === 20 && stock.maliyet === 1000, 'Stok miktarı ve birim maliyeti doğru kaydediliyor.');

        console.log('\n--- Satış, iş emri, teslim ve fatura ---');
        dom.window.renderCariler();
        dom.window.updateQuoteMaterials();
        set('quote-type', 'lazer');
        set('quote-customer', customer.id);
        set('quote-material', stock.id);
        set('quote-material-qty', 2);
        set('quote-description', 'Uçtan uca muhasebe test işi');
        set('quote-minutes', 60);
        set('quote-rate', 100);
        set('quote-discount', 10);
        set('quote-tax-rate', 20);
        dom.window.calculateQuote();
        assert(dom.window.document.getElementById('summary-total').textContent.includes('8.640,00'), 'Teklifte iskonto ve KDV sonucu 8.640 TL hesaplanıyor.');
        dom.window.approveQuoteAsOrder();
        const quote = db.teklifler[0];
        const order = db.isEmirleri[0];
        assert(quote?.orderId === order?.id && order?.total === 8640, 'Onay işlemi teklifi kaydedip tek iş emri oluşturuyor.');
        assert(dom.window.eval(`getReservedStockQuantity(${stock.id}, 'miktar')`) === 2, 'İş emri iki plakayı rezerve ediyor.');

        changeOrderStatus(order, 'Üretimde');
        assert(balance(customer) === 0 && stock.miktar === 20, 'Üretim aşaması stok ve cari bakiyeyi erken değiştirmiyor.');
        changeOrderStatus(order, 'Teslim Edildi');
        assert(balance(customer) === 8640 && stock.miktar === 18, 'Teslimatta satış cariye ve stok çıkışına bir kez yansıyor.');

        dom.window.renderCariler();
        set('input-fatura-tur', 'kesilen');
        set('input-fatura-firma', customer.id);
        dom.window.populateInvoiceOrderOptions();
        set('input-fatura-order', order.id);
        dom.window.applyInvoiceOrderSelection();
        set('input-fatura-no', 'SAT-TEST-001');
        set('input-fatura-aciklama', 'Teslim edilen iş faturası');
        dom.window.saveFatura();
        let saleInvoice = db.faturalar.find(item => item.faturaNo === 'SAT-TEST-001');
        assert(saleInvoice?.cariBakiyeDegisimi === 0 && balance(customer) === 8640, 'Teslim edilmiş iş faturası borcu ikinci kez artırmıyor.');
        dom.window.deleteFatura(saleInvoice.id);
        assert(!order.faturaKesildi && balance(customer) === 8640, 'Fatura iptali iş emrini yeniden faturalanabilir yapıp teslim borcunu koruyor.');
        assert(db.islemler.some(item => item.tip.includes('Fatura Silindi') && item.bakiyeDegisimi === 0), 'Sıfır etkili fatura iptali cari geçmişinde iz bırakıyor.');

        set('input-fatura-tur', 'kesilen');
        set('input-fatura-firma', customer.id);
        dom.window.populateInvoiceOrderOptions();
        set('input-fatura-order', order.id);
        dom.window.applyInvoiceOrderSelection();
        set('input-fatura-no', 'SAT-TEST-002');
        dom.window.saveFatura();
        saleInvoice = db.faturalar.find(item => item.faturaNo === 'SAT-TEST-002');
        assert(!!saleInvoice && order.faturaKesildi && balance(customer) === 8640, 'İptal edilen iş emrine yeni fatura yeniden kesilebiliyor.');

        const linkedSaleMovement = db.islemler.find(item => String(item.id) === String(order.cariIslemId));
        const beforeBlockedReversal = balance(customer);
        dom.window.reverseCariMovement(linkedSaleMovement.id);
        assert(balance(customer) === beforeBlockedReversal && alerts.at(-1).includes('İş Emri'), 'İş emrine bağlı satış cari ekranından yanlışlıkla geri alınamıyor.');

        console.log('\n--- Tahsilat ve kontrollü geri alma ---');
        const saveCariTransaction = (cari, type, amount, description) => {
            dom.window.openIslemModal(cari.id, cari.adi);
            set('input-islem-tipi', type);
            dom.window.updateIslemTipiInfo();
            set('input-islem-tutar', amount);
            set('input-islem-aciklama', description);
            if (type === 'tahsilat' || type === 'odeme_yaptik') set('input-islem-kasa', bank.id);
            dom.window.saveIslem();
            return db.islemler.at(-1);
        };
        let collection = saveCariTransaction(customer, 'tahsilat', 3000, 'Kısmi banka tahsilatı');
        assert(balance(customer) === 5640 && cashBalance(bank) === 53000, 'Kısmi tahsilat cari borcu azaltıp banka bakiyesini artırıyor.');
        dom.window.reverseCariMovement(collection.id);
        assert(balance(customer) === 8640 && cashBalance(bank) === 50000, 'Tahsilat geri alınınca cari ve banka birlikte eski haline dönüyor.');
        const movementCountAfterFirstReversal = db.islemler.length;
        dom.window.reverseCariMovement(collection.id);
        assert(db.islemler.length === movementCountAfterFirstReversal && alerts.at(-1).includes('daha önce'), 'Aynı hareket ikinci kez geri alınamıyor.');
        collection = saveCariTransaction(customer, 'tahsilat', 3000, 'Geçerli kısmi tahsilat');

        console.log('\n--- Alış faturası, tedarikçi ödemesi ve vade planı ---');
        dom.window.renderCariler();
        set('input-fatura-tur', 'alinan');
        dom.window.updateInvoiceModalMode();
        set('input-fatura-firma', supplier.id);
        set('input-fatura-no', 'ALS-TEST-001');
        set('input-fatura-aciklama', 'Sac malzeme alımı');
        set('input-fatura-tutar', 12000);
        dom.window.saveFatura();
        const purchaseInvoice = db.faturalar.find(item => item.faturaNo === 'ALS-TEST-001');
        assert(balance(supplier) === -12000, 'Alınan fatura tedarikçiye 12.000 TL borç oluşturuyor.');

        const supplierPayment = saveCariTransaction(supplier, 'odeme_yaptik', 5000, 'Tedarikçi kısmi ödemesi');
        assert(balance(supplier) === -7000 && cashBalance(bank) === 48000, 'Tedarikçi ödemesi borcu ve bankayı doğru azaltıyor.');

        dom.window.openPaymentPlanModal(supplier.id);
        set('input-plan-tip', 'odeme');
        set('input-plan-vade', '2026-08-15');
        set('input-plan-aciklama', 'Kalan borç vade testi');
        set('input-plan-tutar', 2000);
        set('input-plan-kasa', bank.id);
        dom.window.savePaymentPlan();
        const plan = db.odemePlanlari[0];
        dom.window.openPaymentPlanModal('', plan.id);
        set('input-plan-tutar', 2500);
        set('input-plan-aciklama', 'Kalan borç vade testi güncel');
        dom.window.savePaymentPlan();
        assert(plan.tutar === 2500 && db.odemePlanlari.length === 1, 'Bekleyen vade planı silinmeden düzenleniyor.');
        dom.window.markPaymentPlanPaid(plan.id, bank.id);
        assert(balance(supplier) === -4500 && cashBalance(bank) === 45500, 'Vade planı ödendiğinde cari ve banka etkileniyor.');
        dom.window.undoPaymentPlanSettlement(plan.id);
        assert(plan.durum === 'beklemede' && balance(supplier) === -7000 && cashBalance(bank) === 48000, 'Hatalı vade kapatma silmeden ters kayıtla geri alınıp plan yeniden beklemeye dönüyor.');
        dom.window.openPaymentPlanModal('', plan.id);
        set('input-plan-tutar', 2000);
        dom.window.savePaymentPlan();
        dom.window.markPaymentPlanPaid(plan.id, bank.id);
        dom.window.deletePaymentPlan(plan.id);
        assert(balance(supplier) === -7000 && cashBalance(bank) === 48000, 'Ödenmiş vade planı silinince her iki etki ters kayıtla geri dönüyor.');

        console.log('\n--- Gider ve personel maaşı ---');
        dom.window.openGiderModal();
        set('input-gider-kategori', 'Elektrik');
        set('input-gider-aciklama', 'Muhasebe senaryo testi');
        set('input-gider-tutar', 1500);
        set('input-gider-kasa', bank.id);
        dom.window.saveGider();
        const expense = db.giderler.find(item => item.aciklama === 'Muhasebe senaryo testi');
        assert(cashBalance(bank) === 46500, 'Gider ödemesi bankadan çıkıyor.');
        dom.window.deleteGider(expense.id);
        assert(cashBalance(bank) === 48000 && !db.giderler.includes(expense), 'Gider silinince banka hareketi ters kayıtla düzeliyor.');

        set('input-personel-id', '');
        set('input-personel-ad', 'Muhasebe Test Personeli');
        set('input-personel-tel', '0555 300 3000');
        set('input-personel-gorev', 'Operatör');
        set('input-personel-maas-tipi', 'aylik');
        set('input-personel-maas', 30000);
        set('input-personel-giris', '2026-07-01');
        set('input-personel-durum', 'Aktif');
        dom.window.savePersonel();
        const employee = db.personeller[0];
        dom.window.openPayrollModal('', employee.id);
        set('input-puantaj-ay', '2026-07');
        set('input-puantaj-gun', 30);
        set('input-puantaj-izin', 0);
        set('input-puantaj-eksik', 1);
        set('input-puantaj-mesai-saat', 0);
        set('input-puantaj-mesai-ucret', 0);
        set('input-puantaj-avans', 0);
        set('input-puantaj-prim', 0);
        set('input-puantaj-odendi', true);
        dom.window.togglePayrollPaymentAccount();
        set('input-puantaj-kasa', bank.id);
        dom.window.savePuantaj();
        const payroll = db.personelPuantajlari[0];
        assert(payroll.netMaas === 29000 && cashBalance(bank) === 19000, 'Bir eksik günlü maaş 29.000 TL hesaplanıp bankadan çıkıyor.');

        dom.window.openPayrollModal('', employee.id);
        set('input-puantaj-ay', '2026-07');
        set('input-puantaj-gun', 26);
        dom.window.savePuantaj();
        const duplicateError = dom.window.document.getElementById('input-puantaj-ay-error');
        assert(db.personelPuantajlari.length === 1 && duplicateError?.textContent.includes('seçilen dönemde kaydı var'), 'Aynı personel ve ay için mükerrer maaş kaydı alan içi uyarıyla engelleniyor.');

        dom.window.openPayrollModal(payroll.id, employee.id);
        set('input-puantaj-prim', 1000);
        dom.window.savePuantaj();
        assert(payroll.netMaas === 30000 && cashBalance(bank) === 18000, 'Ödenmiş maaş düzenlenince eski banka çıkışı terslenip yeni tutar uygulanıyor.');
        dom.window.deletePuantaj(payroll.id);
        assert(db.personelPuantajlari.length === 0 && cashBalance(bank) === 48000, 'Maaş kaydı silinince gider ve banka etkisi geri alınıyor.');

        console.log('\n--- Çek/senet ve kapanış mutabakatı ---');
        dom.window.openCekSenetModal();
        set('input-ceksenet-tip', 'verilen_cek');
        dom.window.updateCekSenetStatusOptions();
        set('input-ceksenet-cari', supplier.id);
        set('input-ceksenet-no', 'CEK-OUT-001');
        set('input-ceksenet-banka', 'Muhasebe Test Bankası');
        set('input-ceksenet-vade', '2026-08-20');
        set('input-ceksenet-tutar', 3000);
        set('input-ceksenet-durum', 'beklemede');
        dom.window.saveCekSenet();
        const cheque = db.cekSenetler[0];
        assert(balance(supplier) === -7000 && cashBalance(bank) === 48000, 'Bekleyen verilen çek henüz cari ve bankayı etkilemiyor.');
        dom.window.updateCekSenetStatus(cheque.id, 'odendi');
        set('input-settlement-kasa', bank.id);
        dom.window.confirmSettlement();
        assert(balance(supplier) === -4000 && cashBalance(bank) === 45000, 'Verilen çek ödendiğinde tedarikçi borcu ve banka azalıyor.');
        dom.window.updateCekSenetStatus(cheque.id, 'iptal');
        assert(balance(supplier) === -7000 && cashBalance(bank) === 48000, 'Ödenen çek iptal edilince cari ve banka etkisi geri alınıyor.');

        dom.window.deleteFatura(purchaseInvoice.id);
        assert(balance(supplier) === 5000, 'Alış faturası silinince fatura borcu ters kayıtla kalkıyor.');
        dom.window.reverseCariMovement(supplierPayment.id);
        assert(balance(supplier) === 0 && cashBalance(bank) === 53000, 'Bağımsız tedarikçi ödemesi geri alınınca kapanış bakiyesi mutabık oluyor.');

        const sameNameCari = { id: dom.window.eval('createRecordId()'), kodu: 'C-AYNI', adi: customer.adi, tel: '-', bakiye: 0, durum: 'Temiz' };
        db.cariler.push(sameNameCari);
        db.islemler.push({
            id: dom.window.eval('createRecordId()'), cariId: sameNameCari.id, firma: sameNameCari.adi,
            tarih: '19.07.2026 10:00', tip: 'Aynı İsimli Başka Cari', aciklama: 'Bu hareket karışmamalı',
            tutar: 0, bakiyeDegisimi: 0, isGelir: false
        });
        db.islemler.push({
            id: dom.window.eval('createRecordId()'), firma: customer.adi,
            tarih: '19.07.2026 10:01', tip: 'Eski Kayıt', aciklama: 'Kimliksiz eski hareket görünmeli',
            tutar: 0, bakiyeDegisimi: 0, isGelir: false
        });
        dom.window.openCariDetay(customer.id);
        const selectedCariDescriptions = dom.window.currentCariHistory.map(item => item.aciklama);
        assert(!selectedCariDescriptions.includes('Bu hareket karışmamalı'), 'Aynı isimli başka carinin kimlikli hareketi seçilen hesaba karışmıyor.');
        assert(selectedCariDescriptions.includes('Kimliksiz eski hareket görünmeli'), 'Kimliği olmayan eski hareketler firma adıyla geriye dönük görünmeye devam ediyor.');

        const allRecords = ['cariler', 'stoklar', 'islemler', 'teklifler', 'giderler', 'faturalar', 'isEmirleri',
            'personeller', 'personelPuantajlari', 'cekSenetler', 'odemePlanlari', 'kasaHesaplari',
            'kasaHareketleri', 'stokHareketleri', 'denetimKayitlari']
            .flatMap(key => db[key].map(item => ({ key, id: String(item.id) })));
        assert(new Set(allRecords.map(item => item.id)).size === allRecords.length, 'Tüm modüllerde oluşturulan kayıt kimlikleri benzersiz kalıyor.');

        const customerMovementTotal = db.islemler
            .filter(item => item.cariId == customer.id)
            .reduce((sum, item) => sum + (Number(item.bakiyeDegisimi) || 0), 0);
        const supplierMovementTotal = db.islemler
            .filter(item => item.cariId == supplier.id)
            .reduce((sum, item) => sum + (Number(item.bakiyeDegisimi) || 0), 0);
        assert(Math.round(customerMovementTotal * 100) / 100 === balance(customer), 'Müşteri bakiyesi cari hareket toplamıyla mutabık.');
        assert(Math.round(supplierMovementTotal * 100) / 100 === balance(supplier), 'Tedarikçi bakiyesi cari hareket toplamıyla mutabık.');

        const cashMovementTotal = db.kasaHareketleri.reduce((sum, item) => {
            const amount = Number(item.tutar) || 0;
            return sum + (item.tip === 'cikis' ? -amount : amount);
        }, 0);
        assert(Math.round(cashMovementTotal * 100) / 100 === cashBalance(bank), 'Banka bakiyesi bütün giriş, çıkış ve ters kayıtların toplamıyla mutabık.');
        assert(balance(customer) === 5640 && balance(supplier) === 0 && cashBalance(bank) === 53000, 'Senaryo 5.640 TL müşteri alacağı, sıfır tedarikçi borcu ve 53.000 TL banka ile kapanıyor.');
        assert(db.islemler.filter(item => item.reversalOf).every(item => db.islemler.some(original => String(original.id) === String(item.reversalOf) && String(original.reversedBy) === String(item.id))), 'Her ters cari kayıt kaynak hareketle çift yönlü bağlı.');
    } catch (error) {
        failures++;
        console.error('UNCAUGHT TEST ERROR:', error.stack || error);
    }

    console.log(`\nAccounting audit: ${checks} checks, ${failures} failures.`);
    if (failures) process.exitCode = 1;
}, 700);
