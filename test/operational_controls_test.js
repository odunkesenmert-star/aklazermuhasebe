const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://operations-audit.local' });

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
const downloads = [];
let confirmations = [];
const confirmationMessages = [];
let backupResult = { success: true, path: '/tmp/auto-backup.json' };
let saveFileResult = { success: true, path: '/tmp/ak-lazer-db.json' };
let restoreResult = { success: false, canceled: true };
let restoreCalls = 0;
let manualBackupPayload = '';

dom.window.alert = message => alerts.push(String(message));
dom.window.confirm = message => {
    confirmationMessages.push(String(message));
    return confirmations.length ? confirmations.shift() : true;
};
dom.window.URL.createObjectURL = () => 'blob:operational-test';
dom.window.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function() {
    downloads.push({ filename: this.download, href: this.href });
};
dom.window.electronAPI = {
    sendBackup: async () => backupResult,
    saveDBToFile: async () => saveFileResult,
    manualBackup: async data => {
        manualBackupPayload = data;
        return { success: true, path: '/tmp/manual-backup.json' };
    },
    restoreBackup: async () => {
        restoreCalls++;
        return restoreResult;
    },
    openAttachment: async () => ({ success: false, error: 'Dosya bulunamadı' })
};

const script = dom.window.document.createElement('script');
script.textContent = fs.readFileSync('./app.js', 'utf8');
dom.window.document.body.appendChild(script);

