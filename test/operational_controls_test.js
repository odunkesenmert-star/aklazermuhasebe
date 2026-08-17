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
let backupResult = { success: true, path: '/tmp/auto-backup.json' };
let saveFileResult = { success: true, path: '/tmp/ak-lazer-db.json' };
let restoreResult = { success: false, canceled: true };
let restoreCalls = 0;
let manualBackupPayload = '';

dom.window.alert = message => alerts.push(String(message));
dom.window.confirm = () => confirmations.length ? confirmations.shift() : true;
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
        dom.window.saveCari();
        const cari = db.cariler.find(item => item.adi === 'Operasyon Cari');
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
        dom.window.updateStok();
        assert(stock.miktar === 8 && db.stokHareketleri.some(item => item.tip === 'Stok Düzeltme' && item.sonraki === 8), 'Geçerli stok düzeltmesi hareket geçmişine yazılıyor.');

        set('input-fire-sahibi', 'biz');
        set('input-fire-cinsi', 'Operasyon Fire');
        set('input-fire-mm', 3);
        set('input-fire-en', 250);
        set('input-fire-boy', 400);
        dom.window.saveFire();
        const scrapId = db.fireler[0]?.id;
        assert(!!scrapId, 'Fire/parça kaydı oluşturuluyor.');
        dom.window.deleteFire(scrapId);
        assert(db.fireler.length === 0, 'Fire/parça kaydı kontrollü siliniyor.');

        const cash = db.kasaHesaplari[0];
        dom.window.openKasaHareketModal();
        set('input-kasa-hareket-hesap', cash.id);
        set('input-kasa-hareket-tip', 'giris');
        set('input-kasa-hareket-aciklama', 'Manuel kasa testi');
        set('input-kasa-hareket-tutar', 500);
        dom.window.saveKasaHareket();
        assert(cash.bakiye === 500 && db.kasaHareketleri.some(item => item.kaynak === 'manuel'), 'Manuel kasa girişi hesaba ve hareket listesine yansıyor.');

        console.log('\n--- Personel, çek/senet, Excel ve ek kontrolleri ---');
        db.personeller.push({ id: 9101, ad: 'Operasyon Personeli', durum: 'Aktif', maas: 20000 });
        db.personelPuantajlari.push({ id: 9102, personelId: 9101, donem: '2026-07', netMaas: 20000 });
        dom.window.deletePersonel(9101);
        assert(db.personeller[0].durum === 'Ayrıldı', 'Maaş geçmişi olan personel silinmeyip Ayrıldı durumuna alınıyor.');

        cari.bakiye = 1000;
        set('input-ceksenet-tip', 'alinan_cek');
        dom.window.updateCekSenetStatusOptions();
        dom.window.openCekSenetModal();
        set('input-ceksenet-cari', cari.id);
        set('input-ceksenet-no', 'OP-CEK-001');
        set('input-ceksenet-vade', '2026-08-01');
        set('input-ceksenet-tutar', 400);
        set('input-ceksenet-durum', 'tahsil_edildi');
        set('input-ceksenet-kasa', cash.id);
        dom.window.saveCekSenet();
        const cheque = db.cekSenetler.find(item => item.belgeNo === 'OP-CEK-001');
        const cashAfterCheque = cash.bakiye;
        assert(cari.bakiye === 600 && cashAfterCheque === 900, 'Tahsil edilen çek cari ve kasaya birlikte yansıyor.');
        dom.window.deleteCekSenet(cheque.id);
        assert(cari.bakiye === 1000 && cash.bakiye === 500 && db.cekSenetler.length === 0, 'Tahsil edilmiş çek silinince cari ve kasa etkisi ters kayıtla geri alınıyor.');

        dom.window.renderCariler();
        dom.window.toggleReportSelection('accounts', cari.id, true);
        dom.window.exportSelectedListToExcel('accounts');
        assert(downloads.some(item => item.filename.endsWith('.xls') && item.filename.includes('secilen')), 'Seçili cari listesi Excel uyumlu dosya olarak indiriliyor.');

        await dom.window.openAttachmentPath('/tmp/olmayan-belge.pdf');
        assert(alerts.some(message => message.includes('Dosya bulunamadı')), 'Bulunamayan belge eki sessizce kaybolmak yerine hata veriyor.');

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
