const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://high-volume.local' });

let storage = {};
Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    value: {
        getItem: key => storage[key] || null,
        setItem: (key, value) => { storage[key] = String(value); },
        removeItem: key => { delete storage[key]; },
        clear: () => { storage = {}; }
    }
});

dom.window.alert = () => {};
dom.window.confirm = () => true;

const script = dom.window.document.createElement('script');
script.textContent = fs.readFileSync('./app.js', 'utf8');
dom.window.document.body.appendChild(script);

setTimeout(() => {
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

    try {
        dom.window.eval('enhanceContentPageLayouts()');
        const db = dom.window.eval('db');
        db.cariler = Array.from({ length: 205 }, (_, index) => ({
            id: index + 1,
            kodu: `C-${String(index + 1).padStart(4, '0')}`,
            adi: `Müşteri ${String(index + 1).padStart(4, '0')}`,
            tel: `0555 000 ${String(index + 1).padStart(4, '0')}`,
            bakiye: index % 2 === 0 ? 1000 + index : -(500 + index),
            durum: 'Aktif'
        }));

        dom.window.renderCariler();
        dom.window.eval('enhanceSortableTableHeaders("accounts")');
        assert(dom.window.document.querySelectorAll('#accounts-tbody tr').length === 25, '205 cari varsayılan olarak 25 kayıtlık sayfaya bölünüyor.');
        assert(dom.window.document.getElementById('accounts-page-info').textContent.includes('1–25 / 205 kayıt'), 'Cari sayfalama toplamı ve gösterilen aralığı açıklıyor.');
        assert(dom.window.document.getElementById('accounts-page-info').textContent.includes('Sayfa 1/9'), '205 cari için doğru toplam sayfa hesaplanıyor.');
        assert(dom.window.document.querySelectorAll('#accounts-tbody').length === 1 && dom.window.document.querySelectorAll('.table-sort-button').length >= 3, 'Cari tablosu erişilebilir sıralama düğmeleri sunuyor.');

        dom.window.setListSort('accounts', 'balance');
        const firstSortedRow = dom.window.document.querySelector('#accounts-tbody tr');
        assert(firstSortedRow?.classList.contains('is-payable') && firstSortedRow.textContent.includes('₺703,00'), 'Cari bakiyesi tablo başlığından artan sıraya alınabiliyor.');

        dom.window.setListPageSize('accounts', 50);
        assert(dom.window.document.querySelectorAll('#accounts-tbody tr').length === 50, 'Kullanıcı cari sayfasını 50 kayıt görünümüne alabiliyor.');
        assert(JSON.parse(storage.ak_lazer_list_preferences).accounts === 50, 'Liste kapasitesi tercihi sonraki açılış için saklanıyor.');

        const cariSearch = dom.window.document.getElementById('cari-search');
        cariSearch.value = 'Müşteri 0200';
        dom.window.handleHighVolumeSearch('accounts');
        assert(dom.window.document.querySelectorAll('#accounts-tbody tr').length === 1, '200+ cari içinde arama tek eşleşmeyi hızlıca daraltıyor.');
        assert(dom.window.document.getElementById('accounts-page-info').textContent.includes('1–1 / 1 kayıt'), 'Arama sonrası kayıt aralığı güncelleniyor.');

        db.stoklar = Array.from({ length: 137 }, (_, index) => ({
            id: 1000 + index,
            kodu: `STK-${String(index + 1).padStart(4, '0')}`,
            cinsi: `Test Sac ${index + 1}`,
            mm: 2,
            ebat: '1500x3000',
            miktar: 10,
            kg: 100,
            sahibi: 'Biz',
            sahibiTipi: 'biz',
            maliyet: 1000,
            tarih: '14.08.2026'
        }));
        dom.window.renderStoklar();
        assert(dom.window.document.querySelectorAll('#inventory-tbody tr').length === 25, 'Stok listesi de yüksek hacimde sayfalanıyor.');
        assert(dom.window.document.getElementById('inventory-page-info').textContent.includes('/ 137 kayıt'), 'Stok toplam kayıt sayısı görünür durumda.');

        db.isEmirleri = Array.from({ length: 130 }, (_, index) => ({
            id: 2000 + index,
            orderNo: `EMR-${String(index + 1).padStart(4, '0')}`,
            customerName: `Firma ${String(index + 1).padStart(4, '0')}`,
            description: `Seri üretim işi ${index + 1}`,
            total: 2500,
            durum: 'Beklemede',
            tarih: '14.08.2026'
        }));
        const orderSearch = dom.window.document.getElementById('orders-search');
        assert(!!orderSearch, 'İş emirleri sayfasına yüksek hacimli hızlı arama eklendi.');
        orderSearch.value = 'Firma 0129';
        dom.window.handleHighVolumeSearch('orders');
        assert(dom.window.document.querySelectorAll('#orders-tbody tr').length === 1, '130 iş emri müşteri adıyla daraltılabiliyor.');

        db.denetimKayitlari = Array.from({ length: 230 }, (_, index) => ({
            id: 5000 + index,
            action: index % 2 === 0 ? 'Güncellendi' : 'Oluşturuldu',
            entityType: index % 3 === 0 ? 'Cari' : 'Stok',
            detail: `Seri denetim kaydı ${String(index + 1).padStart(4, '0')}`,
            actor: 'Yerel Kullanıcı',
            tarih: '18.08.2026 12:00:00'
        }));
        dom.window.renderAuditTrail();
        assert(dom.window.document.querySelectorAll('#audit-tbody tr').length === 25, '230 denetim kaydı varsayılan olarak 25 kayıtlık sayfaya bölünüyor.');
        assert(dom.window.document.getElementById('audit-page-info').textContent.includes('1–25 / 230 kayıt'), 'Denetim geçmişi toplamı ve gösterilen aralığı açıklıyor.');
        assert(dom.window.document.getElementById('audit-page-info').textContent.includes('Sayfa 1/10'), '230 denetim kaydı için doğru toplam sayfa hesaplanıyor.');

        const auditSearch = dom.window.document.getElementById('audit-search');
        auditSearch.value = 'Seri denetim kaydı 0229';
        dom.window.handleHighVolumeSearch('audit');
        assert(dom.window.document.querySelectorAll('#audit-tbody tr').length === 1, '200+ denetim kaydı açıklamaya göre hızla daraltılabiliyor.');

        const css = fs.readFileSync('./style.css', 'utf8');
        assert(css.includes('max-height: clamp(360px, 56vh, 700px)'), 'Uzun tablolar sabit başlıklı kontrollü kaydırma alanına sahip.');
        assert(dom.window.document.querySelectorAll('.list-page-size-select').length >= 11, 'Sayfa kapasitesi seçimi yoğun listelerde ortak kullanılıyor.');
    } catch (error) {
        failures++;
        console.error('FAIL: Yüksek hacim senaryosu çalışırken hata oluştu:', error);
    }

    console.log(`High-volume UI audit: ${checks} checks, ${failures} failures.`);
    process.exit(failures ? 1 : 0);
}, 120);