setTimeout(async () => {
    let checks = 0;
    let failures = 0;
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
    const getDB = () => dom.window.eval('db');

    try {
        dom.window.eval('db = createEmptyDatabase(); startupNeedsDiskHydration = false; startupPersistenceBlocked = false;');
        let db = getDB();
        db.cariler = [];
        db.stoklar = [];
        db.isEmirleri = [];
        db.fireler = [];
        db.personeller = [];
        db.personelPuantajlari = [];
        db.cekSenetler = [];
        db.kasaHareketleri = [];
        db.denetimKayitlari = [];

        console.log('\n--- Ayarlar ve tarih kontrolleri ---');
        dom.window.openAyarlarModal();
        set('input-ayar-firma', 'Operasyon Test Firması');
        set('input-ayar-tel', '0555 555 55 55');
        set('input-num-cari-prefix', 'op');
        set('input-ayar-makine-dakika-maliyeti', 12.5);
        set('input-ayar-iscilik-saat-maliyeti', 250);
        dom.window.saveAyarlar();
        assert(db.ayarlar.firmaAdi === 'Operasyon Test Firması' && db.ayarlar.numaralandirma.cari.prefix === 'OP', 'Firma ve numaralandırma ayarları kaydediliyor.');
        assert(db.ayarlar.karlilik.makineDakikaMaliyeti === 12.5 && db.ayarlar.karlilik.iscilikSaatMaliyeti === 250, 'Kârlılık varsayılanları kaydediliyor.');

        dom.window.setReportDatePreset('expenses', 'thisYear');
        const currentYear = String(new Date().getFullYear());
        assert(set('report-date-expenses-start', dom.window.document.getElementById('report-date-expenses-start').value).value.startsWith(currentYear), 'Raporlarda Bu Yıl seçimi doğru yılı dolduruyor.');
        dom.window.setReportDatePreset('quotes', 'thisWeek');
        const quoteWeekStart = new Date(`${dom.window.document.getElementById('report-date-quotes-start').value}T12:00:00`);
        const quoteWeekEnd = new Date(`${dom.window.document.getElementById('report-date-quotes-end').value}T12:00:00`);
        assert(quoteWeekStart.getDay() === 1 && quoteWeekEnd.getDay() === 0 && Math.round((quoteWeekEnd - quoteWeekStart) / 86400000) === 6, 'Teklif geçmişinde Bu Hafta pazartesi-pazar aralığını dolduruyor.');
        set('report-date-expenses-start', `${currentYear}-12-31`);
        set('report-date-expenses-end', `${currentYear}-01-01`);
        dom.window.applyReportDateFilter('expenses');
        assert(dom.window.document.getElementById('report-date-expenses-label').textContent.includes('hatalı'), 'Ters tarih aralığı kullanıcıya hatalı olarak gösteriliyor.');
        dom.window.setAccountPrintDatePreset('thisMonth');
        assert(!!dom.window.document.getElementById('account-print-date-start').value && !!dom.window.document.getElementById('account-print-date-end').value, 'Cari ekstre tarih kısayolu başlangıç ve bitişi dolduruyor.');

        console.log('\n--- Cari, stok, fire ve kasa kontrolleri ---');
        set('input-cari-adi', 'Operasyon Cari');
        set('input-cari-tel', '0555 000 00 00');
        set('input-cari-tur', 'her_ikisi');
        set('input-cari-yetkili', 'Ayşe Yetkili');
        set('input-cari-email', 'operasyon@example.com');
        set('input-cari-adres', 'Sanayi Mahallesi No: 1');
        set('input-cari-vergi-dairesi', 'Sanayi');
        set('input-cari-vergi-no', '1234567890');
        set('input-cari-vade', 30);
        set('input-cari-iban', 'TR00 0000 0000 0000 0000 0000 01');
        dom.window.saveCari();
        const cari = db.cariler.find(item => item.adi === 'Operasyon Cari');
        assert(cari.cariTuru === 'her_ikisi' && cari.yetkili === 'Ayşe Yetkili' && cari.vadeGun === 30 && cari.iban.endsWith('0001'), 'Cari kartın isteğe bağlı iletişim, vergi, vade ve IBAN alanları kaydediliyor.');
        cari.bakiye = 100;
        dom.window.editCari(cari.id);
        set('input-duzenle-pasif', true);
        dom.window.updateCari();
        assert(!cari.isPasif, 'Bakiyesi olan cari pasife alınamıyor.');
        cari.bakiye = 0;
        set('input-duzenle-adi', 'Operasyon Cari Güncel');
        dom.window.updateCari();
        assert(cari.adi === 'Operasyon Cari Güncel' && cari.isPasif === true, 'Bakiyesi kapanan cari düzenlenip pasife alınabiliyor.');
        cari.isPasif = false;
        dom.window.renderCariler();

        set('input-stok-sahibi', 'biz');
        dom.window.toggleStokCariSelect();
        set('input-stok-cinsi', 'Operasyon Test Sacı');
        set('input-stok-mm', 3);
        set('input-stok-miktar', 10);
        set('input-stok-kg', 1000);
        set('input-stok-en', 1500);
        set('input-stok-boy', 3000);
        set('input-stok-maliyet', 900);
        set('input-stok-kritik', 2);
        dom.window.saveStok();
        const stock = db.stoklar[0];
        db.isEmirleri.push({ id: 9001, stokId: stock.id, stokQty: 4, durum: 'Beklemede' });
        dom.window.openStokDuzenleModal(stock.id);
        set('input-duzenle-stok-miktar', 3);
        dom.window.updateStok();
        assert(stock.miktar === 10, 'Stok miktarı aktif rezervasyonun altına indirilemiyor.');
        set('input-duzenle-stok-miktar', 8);
        set('input-duzenle-stok-kg', 800);
        set('input-duzenle-stok-en', 1250);
        set('input-duzenle-stok-boy', 2500);
        set('input-duzenle-stok-sahibi', 'musteri');
        dom.window.toggleDuzenleStokCariSelect();
        set('input-duzenle-stok-cari', cari.id);
        dom.window.updateStok();
        assert(stock.miktar === 8 && db.stokHareketleri.some(item => item.tip === 'Stok Düzeltme' && item.sonraki === 8), 'Geçerli stok düzeltmesi hareket geçmişine yazılıyor.');
        assert(stock.kg === 800 && stock.en === 1250 && stock.boy === 2500 && stock.cariId == cari.id && stock.maliyet === 0, 'Stok düzenlemede ağırlık, en, boy ve müşteri sahipliği veri kaybı olmadan güncelleniyor.');

        dom.window.openFireModal();
        set('input-fire-sahibi', 'biz');
        set('input-fire-tur', 'kullanilabilir');
        set('input-fire-cinsi', 'Operasyon Fire');
        set('input-fire-mm', 3);
        set('input-fire-en', 250);
        set('input-fire-boy', 400);
        set('input-fire-miktar', 2);
        set('input-fire-kg', 14.5);
        set('input-fire-is-emri', 9001);
        set('input-fire-neden', 'Deneme kesimi sonrası kaldı');
        dom.window.saveFire();
        const scrapId = db.fireler[0]?.id;
        assert(!!scrapId && db.fireler[0].tur === 'kullanilabilir' && db.fireler[0].miktar === 2 && db.fireler[0].kg === 14.5 && db.fireler[0].isEmriId === 9001, 'Fire/parça tür, miktar, ağırlık, neden ve iş emri bağlantısıyla kaydediliyor.');
        dom.window.openFireModal(scrapId);
        set('input-fire-cinsi', 'Operasyon Fire Güncel');
        set('input-fire-miktar', 3);
        dom.window.saveFire();
        assert(db.fireler.length === 1 && db.fireler[0].cinsi === 'Operasyon Fire Güncel' && db.fireler[0].miktar === 3, 'Fire/parça kaydı silip yeniden oluşturmadan düzenlenebiliyor.');
        dom.window.deleteFire(scrapId);
        assert(db.fireler.length === 0, 'Fire/parça kaydı kontrollü siliniyor.');

        const cash = db.kasaHesaplari[0];
        dom.window.openKasaHareketModal();
        set('input-kasa-hareket-hesap', cash.id);
        set('input-kasa-hareket-tip', 'giris');
        set('input-kasa-hareket-aciklama', 'Manuel kasa testi');
        set('input-kasa-hareket-tutar', 500);
        dom.window.saveKasaHareket();
        const manualCashMovement = db.kasaHareketleri.find(item => item.kaynak === 'manuel');
        assert(cash.bakiye === 500 && !!manualCashMovement && manualCashMovement.tarih, 'Manuel kasa girişi tarih bilgisiyle hesaba ve hareket listesine yansıyor.');

        const expenseCash = { id: 9201, kodu: 'BNK-TEST', ad: 'Gider Test Bankası', tip: 'banka', bakiye: 1000 };
        db.kasaHesaplari.push(expenseCash);
        dom.window.openGiderModal();
        set('input-gider-tarih', '2026-07-15');
        set('input-gider-belge-no', 'GDR-TEST-001');
        set('input-gider-kategori', 'Bakım');
        set('input-gider-tutar', 100);
        set('input-gider-kdv-tipi', 'haric');
        set('input-gider-kdv-orani', 20);
        set('input-gider-aciklama', 'Makine bakımı');
        set('input-gider-kasa', expenseCash.id);
        set('input-gider-cari', cari.id);
        dom.window.saveGider();
        const expense = db.giderler.find(item => item.belgeNo === 'GDR-TEST-001');
        assert(expense?.tarih === '15.07.2026' && expense.matrah === 100 && expense.kdvTutari === 20 && expense.tutar === 120 && expense.cariId == cari.id && expenseCash.bakiye === 880, 'Gider geçmiş tarih, belge, cari ve KDV kırılımıyla kaydediliyor.');
        dom.window.openGiderModal(expense.id);
        set('input-gider-tutar', 200);
        dom.window.saveGider();
        assert(expense.matrah === 200 && expense.tutar === 240 && expenseCash.bakiye === 760, 'Gider düzenlenince eski kasa etkisi terslenip yeni KDV dahil toplam uygulanıyor.');
        assert(dom.window.document.querySelectorAll('#modal-gider .modal-body').length === 1 && dom.window.document.querySelectorAll('#modal-gider form.modal-form-element').length === 1, 'Tekrar açılan uzun formda gövde veya form kabuğu çoğalmıyor.');

        dom.window.openFaturaModal();
        set('input-fatura-tur', 'kesilen');
        set('input-fatura-no', 'FTR-TEST-001');
        set('input-fatura-tarih', '2026-07-16');
        set('input-fatura-vade', '2026-08-15');
        set('input-fatura-firma', cari.id);
        dom.window.populateInvoiceOrderOptions();
        set('input-fatura-aciklama', 'Serbest test faturası');
        set('input-fatura-matrah', 100);
        set('input-fatura-kdv-orani', 20);
        dom.window.updateInvoiceTaxPreview('matrah');
        set('input-fatura-odeme-durumu', 'odenmedi');
        set('input-fatura-seri', 'A / 000001');
        set('input-fatura-vergi-no', '1234567890');
        dom.window.saveFatura();
        const invoice = db.faturalar.find(item => item.faturaNo === 'FTR-TEST-001');
        assert(invoice?.faturaTarihi === '16.07.2026' && invoice.vadeTarihi === '15.08.2026' && invoice.matrah === 100 && invoice.kdvTutari === 20 && invoice.tutar === 120 && invoice.odemeDurumu === 'odenmedi' && invoice.seriSira === 'A / 000001', 'Fatura tarih, vade, vergi kırılımı, seri ve ödeme durumuyla kaydediliyor.');

        console.log('\n--- Personel, çek/senet, Excel ve ek kontrolleri ---');
        set('input-personel-id', '');
        set('input-personel-ad', 'Operasyon Personeli');
        set('input-personel-gorev', 'Operatör');
        set('input-personel-maas', 20000);
        set('input-personel-bolum', 'Üretim');
        set('input-personel-tc', '12345678901');
        set('input-personel-sgk', 'SGK-001');
        set('input-personel-ucret-tarih', '2026-07-01');
        dom.window.savePersonel();
        const personnel = db.personeller.find(item => item.ad === 'Operasyon Personeli');
        assert(personnel?.bolum === 'Üretim' && personnel.tcKimlikNo === '12345678901' && personnel.sgkSicilNo === 'SGK-001', 'Personel bölüm, kimlik, SGK ve ücret geçerlilik bilgileriyle kaydediliyor.');
        db.personelPuantajlari.push({ id: 9102, personelId: personnel.id, donem: '2026-07', netMaas: 20000 });
        dom.window.deletePersonel(personnel.id);
        assert(personnel.durum === 'Ayrıldı', 'Maaş geçmişi olan personel silinmeyip Ayrıldı durumuna alınıyor.');

        cari.bakiye = 1000;
        set('input-ceksenet-tip', 'alinan_cek');
        dom.window.updateCekSenetStatusOptions();
        dom.window.openCekSenetModal();
        set('input-ceksenet-cari', cari.id);
        set('input-ceksenet-no', 'OP-CEK-001');
        set('input-ceksenet-vade', '2026-08-01');
        set('input-ceksenet-tutar', 400);
        set('input-ceksenet-kesideci', 'Operasyon Cari Güncel');
        set('input-ceksenet-lehtar', 'AK LAZER');
        set('input-ceksenet-seri', 'AB-001');
        set('input-ceksenet-iban', 'TR00 0000 0000 0000 0000 0000 02');
        set('input-ceksenet-ciro', 'ciro_edildi');
        set('input-ceksenet-teslim', 'Muhasebe');
        set('input-ceksenet-durum', 'beklemede');
        dom.window.saveCekSenet();
        const cheque = db.cekSenetler.find(item => item.belgeNo === 'OP-CEK-001');
        dom.window.openCekSenetModal(cheque.id);
        set('input-ceksenet-banka', 'Test Bankası / Güncel Şube');
        dom.window.saveCekSenet();
        assert(cheque.banka === 'Test Bankası / Güncel Şube' && db.cekSenetler.length === 1, 'Bekleyen çek/senet belge bilgileri finans etkisi oluşturmadan düzenlenebiliyor.');
        dom.window.updateCekSenetStatus(cheque.id, 'tahsil_edildi');
        set('input-settlement-kasa', cash.id);
        dom.window.confirmSettlement();
        const cashAfterCheque = cash.bakiye;
        assert(cari.bakiye === 600 && cashAfterCheque === 900, 'Tahsil edilen çek cari ve kasaya birlikte yansıyor.');
        dom.window.showCekSenetHistory(cheque.id);
        assert(cheque.kesideci === 'Operasyon Cari Güncel' && cheque.seriNo === 'AB-001' && cheque.ciroDurumu === 'ciro_edildi' && cheque.durumGecmisi.length > 0 && dom.window.document.getElementById('modal-ceksenet-history').textContent.includes('Durum Tarihçesi'), 'Çek/senet belge alanları ve görünür durum tarihçesi saklanıyor.');
        dom.window.deleteCekSenet(cheque.id);
        assert(cari.bakiye === 1000 && cash.bakiye === 500 && db.cekSenetler.length === 0, 'Tahsil edilmiş çek silinince cari ve kasa etkisi ters kayıtla geri alınıyor.');
        dom.window.undoManualCashMovement(manualCashMovement.id);
        assert(cash.bakiye === 0 && manualCashMovement.reversedBy && db.kasaHareketleri.some(item => item.refId === manualCashMovement.id), 'Yanlış manuel kasa hareketi silinmeden ters kayıtla geri alınabiliyor.');

        dom.window.openKasaHesapModal();
        set('input-kasa-ad', 'Geçici Test Hesabı');
        set('input-kasa-tip', 'banka');
        set('input-kasa-bakiye', 0);
        dom.window.saveKasaHesap();
        const temporaryAccount = db.kasaHesaplari.find(item => item.ad === 'Geçici Test Hesabı');
        dom.window.openKasaHesapModal(temporaryAccount.id);
        set('input-kasa-ad', 'Geçici Test Hesabı Güncel');
        dom.window.saveKasaHesap();
        dom.window.toggleKasaHesapStatus(temporaryAccount.id);
        assert(temporaryAccount.ad === 'Geçici Test Hesabı Güncel' && temporaryAccount.isPasif === true, 'Kasa/banka hesabı düzenlenip geçmişi korunarak pasife alınabiliyor.');
        dom.window.toggleKasaHesapStatus(temporaryAccount.id);
        dom.window.deleteKasaHesap(temporaryAccount.id);
        assert(!db.kasaHesaplari.some(item => item.id === temporaryAccount.id), 'Hiç kullanılmamış sıfır bakiyeli kasa/banka hesabı güvenle silinebiliyor.');

        dom.window.renderCariler();
        dom.window.toggleReportSelection('accounts', cari.id, true);
        dom.window.exportSelectedListToExcel('accounts');
        assert(downloads.some(item => item.filename.endsWith('.xls') && item.filename.includes('secilen')), 'Seçili cari listesi Excel uyumlu dosya olarak indiriliyor.');

        await dom.window.openAttachmentPath('/tmp/olmayan-belge.pdf');
        assert(alerts.some(message => message.includes('Dosya bulunamadı')), 'Bulunamayan belge eki sessizce kaybolmak yerine hata veriyor.');

        dom.window.openModal('modal-cari');
        await new Promise(resolve => setTimeout(resolve, 0));
        set('input-cari-adi', 'Kaydedilmemiş Değişiklik');
        const dirtyBeforeClose = dom.window.eval("isModalFormDirty(document.getElementById('modal-cari'))");
        confirmations = [false];
        dom.window.requestCloseModal('modal-cari');
        assert(dirtyBeforeClose && dom.window.document.getElementById('modal-cari').classList.contains('active') && confirmationMessages.at(-1)?.includes('kaydedilmemiş değişiklikler'), 'Değiştirilmiş form kapatılırken kaydedilmemiş veri uyarısı gösteriliyor.');
        dom.window.closeModal('modal-cari');

        console.log('\n--- Denetim geçmişi ---');
        dom.window.renderAuditTrail();
        db = getDB();
        assert(db.denetimKayitlari.some(record => record.entityType === 'Cari' && record.action === 'Oluşturuldu') && db.denetimKayitlari.some(record => record.entityType === 'Stok'), 'Cari ve stok değişiklikleri denetim geçmişine kaydediliyor.');
        assert(dom.window.document.getElementById('audit-tbody').textContent.includes('Yerel Kullanıcı'), 'Denetim geçmişi tarih, işlem, kayıt türü ve kullanıcı bilgisiyle listeleniyor.');
        set('audit-search', 'Kasa');
        dom.window.handleHighVolumeSearch('audit');
        assert([...dom.window.document.querySelectorAll('#audit-tbody tr')].every(row => row.textContent.includes('Kasa')), 'Denetim geçmişi yoğun kayıtlarda metinle filtrelenebiliyor.');
        set('audit-search', '');
        dom.window.handleHighVolumeSearch('audit');
        const firstAuditCheck = dom.window.document.querySelector('input[data-select-row="audit"]');
        if (firstAuditCheck) dom.window.toggleReportSelection('audit', firstAuditCheck.value, true);
        dom.window.exportSelectedListToExcel('audit');
        assert(downloads.some(item => item.filename.includes('denetim-geçmişi-secilen')), 'Seçilen denetim kayıtları Excel uyumlu dosya olarak aktarılıyor.');

        console.log('\n--- Yedek, geri yükleme ve güvenli sıfırlama ---');
        await dom.window.eval('saveDB(true)');
        await dom.window.createManualBackup();
        assert(manualBackupPayload.includes('Operasyon Cari Güncel') && alerts.some(message => message.includes('başarıyla kaydedildi')), 'Manuel yedek geçerli veriyi masaüstü katmanına gönderiyor.');

        const originalName = cari.adi;
        const originalStorage = storage.AkLazerDB;
        backupResult = { success: false, error: 'Disk dolu' };
        restoreCalls = 0;
        confirmations = [true, true];
        restoreResult = { success: true, data: JSON.stringify({ cariler: [{ id: 1, adi: 'Yedekten Cari', bakiye: 0 }], stoklar: [], islemler: [] }) };
        await dom.window.restoreBackupFile();
        assert(restoreCalls === 0 && getDB().cariler.some(item => item.adi === originalName), 'Güvenlik yedeği alınamazsa geri yükleme başlamıyor ve mevcut veri korunuyor.');

        backupResult = { success: true };
        saveFileResult = { success: false, error: 'Kalıcı dosya yazılamadı' };
        confirmations = [true, true];
        await dom.window.restoreBackupFile();
        assert(getDB().cariler.some(item => item.adi === originalName) && storage.AkLazerDB === originalStorage, 'Geri yüklenen veri diske yazılamazsa çalışan veri ve yerel kayıt değişmiyor.');

        set('input-safe-reset', 'SIFIRLA');
        backupResult = { success: false, error: 'Yedek diski yok' };
        await dom.window.confirmSafeReset();
        assert(getDB().cariler.some(item => item.adi === originalName), 'Sıfırlama güvenlik yedeği olmadan mevcut veriyi silmiyor.');

        backupResult = { success: true };
        saveFileResult = { success: false, error: 'Salt okunur disk' };
        await dom.window.confirmSafeReset();
        assert(getDB().cariler.some(item => item.adi === originalName) && storage.AkLazerDB === originalStorage, 'Sıfırlama kalıcı dosyaya yazılamazsa mevcut veriyi ve yerel kaydı koruyor.');
    } catch (error) {
        failures++;
        console.error('UNCAUGHT TEST ERROR:', error.stack || error);
    }

    console.log(`\nOperational audit: ${checks} checks, ${failures} failures.`);
    process.exitCode = failures ? 1 : 0;
}, 50);
