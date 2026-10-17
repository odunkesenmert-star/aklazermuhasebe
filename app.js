window.onerror = function(msg, url, line, col, error) {
   const errDiv = document.createElement('div');
   errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999;padding:20px;font-size:16px;box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
   errDiv.innerHTML = `<strong>Kritik Hata:</strong> ${String(msg).replace(/[<>&"']/g, '')} <br><small>Satır: ${line}</small><br><button onclick="this.parentElement.remove()" style="margin-top:10px;padding:5px 10px;color:black;">Kapat</button>`;
   document.body.appendChild(errDiv);
};

// --- Database & Local Storage Logic ---
const DB_KEY = 'AkLazerDB';
const CURRENT_SCHEMA_VERSION = 9;
let sheetCutSaving = false;
let quickSaleSaving = false;
const APP_LOGO_PATH = 'assets/ak-lazer-logo-wide.png';
const APP_ICON_PATH = 'assets/ak-lazer-icon-ui.png';
const SYSTEM_ALERT = window.alert.bind(window);
const SYSTEM_CONFIRM = window.confirm.bind(window);
const IS_AUTOMATED_UI_TEST = /jsdom/i.test(window.navigator?.userAgent || '');

let activeConfirmation = null;
const confirmationQueue = [];

function inferNotificationType(message) {
    const text = plainText(message).toLocaleLowerCase('tr-TR');
    if (/başarı|kaydedildi|oluşturuldu|tamamlandı|geri yüklendi|kesildi/.test(text)) return 'success';
    if (/dikkat|uyarı|emin misiniz|geri alınamaz/.test(text)) return 'warning';
    if (/hata|geçersiz|geçerli bir|başarısız|bulunamadı|zorunlu|seçin|girin|olamaz|izin verilmez|yetersiz|aşamaz|iptal edildi/.test(text)) return 'error';
    return 'info';
}

function dismissToast(element) {
    if (!element || !element.isConnected) return;
    element.classList.add('is-leaving');
    setTimeout(() => element.remove(), 190);
}

function showToast(input, options = {}) {
    const config = typeof input === 'object' && input !== null
        ? { ...input }
        : { message: String(input ?? ''), ...options };
    const message = String(config.message ?? '');
    const type = config.type || inferNotificationType(message);
    const region = document.getElementById('toast-region');
    if (!region) {
        if (IS_AUTOMATED_UI_TEST) SYSTEM_ALERT(message);
        return null;
    }

    while (region.children.length >= 4) region.firstElementChild?.remove();

    const toast = document.createElement('section');
    toast.className = `app-toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const header = document.createElement('div');
    header.className = 'toast-header';
    const title = document.createElement('div');
    title.className = 'toast-title';
    title.textContent = config.title || (type === 'success' ? 'İşlem tamamlandı' : type === 'error' ? 'İşlem tamamlanamadı' : type === 'warning' ? 'Dikkat' : 'Bilgi');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Bildirimi kapat');
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    close.addEventListener('click', () => dismissToast(toast));
    header.append(title, close);
    toast.appendChild(header);

    if (message) {
        const body = document.createElement('div');
        body.className = 'toast-message';
        body.textContent = message;
        toast.appendChild(body);
    }

    if (Array.isArray(config.impacts) && config.impacts.length) {
        const impactGrid = document.createElement('div');
        impactGrid.className = 'toast-impact-grid';
        config.impacts.forEach(impact => {
            const chip = document.createElement('div');
            chip.className = 'toast-impact-chip';
            const label = document.createElement('span');
            label.textContent = impact.label;
            const value = document.createElement('strong');
            value.textContent = impact.display;
            chip.append(label, value);
            impactGrid.appendChild(chip);
        });
        toast.appendChild(impactGrid);
    }

    if (Array.isArray(config.actions) && config.actions.length) {
        const actions = document.createElement('div');
        actions.className = 'toast-actions';
        config.actions.forEach(action => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'toast-action';
            button.textContent = action.label;
            button.addEventListener('click', () => {
                dismissToast(toast);
                action.onClick?.();
            });
            actions.appendChild(button);
        });
        toast.appendChild(actions);
    }

    region.appendChild(toast);
    const duration = Number(config.duration) || (type === 'error' ? 7000 : 5000);
    if (duration > 0) setTimeout(() => dismissToast(toast), duration);
    return toast;
}

function formatImpactValue(value, unit = 'currency') {
    const numeric = roundMoney(Number(value) || 0);
    if (numeric === 0) return unit === 'currency' ? 'Etkisiz' : `0 ${unit}`;
    const sign = numeric > 0 ? '+' : '-';
    return unit === 'currency'
        ? `${sign}${formatCurrency(Math.abs(numeric))}`
        : `${sign}${Math.abs(numeric).toLocaleString('tr-TR')} ${unit}`;
}

function showImpactSummary(title, impacts, options = {}) {
    const normalizedImpacts = (impacts || [])
        .filter(impact => impact && impact.label)
        .map(impact => ({
            ...impact,
            display: impact.display || formatImpactValue(impact.value, impact.unit || 'currency')
        }));
    return showToast({
        type: 'impact',
        title,
        message: options.message || 'Bağlı kayıtlar otomatik olarak güncellendi.',
        impacts: normalizedImpacts,
        actions: options.actions || [],
        duration: options.duration || 8000
    });
}

function runNextConfirmation() {
    if (activeConfirmation || !confirmationQueue.length) return;
    const request = confirmationQueue.shift();
    const modal = document.getElementById('modal-confirm');
    if (!modal) {
        if (SYSTEM_CONFIRM(request.message)) request.onConfirm?.();
        else request.onCancel?.();
        runNextConfirmation();
        return;
    }

    activeConfirmation = request;
    document.getElementById('confirm-title').textContent = request.title || 'İşlemi Onaylayın';
    document.getElementById('confirm-message').textContent = request.message;
    const acceptButton = document.getElementById('confirm-accept');
    const cancelButton = document.getElementById('confirm-cancel');
    acceptButton.textContent = request.confirmLabel || 'Onayla';
    cancelButton.textContent = request.cancelLabel || 'Vazgeç';
    acceptButton.className = request.danger === false ? 'btn btn-primary' : 'btn btn-danger';
    request.returnFocus = document.activeElement;
    modal.classList.add('active');
    setTimeout(() => cancelButton.focus(), 0);
}

function confirmAction(message, onConfirm, options = {}) {
    if (IS_AUTOMATED_UI_TEST) {
        if (SYSTEM_CONFIRM(String(message))) onConfirm?.();
        else options.onCancel?.();
        return;
    }
    confirmationQueue.push({ message: String(message), onConfirm, ...options });
    runNextConfirmation();
}

window.resolveConfirmation = function(accepted) {
    if (!activeConfirmation) return;
    const request = activeConfirmation;
    activeConfirmation = null;
    document.getElementById('modal-confirm')?.classList.remove('active');
    if (request.returnFocus && typeof request.returnFocus.focus === 'function') request.returnFocus.focus();
    if (accepted) request.onConfirm?.();
    else request.onCancel?.();
    setTimeout(runNextConfirmation, 0);
};

function askConfirmation(message, options = {}) {
    return new Promise(resolve => confirmAction(message, () => resolve(true), { ...options, onCancel: () => resolve(false) }));
}

window.showToast = showToast;
window.showImpactSummary = showImpactSummary;
window.confirmAction = confirmAction;

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeConfirmation) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resolveConfirmation(false);
    }
});

if (!IS_AUTOMATED_UI_TEST) {
    window.alert = message => showToast(String(message ?? ''));
}

const defaultNumberingSettings = {
    sacKesim: { prefix: 'KES', next: 1, pad: 4, useYear: true },
    hizliSatis: { prefix: 'SAT', next: 1, pad: 4, useYear: true },
    hareket: { prefix: 'HRK', next: 1, pad: 4, useYear: true },
    cari: { prefix: 'CAR', next: 1, pad: 4, useYear: false },
    stok: { prefix: 'STK', next: 1, pad: 2, useYear: false },
    teklif: { prefix: 'TEK', next: 1, pad: 4, useYear: true },
    isEmri: { prefix: 'EMR', next: 1, pad: 4, useYear: true },
    fatura: { prefix: 'FTR', next: 1, pad: 4, useYear: true },
    cekSenet: { prefix: 'CS', next: 1, pad: 4, useYear: true },
    odemePlani: { prefix: 'VP', next: 1, pad: 4, useYear: true },
    kasa: { prefix: 'KASA', next: 2, pad: 3, useYear: false }
};

const defaultDB = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    codeMigration: {version:9, mappings:[]},
    sacKesimleri: [],
    hizliSatislar: [],
    cariler: [],
    stoklar: [],
    islemler: [],
    teklifler: [],
    giderler: [],
    faturalar: [],
    isEmirleri: [],
    fireler: [],
    personeller: [],
    personelPuantajlari: [],
    cekSenetler: [],
    odemePlanlari: [],
    kasaHesaplari: [
        { id: 1, kodu: 'KASA-001', ad: 'Nakit Kasa', tip: 'nakit', bakiye: 0, tarih: '01.01.2026' },
        { id: 2, kodu: 'BANKA-001', ad: 'Banka Hesabı', tip: 'banka', bakiye: 0, tarih: '01.01.2026' }
    ],
    kasaHareketleri: [],
    stokHareketleri: [],
    denetimKayitlari: [],
    ayarlar: {
        firmaAdi: 'AK LAZER Fiber Lazer Kesimleri',
        telefon: '',
        adres: '',
        numaralandirma: defaultNumberingSettings,
        karlilik: { makineDakikaMaliyeti: 0, iscilikSaatMaliyeti: 0 }
    }
};

const DB_ARRAY_KEYS = ['sacKesimleri', 'hizliSatislar', 'cariler', 'stoklar', 'islemler', 'teklifler', 'giderler', 'faturalar', 'isEmirleri', 'fireler', 'personeller', 'personelPuantajlari', 'cekSenetler', 'odemePlanlari', 'kasaHesaplari', 'kasaHareketleri', 'stokHareketleri', 'denetimKayitlari'];

function createEmptyDatabase() {
    const fresh = JSON.parse(JSON.stringify(defaultDB));
    DB_ARRAY_KEYS.forEach(key => { fresh[key] = []; });
    fresh.kasaHesaplari = JSON.parse(JSON.stringify(defaultDB.kasaHesaplari));
    fresh.schemaVersion = CURRENT_SCHEMA_VERSION;
    return fresh;
}

const DB_NUMERIC_FIELDS = {
    hizliSatislar: ['tutar', 'kdvOrani', 'kdvTutari', 'matrah', 'stokMiktar'],
    cariler: ['bakiye', 'ledgerOpeningBalance'],
    stoklar: ['miktar', 'kg', 'en', 'boy', 'maliyet', 'kritikSeviye'],
    islemler: ['tutar', 'bakiyeDegisimi'],
    teklifler: ['minutes', 'rate', 'kgAmount', 'kgPrice', 'stokQty', 'operationCost', 'materialCost', 'subTotalBeforeDiscount', 'discountPercent', 'discountAmount', 'subTotal', 'taxRate', 'tax', 'total'],
    giderler: ['tutar', 'matrah', 'kdvOrani', 'kdvTutari'],
    faturalar: ['matrah', 'kdvOrani', 'kdvTutari', 'tutar', 'cariBakiyeDegisimi'],
    isEmirleri: [
        'minutes', 'rate', 'kgAmount', 'kgPrice', 'stokQty', 'operationCost', 'materialCost',
        'subTotalBeforeDiscount', 'discountPercent', 'discountAmount', 'subTotal', 'taxRate', 'tax', 'total',
        'profitNetRevenue', 'costMaterial', 'costMachineMinutes', 'costMachineRate', 'costMachine',
        'costLaborHours', 'costLaborRate', 'costLabor', 'costExternal', 'costShipping', 'costOther',
        'costScrapRecovery', 'costTotal', 'grossProfit', 'profitMargin'
    ],
    fireler: ['miktar', 'kg', 'mm', 'en', 'boy'],
    personeller: ['maas', 'varsayilanCalismaGunu'],
    personelPuantajlari: ['geldiGun', 'izinGun', 'eksikGun', 'mesaiSaat', 'mesaiSaatUcreti', 'avans', 'prim', 'brutMaas', 'kesinti', 'ekOdeme', 'netMaas'],
    cekSenetler: ['tutar', 'cariBakiyeDegisimi'],
    odemePlanlari: ['tutar'],
    kasaHesaplari: ['bakiye', 'ledgerOpeningBalance'],
    kasaHareketleri: ['tutar']
};

function normalizeDBRecord(key, item) {
    const record = { ...item };
    (DB_NUMERIC_FIELDS[key] || []).forEach(field => {
        if (record[field] === undefined || record[field] === null || plainText(record[field]) === '') return;
        const parsed = Number(record[field]);
        if (!Number.isFinite(parsed)) {
            throw new Error(`${key} kaydında "${field}" alanı geçerli bir sayı değil.`);
        }
        record[field] = roundMoney(parsed);
    });

    if (record.id !== undefined && record.id !== null && record.id !== '') {
        const numericId = Number(record.id);
        if (Number.isSafeInteger(numericId) && numericId > 0) {
            record.id = numericId;
        } else {
            throw new Error(`${key} kaydında geçersiz kimlik bulundu.`);
        }
    }
    if (key === 'stoklar') {
        ['miktar', 'kg', 'maliyet', 'kritikSeviye'].forEach(field => {
            record[field] = Math.max(0, roundMoney(record[field]));
        });
    }
    return record;
}

function mergeNumberingSettings(rawSettings = {}) {
    const merged = JSON.parse(JSON.stringify(defaultNumberingSettings));
    Object.keys(merged).forEach(key => {
        if (rawSettings[key] && typeof rawSettings[key] === 'object' && !Array.isArray(rawSettings[key])) {
            merged[key] = { ...merged[key], ...rawSettings[key] };
        }
        merged[key].prefix = plainText(merged[key].prefix || defaultNumberingSettings[key].prefix).toUpperCase();
        merged[key].next = Math.max(1, parseInt(merged[key].next, 10) || defaultNumberingSettings[key].next);
        merged[key].pad = Math.max(1, parseInt(merged[key].pad, 10) || defaultNumberingSettings[key].pad);
        merged[key].useYear = !!merged[key].useYear;
        merged[key].series = Object.fromEntries(Object.entries(merged[key].series || {}).filter(([bucket, next]) => typeof bucket === 'string' && Number.isSafeInteger(next) && next > 0));
    });
    return merged;
}

const NUMBERING_RECORD_SOURCES = Object.freeze({
    hareket: Object.freeze({ collection: 'islemler', field: 'movementNo' }),
    cari: Object.freeze({ collection: 'cariler', field: 'kodu' }),
    sacKesim: Object.freeze({ collection: 'sacKesimleri', field: 'kesimNo' }),
    hizliSatis: Object.freeze({ collection: 'hizliSatislar', field: 'satisNo' }),
    stok: Object.freeze({ collection: 'stoklar', field: 'kodu' }),
    teklif: Object.freeze({ collection: 'teklifler', field: 'teklifNo' }),
    isEmri: Object.freeze({ collection: 'isEmirleri', field: 'orderNo' }),
    fatura: Object.freeze({ collection: 'faturalar', field: 'faturaNo' }),
    cekSenet: Object.freeze({ collection: 'cekSenetler', field: 'belgeNo' }),
    odemePlani: Object.freeze({ collection: 'odemePlanlari', field: 'planNo' }),
    kasa: Object.freeze({ collection: 'kasaHesaplari', field: 'kodu' })
});

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSerialSequence(value, config) {
    const serial = plainText(value).toUpperCase();
    if (!serial) return null;
    const prefix = escapeRegExp(plainText(config.prefix).toUpperCase());
    const yearPart = config.useYear ? `-${new Date().getFullYear()}` : '';
    const match = serial.match(new RegExp(`^${prefix}${yearPart}-(\\d+)$`));
    if (!match) return null;
    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

function reconcileNumberingSettings(database, settings) {
    const reconciled = mergeNumberingSettings(settings);
    for (const [type, config] of Object.entries(reconciled)) {
        if (type === 'stok') {
            const pattern = new RegExp('^(' + escapeRegExp(config.prefix) + '-[0-9.]+MM)-(\\d+)$');
            for (const stock of database.stoklar || []) for (const code of [stock.kodu, ...getCodeAliases(stock)]) {
                const match = String(code || '').match(pattern);
                if (match) config.series[match[1]] = Math.max(config.series[match[1]] || 1, Number(match[2]) + 1);
            }
            continue;
        }
        const bucket = numberingBucket(config), next = nextDisplaySequence(database, type, config, bucket);
        config.series[bucket] = next; config.next = next; config.activeSeries = bucket;
    }
    return reconciled;
}

function assertUniqueRecordIds(database) {
    DB_ARRAY_KEYS.forEach(key => {
        const seen = new Set();
        database[key].forEach(record => {
            if (record.id === undefined || record.id === null || record.id === '') return;
            if (seen.has(record.id)) {
                throw new Error(`${key} kayıtlarında yinelenen kimlik bulundu: ${record.id}`);
            }
            seen.add(record.id);
        });
    });
}

function migrateDatabase(rawData) {
    const migrated = JSON.parse(JSON.stringify(rawData));
    const version = Math.max(1, parseInt(migrated.schemaVersion, 10) || 1);

    if (version < 2) {
        if (!Array.isArray(migrated.denetimKayitlari)) migrated.denetimKayitlari = [];
    }

    if (version < 3) {
        if (!migrated.ayarlar || typeof migrated.ayarlar !== 'object') migrated.ayarlar = {};
        if (!migrated.ayarlar.karlilik || typeof migrated.ayarlar.karlilik !== 'object') {
            migrated.ayarlar.karlilik = { makineDakikaMaliyeti: 0, iscilikSaatMaliyeti: 0 };
        }
        if (Array.isArray(migrated.isEmirleri)) {
            migrated.isEmirleri.forEach(order => {
                if (order && !order.costStatus) order.costStatus = 'Eksik';
            });
        }
    }

    if (version < 4) {
        if (Array.isArray(migrated.stoklar)) {
            migrated.stoklar.forEach(stok => {
                const match = String(stok?.ebat || '').match(/^\s*([\d.,]+)\s*[xX×]\s*([\d.,]+)\s*$/);
                if (stok && stok.en === undefined) stok.en = match ? Number(match[1].replace(',', '.')) || 0 : 0;
                if (stok && stok.boy === undefined) stok.boy = match ? Number(match[2].replace(',', '.')) || 0 : 0;
            });
        }
        if (Array.isArray(migrated.cekSenetler)) {
            migrated.cekSenetler.forEach(record => {
                if (record && !Array.isArray(record.durumGecmisi)) {
                    record.durumGecmisi = [{
                        durum: record.durum || 'beklemede',
                        tarih: record.tarih || new Date().toLocaleString('tr-TR'),
                        aciklama: 'Eski kayıttan aktarılan durum'
                    }];
                }
            });
        }
    }

    if (version < 7) migrateStockKgCosts(migrated);
    if (version < 8) migrateStockIdentity(migrated);
    if (version < 9) migrateReadableCodes(migrated);
    migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
    return migrated;
}

function validateAndNormalizeDB(rawData, requireRecords = false) {
    const source = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error('Yedek dosyası geçerli bir veri objesi değil.');
    }
    const parsed = migrateDatabase(source);

    const normalized = JSON.parse(JSON.stringify(defaultDB));
    DB_ARRAY_KEYS.forEach(key => {
        normalized[key] = Array.isArray(parsed[key])
            ? parsed[key]
                .filter(item => item && typeof item === 'object' && !Array.isArray(item))
                .map(item => normalizeDBRecord(key, item))
            : [];
    });
    for (const cut of normalized.sacKesimleri) {
        if (!Array.isArray(cut.pieces) || !Array.isArray(cut.movements) || !['active','cancelled'].includes(cut.status)) throw new Error('Sac kesimi kaydının parça veya durum bilgisi eksik.');
    }
    if (!normalized.kasaHesaplari.length) {
        normalized.kasaHesaplari = JSON.parse(JSON.stringify(defaultDB.kasaHesaplari));
    }

    normalized.codeMigration = {version:9, mappings:(Array.isArray(parsed.codeMigration?.mappings) ? parsed.codeMigration.mappings : []).filter(m => m && ['stok','cari'].includes(m.type)).map(m => ({type:m.type,id:m.id,from:plainText(m.from),to:plainText(m.to)}))};
    normalized.ayarlar = parsed.ayarlar && typeof parsed.ayarlar === 'object' && !Array.isArray(parsed.ayarlar)
        ? { ...defaultDB.ayarlar, ...parsed.ayarlar }
        : { ...defaultDB.ayarlar };
    normalized.ayarlar.numaralandirma = reconcileNumberingSettings(
        normalized,
        parsed.ayarlar?.numaralandirma
    );
    normalized.ayarlar.karlilik = {
        ...defaultDB.ayarlar.karlilik,
        ...(parsed.ayarlar?.karlilik && typeof parsed.ayarlar.karlilik === 'object' ? parsed.ayarlar.karlilik : {})
    };
    ['makineDakikaMaliyeti', 'iscilikSaatMaliyeti'].forEach(field => {
        normalized.ayarlar.karlilik[field] = Math.max(0, roundMoney(normalized.ayarlar.karlilik[field]));
    });
    initializeInvoiceDocuments(normalized);
    syncInvoicePaymentStates(normalized);
    normalized.schemaVersion = CURRENT_SCHEMA_VERSION;
    assertUniqueRecordIds(normalized);
    normalized.cariler.forEach(updateCariStatus);

    const hasRecognizedBackupShape = parsed.schemaVersion !== undefined ||
        DB_ARRAY_KEYS.some(key => Array.isArray(parsed[key])) ||
        (parsed.ayarlar && typeof parsed.ayarlar === 'object' && !Array.isArray(parsed.ayarlar));
    if (requireRecords && !hasRecognizedBackupShape) {
        throw new Error('Yedek dosyasında tanınan AK LAZER veri yapısı bulunamadı.');
    }

    return normalized;
}

let storedDBAtStartup = null;
try {
    storedDBAtStartup = localStorage.getItem(DB_KEY);
} catch (error) {
    console.warn('Yerel veri önbelleği okunamadı:', error);
}
let db;
let startupHasValidLocalDB = false;
let startupPersistenceBlocked = false;
let startupHydrationPending = !!window.electronAPI?.loadDBFromFile;
try {
    if (!storedDBAtStartup) throw new Error('Yerel veri bulunamadı.');
    db = validateAndNormalizeDB(storedDBAtStartup);
    startupHasValidLocalDB = true;
} catch (e) {
    db = JSON.parse(JSON.stringify(defaultDB));
}

let persistenceErrorShown = false;

function reportPersistenceError(message) {
    console.error('Kalıcı kayıt hatası:', message);
    addLog(`Kalıcı kayıt hatası: ${message}`);
    if (persistenceErrorShown) return;
    persistenceErrorShown = true;
    setTimeout(() => alert(`DİKKAT: Veriler kalıcı dosyaya yazılamadı.\n\n${message}\n\nUygulamayı kapatmadan önce manuel yedek alın.`), 0);
}

async function triggerAutoBackup(data = '', options = {}) {
    if (!data || !window.electronAPI?.sendBackup) return { success: true, skipped: true };
    try {
        const result = await window.electronAPI.sendBackup(data, options);
        if (!result?.skipped) applyBackupStatus(result?.backupStatus || (result?.success
            ? { success: true, lastSuccessAt: new Date().toISOString(), kind: options.safety === true ? 'safety' : 'auto', available: true }
            : { ...backupStatusView, success: false, error: result?.error || 'Yedekleme tamamlanamadı.' }));
        return result;
    } catch (error) {
        applyBackupStatus({ ...backupStatusView, success: false, error: error?.message || 'Yedekleme tamamlanamadı.' });
        throw error;
    }
}

function saveDB(skipRender = false) {
    let data = '';
    let persistencePromise = Promise.resolve({ success: true, localOnly: true });
    try {
        if (startupHydrationPending) {
            return Promise.resolve({ success: false, error: 'Kayıtlar henüz yükleniyor. Yükleme tamamlandığında tekrar deneyin.' });
        }
        if (startupPersistenceBlocked) {
            throw new Error('Diskteki veri okunamadığı için otomatik kayıt güvenlik amacıyla durduruldu. Yedek geri yükleyin veya uygulamayı yeniden başlatın.');
        }
        initializeInvoiceDocuments(db);
        syncInvoicePaymentStates(db);
        const normalized = validateAndNormalizeDB(db);
        db.ayarlar.numaralandirma = normalized.ayarlar.numaralandirma;
        data = JSON.stringify(normalized);
        let cacheWarning = '';
        try {
            localStorage.setItem(DB_KEY, data);
        } catch (error) {
            cacheWarning = error?.message || String(error);
        }
        const hasDiskPersistence = !!window.electronAPI?.saveDBToFile;
        if (cacheWarning && !hasDiskPersistence) {
            throw new Error(`Yerel kayıt güncellenemedi: ${cacheWarning}`);
        }
        const tasks = [triggerAutoBackup(data)];
        if (hasDiskPersistence) tasks.push(window.electronAPI.saveDBToFile(data));
        persistencePromise = Promise.all(tasks).then(results => {
            const failure = results.find(result => result && result.success === false && !result.skipped);
            if (failure) throw new Error(failure.error || 'Dosya yazma işlemi başarısız.');
            persistenceErrorShown = false;
            if (cacheWarning) {
                console.warn('Yerel veri önbelleği güncellenemedi; kalıcı disk kaydı kullanılıyor:', cacheWarning);
                return { success: true, cacheWarning: true };
            }
            return { success: true };
        }).catch(error => {
            reportPersistenceError(error?.message || String(error));
            return { success: false, error: error?.message || String(error) };
        });
    } catch(e) {
        reportPersistenceError(e?.message || String(e));
        persistencePromise = Promise.resolve({ success: false, error: e?.message || String(e) });
    }
    // Only render what is visible or common
    if (!skipRender && typeof renderAll === 'function') {
        renderAll();
    }
    return persistencePromise;
}

async function replaceDatabaseSafely(candidate) {
    let normalized;
    let data;
    try {
        normalized = validateAndNormalizeDB(candidate);
        data = JSON.stringify(normalized);
    } catch (error) {
        return { success: false, error: error?.message || String(error) };
    }

    if (window.electronAPI?.saveDBToFile) {
        try {
            const fileResult = await window.electronAPI.saveDBToFile(data);
            if (fileResult?.success === false) {
                return { success: false, error: fileResult.error || 'Kalıcı veri dosyası yazılamadı.' };
            }
        } catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    }

    let cacheWarning = '';
    try {
        localStorage.setItem(DB_KEY, data);
    } catch (error) {
        cacheWarning = error?.message || String(error);
        if (!window.electronAPI?.saveDBToFile) {
            return { success: false, error: `Yerel kayıt güncellenemedi: ${cacheWarning}` };
        }
    }

    db = normalized;
    startupHasValidLocalDB = true;
    startupPersistenceBlocked = false;
    persistenceErrorShown = false;

    try {
        const backupResult = await triggerAutoBackup(data);
        if (backupResult?.success === false) {
            reportPersistenceError(`Yeni veri kaydedildi ancak otomatik yedek alınamadı: ${backupResult.error || 'Bilinmeyen hata'}`);
            return { success: true, backupWarning: true, cacheWarning: !!cacheWarning };
        }
    } catch (error) {
        reportPersistenceError(`Yeni veri kaydedildi ancak otomatik yedek alınamadı: ${error?.message || String(error)}`);
        return { success: true, backupWarning: true, cacheWarning: !!cacheWarning };
    }

    return { success: true, cacheWarning: !!cacheWarning };
}

async function createSafetyBackup(data) {
    try {
        const result = await triggerAutoBackup(data, { safety: true });
        return result?.success === false
            ? { success: false, error: result.error || 'Bilinmeyen yedekleme hatası' }
            : { success: true };
    } catch (error) {
        return { success: false, error: error?.message || String(error) };
    }
}

// Global data guard
function getDBArray(key) {
    if (!db || !db[key]) return [];
    return Array.isArray(db[key]) ? db[key] : [];
}

function formatCurrency(num) {
    const value = Number(num);
    const safeValue = Number.isFinite(value) ? value : 0;
    return `₺${safeValue.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function roundMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
}

const QUOTE_OPERATION_TYPES = Object.freeze({
    lazer: Object.freeze({
        label: 'Lazer Kesim',
        shortLabel: 'Lazer',
        badgeClass: '',
        pricing: 'minute',
        summaryLabel: 'Kesim Bedeli:'
    }),
    cnc_plazma: Object.freeze({
        label: 'CNC Plazma',
        shortLabel: 'Plazma',
        badgeClass: 'warning',
        pricing: 'kg',
        summaryLabel: 'CNC Plazma Bedeli:',
        kgAmountLabel: 'Kesilecek Ağırlık (KG)',
        kgPriceLabel: 'KG Plazma Kesim Ücreti (₺)',
        helperText: 'CNC Plazma bedeli, kesilecek toplam ağırlık ile kilogram birim fiyatının çarpımıdır.'
    }),
    bukum: Object.freeze({
        label: 'Büküm',
        shortLabel: 'Büküm',
        badgeClass: 'primary',
        pricing: 'kg',
        summaryLabel: 'Büküm Bedeli:',
        kgAmountLabel: 'Bükülecek Ağırlık (KG)',
        kgPriceLabel: 'KG Büküm Ücreti (₺)',
        helperText: 'Büküm bedeli, toplam ağırlık ile kilogram birim fiyatının çarpımıdır.'
    }),
    hammadde: Object.freeze({
        label: 'Hammadde Satışı',
        shortLabel: 'H. Satış',
        badgeClass: 'success',
        pricing: 'kg',
        summaryLabel: 'Malzeme Bedeli:',
        kgAmountLabel: 'Satılacak Ağırlık (KG)',
        kgPriceLabel: 'KG Satış Fiyatı (₺)',
        helperText: 'Hammadde satış bedeli, satılan ağırlık ile kilogram satış fiyatının çarpımıdır.',
        descriptionHidden: true,
        operationSummaryHidden: true
    })
});

function getQuoteOperationMeta(type) {
    return QUOTE_OPERATION_TYPES[type] || QUOTE_OPERATION_TYPES.lazer;
}

function isKgPricedOperation(type) {
    return getQuoteOperationMeta(type).pricing === 'kg';
}

function calculateQuoteAmounts({
    islemTipi = 'lazer',
    minutes = 0,
    rate = 0,
    kgAmount = 0,
    kgPrice = 0,
    materialCostPerUnit = 0,
    stokQty = 0,
    discountPercent = 0,
    taxRate = 0
} = {}) {
    let rawOperationCost = 0;
    let rawMaterialCost = 0;

    if (islemTipi === 'lazer') {
        rawOperationCost = minutes * rate;
        rawMaterialCost = materialCostPerUnit * stokQty;
    } else if (isKgPricedOperation(islemTipi) && islemTipi !== 'hammadde') {
        rawOperationCost = kgAmount * kgPrice;
        rawMaterialCost = materialCostPerUnit * stokQty;
    } else if (islemTipi === 'hammadde') {
        rawMaterialCost = kgAmount * kgPrice;
    }

    const operationCost = roundMoney(rawOperationCost);
    const materialCost = roundMoney(rawMaterialCost);
    const subTotalBeforeDiscount = roundMoney(rawOperationCost + rawMaterialCost);
    const discountAmount = roundMoney(subTotalBeforeDiscount * (discountPercent / 100));
    const subTotal = roundMoney(subTotalBeforeDiscount - discountAmount);
    const tax = roundMoney(subTotal * (taxRate / 100));
    const total = roundMoney(subTotal + tax);

    return {
        operationCost,
        materialCost,
        subTotalBeforeDiscount,
        discountAmount,
        subTotal,
        tax,
        total
    };
}

function parsePercent(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

let lastRecordId = 0;

function createRecordId() {
    const timeBasedId = Date.now() * 1000;
    lastRecordId = Math.max(lastRecordId + 1, timeBasedId);
    return lastRecordId;
}

function getProfitabilitySettings() {
    const settings = db?.ayarlar?.karlilik || defaultDB.ayarlar.karlilik;
    return {
        makineDakikaMaliyeti: Math.max(0, roundMoney(settings.makineDakikaMaliyeti)),
        iscilikSaatMaliyeti: Math.max(0, roundMoney(settings.iscilikSaatMaliyeti))
    };
}

function getOrderNetRevenue(order) {
    const subTotal = Number(order?.subTotal);
    if (Number.isFinite(subTotal)) return Math.max(0, roundMoney(subTotal));
    return Math.max(0, roundMoney((Number(order?.total) || 0) - (Number(order?.tax) || 0)));
}

function calculateMaterialCostForOrder(order) {
    if (!order?.stokId || String(order.stokId) === '0') return 0;
    const stok = getDBArray('stoklar').find(item => String(item.id) === String(order.stokId));
    if (!stok || stok.sahibiTipi === 'musteri') return 0;

    const price = Math.max(0, Number(stok.maliyet) || 0);
    if(order.islemTipi === 'hammadde') return roundMoney(price * Math.max(0,Number(order.kgAmount)||0));
    const usedKg=Number(order.stokDusulenKg)>0 ? Number(order.stokDusulenKg) : getStockPlateWeight(stok)*Math.max(0,Number(order.stokQty)||0);
    return roundMoney(price*usedKg);
}

function getOrderCostInputs(order) {
    const settings = getProfitabilitySettings();
    const hasValue = key => order?.[key] !== undefined && order?.[key] !== null && order?.[key] !== '';
    return {
        costMaterial: hasValue('costMaterial') ? order.costMaterial : calculateMaterialCostForOrder(order),
        costMachineMinutes: hasValue('costMachineMinutes') ? order.costMachineMinutes : (order?.islemTipi === 'lazer' ? order.minutes : 0),
        costMachineRate: hasValue('costMachineRate') ? order.costMachineRate : settings.makineDakikaMaliyeti,
        costLaborHours: hasValue('costLaborHours') ? order.costLaborHours : 0,
        costLaborRate: hasValue('costLaborRate') ? order.costLaborRate : settings.iscilikSaatMaliyeti,
        costExternal: hasValue('costExternal') ? order.costExternal : 0,
        costShipping: hasValue('costShipping') ? order.costShipping : 0,
        costOther: hasValue('costOther') ? order.costOther : 0,
        costScrapRecovery: hasValue('costScrapRecovery') ? order.costScrapRecovery : 0
    };
}

function calculateOrderProfitability(order, overrides = {}) {
    const inputs = { ...getOrderCostInputs(order), ...overrides };
    Object.keys(inputs).forEach(key => {
        inputs[key] = Math.max(0, roundMoney(inputs[key]));
    });

    const profitNetRevenue = getOrderNetRevenue(order);
    const costMachine = roundMoney(inputs.costMachineMinutes * inputs.costMachineRate);
    const costLabor = roundMoney(inputs.costLaborHours * inputs.costLaborRate);
    const grossCost = roundMoney(
        inputs.costMaterial + costMachine + costLabor +
        inputs.costExternal + inputs.costShipping + inputs.costOther
    );
    const costTotal = Math.max(0, roundMoney(grossCost - inputs.costScrapRecovery));
    const grossProfit = roundMoney(profitNetRevenue - costTotal);
    const profitMargin = profitNetRevenue > 0
        ? roundMoney((grossProfit / profitNetRevenue) * 100)
        : 0;

    return {
        profitNetRevenue,
        ...inputs,
        costMachine,
        costLabor,
        costTotal,
        grossProfit,
        profitMargin
    };
}

function applyOrderProfitability(order, overrides = {}, status = '') {
    if (!order) return null;
    const result = calculateOrderProfitability(order, overrides);
    Object.assign(order, result);
    order.costStatus = status || order.costStatus || 'Tahmini';
    if (!order.costInitializedAt) order.costInitializedAt = new Date().toLocaleString('tr-TR');
    return result;
}

function getOrderProfitability(order) {
    return calculateOrderProfitability(order);
}

function getProfitabilityStatus(order) {
    return ['Kesin', 'Tahmini', 'Eksik'].includes(order?.costStatus) ? order.costStatus : 'Eksik';
}

function getProfitabilityStatusBadge(order) {
    const status = getProfitabilityStatus(order);
    const badgeClass = status === 'Kesin' ? 'success' : (status === 'Tahmini' ? 'warning' : 'error');
    return `<span class="badge ${badgeClass}">${escapeHTML(status)}</span>`;
}

function getNumberingConfig(type) {
    if (!db.ayarlar) db.ayarlar = { ...defaultDB.ayarlar };
    if (!db.ayarlar.numaralandirma) db.ayarlar.numaralandirma = mergeNumberingSettings();
    db.ayarlar.numaralandirma = mergeNumberingSettings(db.ayarlar.numaralandirma);
    return db.ayarlar.numaralandirma[type] || mergeNumberingSettings()[type];
}

function formatSerialNo(type, increment = false) {
    return formatDatabaseSerial(db, type, increment);
}
function previewSerialNo(type) { return formatSerialNo(type, false); }
function generateSerialNo(type) { return formatSerialNo(type, true); }

function updateCariStatus(cari) {
    if (!cari) return;
    if (cari.bakiye > 0) cari.durum = 'Müşteri Borçlu';
    else if (cari.bakiye < 0) cari.durum = 'Müşteri Alacaklı';
    else cari.durum = 'Temiz';
}

function normalizeLookupText(value) {
    return plainText(value).toLocaleLowerCase('tr-TR');
}

function findCariByReference(cariId, fallbackName = '', database = db) {
    const cariler = database?.cariler || [];
    if (cariId != null && String(cariId).trim() !== '' && cariId !== 'internal') {
        // An explicit ID must never silently fall back to another account's name.
        return cariler.find(c => String(c.id) === String(cariId)) || null;
    }

    const normalizedName = normalizeLookupText(fallbackName);
    if (!normalizedName) return null;
    const matches = cariler.filter(c => normalizeLookupText(c.adi) === normalizedName);
    return matches.length === 1 ? matches[0] : null;
}

function cariRecordMatches(record, cari) {
    if (!record || !cari) return false;
    const referenceId = record.cariId != null && String(record.cariId).trim() !== ''
        ? record.cariId : record.customerId;
    if (referenceId != null && String(referenceId).trim() !== '') {
        return String(referenceId) === String(cari.id);
    }
    const referenceName = record.firma || record.customerName || '';
    return findCariByReference(referenceId, referenceName)?.id === cari.id;
}

function createAuditLogRecord(action, entityType, entityId, detail = '') {
    return {
        id: createRecordId(),
        action: plainText(action || 'İşlem'),
        entityType: plainText(entityType || 'Genel'),
        entityId: entityId ?? null,
        detail: plainText(detail || ''),
        actor: 'Yerel Kullanıcı',
        tarih: new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
}

function addAuditLog(action, entityType, entityId, detail = '') {
    if (!Array.isArray(db.denetimKayitlari)) db.denetimKayitlari = [];
    const record = createAuditLogRecord(action, entityType, entityId, detail);
    db.denetimKayitlari.push(record);
    return record;
}

function getAuditActionPresentation(action) {
    const value = normalizeLookupText(action);
    if (value.includes('silindi')) return { className: 'is-delete', icon: 'fa-trash-can' };
    if (value.includes('geri alındı') || value.includes('ters')) return { className: 'is-reversal', icon: 'fa-rotate-left' };
    if (value.includes('oluşturuldu')) return { className: 'is-create', icon: 'fa-plus' };
    if (value.includes('güncellendi') || value.includes('değişti')) return { className: 'is-update', icon: 'fa-pen' };
    if (value.includes('onaylandı') || value.includes('kapatıldı') || value.includes('kesinleştirildi')) return { className: 'is-success', icon: 'fa-check' };
    return { className: 'is-neutral', icon: 'fa-circle' };
}

function syncAuditFilterOptions(records = []) {
    const configs = [
        ['audit-entity-filter', records.map(record => plainText(record.entityType || 'Genel'))],
        ['audit-action-filter', records.map(record => plainText(record.action || 'İşlem'))]
    ];
    configs.forEach(([id, values]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value || 'all';
        const unique = [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'tr'));
        select.innerHTML = `<option value="all">Tümü</option>${unique.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')}`;
        select.value = unique.includes(current) ? current : 'all';
    });
}

function getFilteredAuditRecordsForReport() {
    const search = normalizeLookupText(document.getElementById('audit-search')?.value || '');
    const entityFilter = document.getElementById('audit-entity-filter')?.value || 'all';
    const actionFilter = document.getElementById('audit-action-filter')?.value || 'all';
    let records = filterByReportDate('audit', getDBArray('denetimKayitlari'));
    if (search) {
        records = records.filter(record => [record.action, record.entityType, record.detail, record.actor, record.tarih]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    if (entityFilter !== 'all') records = records.filter(record => record.entityType === entityFilter);
    if (actionFilter !== 'all') records = records.filter(record => record.action === actionFilter);
    return records;
}

function getSortedAuditRecords() {
    const rows = getFilteredAuditRecordsForReport();
    const sorted = applyListSort('audit', rows, {
        date: record => parseTRDate(record.tarih || ''),
        action: record => record.action || '',
        entity: record => record.entityType || '',
        detail: record => record.detail || '',
        actor: record => record.actor || ''
    });
    return LIST_SORT_STATE.audit ? sorted : sorted.reverse();
}

window.renderAuditTrail = function() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    const allRecords = getDBArray('denetimKayitlari');
    syncAuditFilterOptions(allRecords);
    const rows = getSortedAuditRecords();
    const pageSize = getListPageSize('audit');
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    window.pageAudit = Math.min(Math.max(Number(window.pageAudit) || 1, 1), totalPages);
    const startIndex = (window.pageAudit - 1) * pageSize;
    const paginated = rows.slice(startIndex, startIndex + pageSize);
    const today = new Date().toLocaleDateString('tr-TR');

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    };
    setText('audit-stat-total', allRecords.length);
    setText('audit-stat-today', allRecords.filter(record => parseTRDate(record.tarih || '').toLocaleDateString('tr-TR') === today).length);
    setText('audit-stat-reversed', allRecords.filter(record => normalizeLookupText(record.action).includes('geri alındı')).length);
    setText('audit-stat-modules', new Set(allRecords.map(record => record.entityType).filter(Boolean)).size);
    setText('audit-page-info', formatListPagination(window.pageAudit, totalPages, rows.length, pageSize));

    const previousButton = document.getElementById('btn-audit-prev');
    const nextButton = document.getElementById('btn-audit-next');
    if (previousButton) previousButton.disabled = window.pageAudit <= 1;
    if (nextButton) nextButton.disabled = window.pageAudit >= totalPages;

    tbody.innerHTML = paginated.length ? paginated.map(record => {
        const presentation = getAuditActionPresentation(record.action);
        return `<tr>
            ${renderSelectionCell('audit', record.id)}
            <td class="audit-date-cell"><strong>${escapeHTML(record.tarih || '-')}</strong><small>#${escapeHTML(record.id)}</small></td>
            <td><span class="audit-action-badge ${presentation.className}"><i class="fa-solid ${presentation.icon}" aria-hidden="true"></i>${escapeHTML(record.action || 'İşlem')}</span></td>
            <td><span class="audit-entity-badge">${escapeHTML(record.entityType || 'Genel')}</span></td>
            <td class="audit-detail-cell">${escapeHTML(record.detail || 'Açıklama bulunmuyor')}</td>
            <td class="audit-actor-cell"><i class="fa-solid fa-desktop" aria-hidden="true"></i>${escapeHTML(record.actor || 'Yerel Kullanıcı')}</td>
        </tr>`;
    }).join('') : renderTableEmptyState(6, 'Denetim kaydı bulunamadı', 'Filtreleri temizleyin veya yeni bir işlem gerçekleştirin.', 'fa-clock-rotate-left');

    updateReportSelectionUI('audit');
    enhanceSortableTableHeaders('audit');
};

window.clearAuditFilters = function() {
    const search = document.getElementById('audit-search');
    const entity = document.getElementById('audit-entity-filter');
    const action = document.getElementById('audit-action-filter');
    if (search) search.value = '';
    if (entity) entity.value = 'all';
    if (action) action.value = 'all';
    clearReportDateRange('audit');
};

function addCariMovement(cari, movement) {
    if (!cari) return null;

    const delta = roundMoney(movement.bakiyeDegisimi);
    cari.bakiye = roundMoney((Number(cari.bakiye) || 0) + delta);
    updateCariStatus(cari);

    const transaction = {
        id: movement.id || createRecordId(),
        movementNo: generateSerialNo('hareket'),
        tarih: movement.tarih || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        cariId: cari.id,
        firma: cari.adi,
        tip: movement.tip,
        aciklama: movement.aciklama || '',
        sheetPurchase: movement.sheetPurchase || null,
        sheetPurchasePaymentFor: movement.sheetPurchasePaymentFor || null,
        quickSaleId: movement.quickSaleId || null,
        quickSaleNo: movement.quickSaleNo || '',
        faturaNo: movement.faturaNo || '',
        orderId: movement.orderId || null,
        orderNo: movement.orderNo || '',
        faturaId: movement.faturaId || null,
        paymentInvoiceId: movement.paymentInvoiceId || null,
        tutar: Math.abs(roundMoney(movement.tutar ?? delta)),
        bakiyeDegisimi: delta,
        isSuccess: !!movement.isSuccess,
        isGelir: !!movement.isGelir,
        ek: movement.ek || null,
        reversalOf: movement.reversalOf || null,
        reversedBy: movement.reversedBy || null,
        correctionOf: movement.correctionOf || null,
        correctedBy: movement.correctedBy || null,
        correctionReversal: !!movement.correctionReversal
    };

    db.islemler.push(transaction);
    return transaction;
}

function addStokMovement(stok, movement = {}) {
    if (!stok) return null;
    if (!Array.isArray(db.stokHareketleri)) db.stokHareketleri = [];
    const quantity = roundMoney(movement.miktar || 0);
    const record = {
        id: createRecordId(),
        stokId: stok.id,
        stokKodu: stok.kodu || '',
        stockPartNo: stok.partNo || null,
        stokAdi: stok.cinsi || '',
        tip: movement.tip || 'Hareket',
        alan: movement.alan || 'miktar',
        miktar: quantity,
        onceki: typeof movement.onceki === 'number' ? roundMoney(movement.onceki) : null,
        sonraki: typeof movement.sonraki === 'number' ? roundMoney(movement.sonraki) : null,
        aciklama: movement.aciklama || '',
        ref: movement.ref || '',
        tarih: movement.tarih || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
    db.stokHareketleri.push(record);
    return record;
}

function addCashMovement(kasaId, movement = {}) {
    if (!kasaId) return null;
    if (!Array.isArray(db.kasaHareketleri)) db.kasaHareketleri = [];
    const kasa = getDBArray('kasaHesaplari').find(k => k.id == kasaId);
    if (!kasa) return null;

    const tutar = roundMoney(movement.tutar);
    if (tutar <= 0) return null;
    const direction = movement.tip === 'cikis' ? 'cikis' : 'giris';
    const delta = direction === 'giris' ? tutar : -tutar;
    kasa.bakiye = roundMoney((Number(kasa.bakiye) || 0) + delta);

    const record = {
        id: createRecordId(),
        kasaId: kasa.id,
        kasaAdi: kasa.ad,
        tip: direction,
        tutar,
        aciklama: movement.aciklama || '',
        kaynak: movement.kaynak || '',
        refId: movement.refId || null,
        tarih: movement.tarih || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
    db.kasaHareketleri.push(record);
    return record;
}

function reverseCashMovement(movementId, reason = 'İşlem geri alındı') {
    const original = getDBArray('kasaHareketleri').find(item => String(item.id) === String(movementId));
    if (!original) return null;
    if (original.reversedBy) {
        return getDBArray('kasaHareketleri').find(item => String(item.id) === String(original.reversedBy)) || null;
    }

    const reversal = addCashMovement(original.kasaId, {
        tip: original.tip === 'giris' ? 'cikis' : 'giris',
        tutar: original.tutar,
        aciklama: `${reason} (${original.aciklama || original.kaynak || 'Kasa hareketi'})`,
        kaynak: `${original.kaynak || 'kasa'}-ters-kayit`,
        refId: original.id
    });
    if (reversal) original.reversedBy = reversal.id;
    return reversal;
}

function getCashAccountReferences(accountId) {
    const ignoredCollections = new Set(['kasaHesaplari', 'kasaHareketleri', 'denetimKayitlari']);
    return DB_ARRAY_KEYS
        .filter(key => !ignoredCollections.has(key))
        .flatMap(key => getDBArray(key)
            .filter(item => String(item?.kasaId || '') === String(accountId))
            .map(item => ({ collection: key, id: item.id })));
}

function getCashAccountUsage(accountId) {
    return {
        movements: getDBArray('kasaHareketleri').filter(item => String(item.kasaId) === String(accountId)),
        references: getCashAccountReferences(accountId)
    };
}

function isCashAccountActive(account) {
    return account?.isPasif !== true;
}

// Atomic saves replace db with a copy, so the archive result is applied to whatever live
// records still carry this unarchived source path, not only to the object captured here.
function getLiveAttachmentsForPath(sourcePath) {
    return DB_ARRAY_KEYS.flatMap(key => getDBArray(key))
        .map(record => record?.ek)
        .filter(item => item && typeof item === 'object' && item.path === sourcePath && !item.archivedPath);
}
function scheduleAttachmentArchive(ek, category, ownerName) {
    if (!ek || ek.archivedPath || !ek.path || !window.electronAPI?.archiveAttachment) return;
    const sourcePath = ek.path;
    const apply = changes => {
        const targets = new Set([ek, ...getLiveAttachmentsForPath(sourcePath)]);
        targets.forEach(item => Object.assign(item, changes));
        saveDB(true);
    };
    window.electronAPI.archiveAttachment({
        sourcePath,
        category: category || 'Belgeler',
        ownerName: ownerName || 'Genel',
        fileName: ek.name || 'belge'
    }).then(result => {
        if (result?.success && result.path) {
            apply({ archivedPath: result.path, archiveStatus: 'Arşivlendi' });
        } else {
            apply({ archiveStatus: 'Arşivlenemedi', archiveError: result?.error || 'Kaynak dosya bulunamadı.' });
            alert(`Belge eki arşivlenemedi: ${ek.name || 'Belge'}\n\n${ek.archiveError}`);
        }
    }).catch(error => {
        apply({ archiveStatus: 'Arşivlenemedi', archiveError: error?.message || String(error) });
        alert(`Belge eki arşivlenemedi: ${ek.name || 'Belge'}\n\n${ek.archiveError}`);
    });
}

function getInvoiceableOrdersForCari(cariId) {
    return getDBArray('isEmirleri')
        .filter(order =>
            order.customerId == cariId &&
            order.durum === 'Teslim Edildi' &&
            order.total > 0 &&
            order.faturaKesildi !== true
        )
        .sort((a, b) => parseTRDate(b.tarih) - parseTRDate(a.tarih));
}

function plainText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDocumentNo(value) {
    return plainText(value).toLocaleUpperCase('tr-TR');
}

function hasDuplicateInvoiceNo(value, options = {}) {
    const { excludeId = null, tur = '', cariId = null } = options;
    const normalized = normalizeDocumentNo(value);
    if (!normalized) return false;
    return getDBArray('faturalar').some(item => {
        const itemTur = item.tur || 'kesilen';
        if (excludeId !== null && String(item.id) === String(excludeId)) return false;
        if (tur && itemTur !== tur) return false;
        if (tur === 'alinan' && cariId !== null && item.cariId != cariId) return false;
        return normalizeDocumentNo(item.faturaNo) === normalized;
    });
}

function hasDuplicateCekSenetNo(value, excludeId = null) {
    const normalized = normalizeDocumentNo(value);
    if (!normalized) return false;
    return getDBArray('cekSenetler').some(item =>
        (excludeId === null || String(item.id) !== String(excludeId)) &&
        normalizeDocumentNo(item.belgeNo) === normalized
    );
}

function escapeHTML(value) {
    return plainText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTableEmptyState(colspan, title, description = 'Yeni kayıt eklendiğinde burada görünecek.', icon = 'fa-inbox') {
    const safeColspan = Math.max(1, Number(colspan) || 1);
    return `<tr><td colspan="${safeColspan}" class="table-empty-state"><div class="table-empty-content"><span class="table-empty-icon" aria-hidden="true"><i class="fa-solid ${escapeHTML(icon)}"></i></span><span class="table-empty-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(description)}</span></span></div></td></tr>`;
}

function escapeJSStringForAttr(value) {
    return JSON.stringify(String(value ?? ''))
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/'/g, '\\u0027')
        .replace(/"/g, '&quot;');
}

function avatarDataURI(name) {
    const initials = plainText(name || 'Firma').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'F';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#E63946"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700" fill="#fff">${escapeHTML(initials)}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function csvCell(value) {
    const text = plainText(value);
    const spreadsheetSafeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${spreadsheetSafeText.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getCompanyName() {
    return db.ayarlar?.firmaAdi || 'AK LAZER Fiber Lazer Kesimleri';
}

function getPrintMetaHTML(items = []) {
    return items
        .filter(item => Array.isArray(item) && item.length >= 2 && plainText(item[1]))
        .map(([label, value]) => `
            <div class="meta-row" aria-label="${escapeHTML(`${label}: ${value}`)}">
                <span class="meta-label">${escapeHTML(label)}</span>
                <strong class="meta-value">${escapeHTML(value)}</strong>
            </div>
        `).join('');
}

function getPrintBrandHTML(title, metaHTML = '', issuer = db.ayarlar) {
    const firmaAdi = issuer?.firmaAdi || getCompanyName();
    const contactItems = [issuer?.telefon, issuer?.adres].map(plainText).filter(Boolean);
    return `
        <header class="brand-header">
            <div class="brand-identity">
                <img class="brand-logo" src="${APP_LOGO_PATH}" alt="${escapeHTML(firmaAdi)}">
                <div class="company-name">${escapeHTML(firmaAdi)}</div>
                ${contactItems.length ? `<div class="company-contact">${contactItems.map(item => `<span>${escapeHTML(item)}</span>`).join('')}</div>` : ''}
            </div>
            <div class="brand-document">
                <h1>${escapeHTML(title)}</h1>
                <div class="meta">${metaHTML}</div>
            </div>
        </header>
    `;
}

function getPrintPartyHTML(label, name, cari = {}, extraHTML = '') {
    const details = [cari?.kodu, cari?.tel || cari?.telefon].map(plainText).filter(Boolean);
    const taxDetails = [cari?.vergiDairesi, cari?.vergiNo].map(plainText).filter(Boolean);
    return `<div class="document-intro-grid">
        <div class="document-card">
            <div class="document-card-label">${escapeHTML(label)}</div>
            <div class="document-card-value">${escapeHTML(name || '—')}</div>
            ${details.length ? `<div class="document-card-detail">${details.map(escapeHTML).join(' · ')}</div>` : ''}
            ${cari?.adres ? `<div class="document-card-detail">${escapeHTML(cari.adres)}</div>` : ''}
            ${taxDetails.length ? `<div class="document-card-detail">Vergi: ${taxDetails.map(escapeHTML).join(' / ')}</div>` : ''}
        </div>
        ${extraHTML ? `<div class="document-card document-reference">${extraHTML}</div>` : ''}
    </div>`;
}

function getPrintTotalsHTML(amounts, label = 'Tutar özeti') {
    const hasDiscount = roundMoney(amounts.discountAmount || 0) !== 0;
    const discountRate = amounts.discountPercent == null ? '' : ` (${formatPercentLabel(amounts.discountPercent)})`;
    const taxRate = amounts.taxRate == null ? '' : ` (${formatPercentLabel(amounts.taxRate)})`;
    return `<table class="totals-panel" aria-label="${escapeHTML(label)}"><tbody>
        ${hasDiscount ? `<tr><td>${escapeHTML(`İskonto${discountRate}`)}</td><td>−${escapeHTML(formatCurrency(amounts.discountAmount))}</td></tr>` : ''}
        <tr><td>Ara Toplam</td><td>${escapeHTML(formatCurrency(amounts.subTotal || 0))}</td></tr>
        <tr><td>${escapeHTML(`KDV${taxRate}`)}</td><td>${escapeHTML(formatCurrency(amounts.tax || 0))}</td></tr>
        <tr class="total-row"><td>Genel Toplam</td><td>${escapeHTML(formatCurrency(amounts.total || 0))}</td></tr>
    </tbody></table>`;
}

function getPrintServiceLineHTML(description, gross) {
    return `<table class="service-lines" aria-label="İşlem kalemleri">
        <thead><tr><th scope="col">No</th><th scope="col">Açıklama</th><th scope="col" class="text-right">Tutar <span class="column-unit">(KDV hariç)</span></th></tr></thead>
        <tbody><tr><td class="line-index">01</td><td>${escapeHTML(description)}</td><td class="number-cell">${escapeHTML(formatCurrency(gross || 0))}</td></tr></tbody>
    </table>`;
}

const PRINT_PAYMENT_DETAILS = Object.freeze({
    bank: 'ZİRAAT BANKASI',
    iban: 'TR04 0001 0090 1065 8664 4050 01',
    holder: 'MERT ODUNKESEN'
});

function getPrintPaymentFooterHTML() {
    return `<footer class="print-payment-footer" aria-label="Ödeme için banka bilgileri">
        <div>${escapeHTML(PRINT_PAYMENT_DETAILS.bank)} · ${escapeHTML(PRINT_PAYMENT_DETAILS.holder)}</div>
        <strong>IBAN: ${escapeHTML(PRINT_PAYMENT_DETAILS.iban)}</strong>
    </footer>`;
}

function getPrintBaseStyles(options = {}) {
    const isLandscape = options.orientation === 'landscape';
    const pageSize = isLandscape ? 'A4 landscape' : 'A4 portrait';
    const hasPaymentFooter = options.paymentFooter === true;
    const pageMargin = isLandscape ? (hasPaymentFooter ? '13mm 14mm 28mm' : '13mm 14mm 17mm') : (hasPaymentFooter ? '15mm 16mm 28mm' : '15mm 16mm 19mm');
    const screenMinHeight = isLandscape ? '210mm' : '297mm';
    const screenPadding = pageMargin;
    const paymentFooterText = JSON.stringify(`${PRINT_PAYMENT_DETAILS.bank} · ${PRINT_PAYMENT_DETAILS.holder}\nIBAN: ${PRINT_PAYMENT_DETAILS.iban}`).replace(/\\n/g, '\\A ');
    return `
        @page {
            size: ${pageSize};
            margin: ${pageMargin};
            @bottom-left {
                content: ${hasPaymentFooter ? '""' : '"AK LAZER ERP"'};
                color: #64748b;
                font: 9px Arial, sans-serif;
            }
            ${hasPaymentFooter ? `@bottom-center {
                content: ${paymentFooterText};
                white-space: pre;
                color: #173b67;
                font: 10px/1.8 Arial, sans-serif;
                text-align: center;
                vertical-align: bottom;
                padding-bottom: 7mm;
            }` : ''}
            @bottom-right {
                content: "Sayfa " counter(page) " / " counter(pages);
                color: #64748b;
                font: 9px Arial, sans-serif;
            }
        }
        html { background: #fff; }
        * { box-sizing: border-box; }
        :root {
            --ink: #14213d;
            --ink-soft: #475569;
            --muted: #64748b;
            --line: #dbe3ec;
            --line-strong: #aebdce;
            --surface: #f5f8fc;
            --surface-blue: #eef4fb;
            --primary: #173b67;
            --accent: #1f6fb2;
            --success: #0f766e;
            --danger: #b42318;
        }
        body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); margin: 0; font-size: 11px; line-height: 1.5; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media screen {
            body { position: relative; min-height: ${screenMinHeight}; padding: ${screenPadding}; }
            .print-payment-footer { position: absolute; bottom: 7mm; left: ${isLandscape ? '14mm' : '16mm'}; right: ${isLandscape ? '14mm' : '16mm'}; color: var(--primary); font-size: 10px; line-height: 1.8; text-align: center; }
            .print-payment-footer strong { font-weight: 600; }
        }
        @media print {
            body { padding: 0; }
            .print-payment-footer { display: none; }
        }
        .brand-header { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, .9fr); gap: 40px; align-items: start; padding: 0 0 24px; margin-bottom: 24px; border-bottom: 2px solid var(--primary); break-inside: avoid; page-break-inside: avoid; }
        .brand-identity, .brand-document { min-width: 0; }
        .brand-logo { display: block; width: 178px; height: 57px; object-fit: contain; object-position: left center; margin-bottom: 12px; }
        h1 { margin: 2px 0 16px; font-size: 24px; font-weight: 700; line-height: 1.15; text-align: right; color: var(--primary); letter-spacing: -.025em; overflow-wrap: anywhere; }
        .company-name { color: var(--ink); font-size: 10px; line-height: 1.4; font-weight: 700; }
        .company-contact { display: grid; gap: 3px; max-width: 300px; margin-top: 5px; color: var(--ink-soft); font-size: 9px; line-height: 1.5; overflow-wrap: anywhere; }
        .meta { display: grid; gap: 4px; }
        .meta-row { display: grid; grid-template-columns: 85px minmax(0, 1fr); gap: 14px; align-items: baseline; }
        .meta-label { color: var(--muted); font-size: 9px; }
        .meta-value { color: var(--ink); font-size: 10px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
        .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin: 22px 0 9px; padding-bottom: 6px; border-bottom: 1px solid var(--line); break-after: avoid; page-break-after: avoid; }
        .section-heading h2 { margin: 0; color: var(--primary); font-size: 11px; line-height: 1.2; letter-spacing: .06em; text-transform: uppercase; }
        .section-heading span { color: var(--muted); font-size: 8.5px; }
        .document-intro-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 28px; margin: 0 0 18px; break-inside: avoid; page-break-inside: avoid; }
        .document-card { min-width: 0; padding: 0 0 8px; }
        .document-card-label { margin-bottom: 5px; color: var(--ink-soft); font-size: 10px; font-weight: 400; letter-spacing: .07em; text-transform: uppercase; }
        .document-card-value { color: var(--ink); font-size: 15px; line-height: 1.3; font-weight: 700; overflow-wrap: anywhere; }
        .document-card-detail { margin-top: 4px; color: var(--muted); font-size: 9.5px; line-height: 1.45; }
        .metric-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: 0 0 18px; border: 1px solid var(--line); background: var(--line); break-inside: avoid; page-break-inside: avoid; }
        .metric-item { padding: 10px 12px; background: var(--surface); }
        .metric-label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 7.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .metric-value { display: block; color: var(--primary); font-size: 14px; line-height: 1.15; }
        .metric-item.is-accent { background: var(--primary); }
        .metric-item.is-accent .metric-label { color: #c9d9ec; }
        .metric-item.is-accent .metric-value { color: #fff; }
        table { width: 100%; border-collapse: collapse; font-size: ${isLandscape ? '10px' : '11px'}; break-inside: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tbody tr, tfoot tr { break-inside: avoid; page-break-inside: avoid; }
        th, td { padding: ${isLandscape ? '7px 8px' : '10px 10px'}; border: 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: break-word; }
        th { padding-top: 7px; padding-bottom: 7px; border-top: 1px solid var(--primary); border-bottom: 1px solid var(--primary); background: var(--surface-blue); color: var(--primary); font-size: 8.5px; line-height: 1.4; font-weight: 700; letter-spacing: .025em; text-transform: uppercase; }
        tbody tr:nth-child(even) td { background: #fafbfd; }
        .total-row td { border-top: 1.5px solid var(--primary); border-bottom-color: var(--primary); color: var(--primary); font-size: 11px; font-weight: 700; }
        .text-right { text-align: right; }
        .number-cell { text-align: right; white-space: nowrap; }
        .print-profit-negative { color: #b42318; font-weight: 700; }
        .print-profit-positive { color: #087a5b; font-weight: 700; }
        .print-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin: 0 0 16px; border: 1px solid var(--line); background: var(--line); break-inside: avoid; page-break-inside: avoid; }
        .print-summary-card { padding: 10px 12px; border: 0; border-top: 3px solid var(--primary); background: var(--surface); }
        .print-summary-card span { display: block; margin-bottom: 5px; color: var(--muted); font-size: 8px; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
        .print-summary-card strong { display: block; color: var(--ink); font-size: 14px; line-height: 1.2; }
        .print-summary-card.is-negative { border-top-color: var(--danger); }
        .print-summary-card.is-negative strong { color: #b42318; }
        .print-summary-note { margin: -6px 0 16px; color: #64748b; font-size: 9.5px; line-height: 1.4; }
        .document-footer-grid { display: grid; grid-template-columns: minmax(0, 1fr) 285px; gap: 30px; align-items: start; margin-top: 20px; break-inside: avoid; page-break-inside: avoid; }
        .document-note { padding: 5px 0; background: #fff; color: var(--ink-soft); font-size: 9.5px; line-height: 1.55; }
        .document-note-title { display: block; margin-bottom: 4px; color: var(--primary); font-size: 8px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .totals-panel { width: 100%; border-collapse: collapse; }
        .totals-panel td { padding: 8px 10px; border-bottom: 1px solid var(--line); background: #fff !important; }
        .totals-panel td:first-child { color: var(--muted); font-size: 8.5px; font-weight: 700; }
        .totals-panel td:last-child { color: var(--ink); font-size: 11px; font-weight: 600; text-align: right; white-space: nowrap; }
        .totals-panel .total-row td { padding-top: 9px; padding-bottom: 9px; border: 0; background: var(--primary) !important; color: #fff; }
        .totals-panel .total-row td:first-child { font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
        .totals-panel .total-row td:last-child { font-size: 16px; }
        .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 34px; margin-top: 30px; break-inside: avoid; page-break-inside: avoid; }
        .signature-box { min-height: 54px; padding-top: 8px; border-top: 1px solid var(--line-strong); color: var(--ink-soft); font-size: 9px; line-height: 1.45; text-align: center; }
        .bank-details { display: grid; grid-template-columns: .8fr 1.7fr; gap: 24px; margin-top: 22px; padding-top: 12px; border-top: 1px solid var(--line); break-inside: avoid; page-break-inside: avoid; }
        .bank-field { display: grid; grid-template-columns: 48px 1fr; align-items: end; gap: 8px; min-height: 28px; }
        .bank-field span { color: var(--muted); font-size: 7.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .bank-field strong { display: block; min-height: 18px; border-bottom: 1px solid var(--line-strong); }
        .muted { color: var(--muted); font-size: 9px; line-height: 1.4; }
        .document-reference { text-align: right; }
        .document-intro-grid:has(> :only-child) { grid-template-columns: 1fr; }
        .document-footnote { margin-top: 28px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 9px; break-inside: avoid; }
        .document-footer-grid > .totals-panel { grid-column: 2; }
        .service-lines { table-layout: fixed; }
        .service-lines th:first-child { width: 7%; }
        .service-lines th:last-child { width: 26%; }
        .service-lines td { padding-top: 16px; padding-bottom: 16px; }
        .service-lines td:nth-child(2) { white-space: pre-wrap; overflow-wrap: anywhere; }
        .line-index { color: var(--muted); font-size: 10px; }
        .column-unit { display: block; font-size: 8px; font-weight: 400; text-transform: none; }
    `;
}

function getAttachmentFromInputs(fileInputId, noteInputId) {
    const fileInput = document.getElementById(fileInputId);
    const note = plainText(document.getElementById(noteInputId)?.value || '');
    const file = fileInput?.files?.[0] || null;
    if (!file && !note) return null;

    let filePath = '';
    if (file) {
        try {
            filePath = window.electronAPI?.getPathForFile
                ? window.electronAPI.getPathForFile(file)
                : (file.path || '');
        } catch (error) {
            console.warn('Belge dosya yolu alınamadı:', error?.message || error);
        }
    }

    return {
        name: file ? plainText(file.name) : 'Belge notu',
        path: plainText(filePath),
        note,
        archiveStatus: file && !filePath ? 'Arşivlenemedi' : (file ? 'Bekliyor' : 'Sadece not'),
        addedAt: new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
}

function resetAttachmentInputs(fileInputId, noteInputId) {
    const fileInput = document.getElementById(fileInputId);
    const noteInput = document.getElementById(noteInputId);
    if (fileInput) {
        fileInput.value = '';
        if (fileInput._fileSummary) renderFileInputSummary(fileInput);
    }
    if (noteInput) noteInput.value = '';
}

function renderAttachmentBadge(record) {
    if (!record?.ek) return '';
    const filePath = record.ek.archivedPath || record.ek.path || '';
    const title = [record.ek.name, record.ek.note, record.ek.archiveStatus].filter(Boolean).join(' - ');
    if (!filePath) {
        return `<span class="attachment-badge${record.ek.archiveStatus === 'Arşivlenemedi' ? ' attachment-error' : ''}" title="${escapeHTML(title || 'Belge notu')}"><i class="fa-solid fa-paperclip"></i> ${record.ek.note ? 'Not' : 'Ek Hatası'}</span>`;
    }
    return `<button type="button" class="attachment-badge attachment-button" title="${escapeHTML(title || 'Belge eki')}" onclick="openAttachmentPath(${escapeJSStringForAttr(filePath)})"><i class="fa-solid fa-paperclip"></i> Eki Aç</button>`;
}

window.openAttachmentPath = async function(filePath) {
    if (!filePath) return alert('Bu kayıtta açılabilir bir belge dosyası yok.');
    if (!window.electronAPI?.openAttachment) return alert('Belge açma özelliği masaüstü uygulamasında çalışır.');
    const result = await window.electronAPI.openAttachment(filePath);
    if (!result?.success) alert(result?.error || 'Belge dosyası bulunamadı.');
};

function renderAttachmentPrintLine(record) {
    if (!record?.ek) return '';
    return `<div class="muted">Belge Eki: ${escapeHTML(record.ek.name || record.ek.path || 'Ek belge')}${record.ek.note ? ` - ${escapeHTML(record.ek.note)}` : ''}</div>`;
}

function getPrintBaseHref() {
    return window.location.href.split('#')[0];
}

function makeDownloadFileName(value, extension) {
    const safeName = plainText(value || 'AK LAZER Belge')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'AK LAZER Belge';
    return `${safeName}-${getReportDateSlug()}.${extension}`;
}

async function savePrintPreviewDocument(title, html) {
    const button = document.getElementById('btn-print-preview-download');
    const originalHTML = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor';
    }

    try {
        if (window.electronAPI?.savePDF) {
            const result = await window.electronAPI.savePDF({ title, html });
            if (result?.success) {
                showToast({ type: 'success', title: 'PDF kaydedildi', message: title });
            } else if (!result?.canceled) {
                alert(`PDF kaydedilemedi: ${result?.error || 'Bilinmeyen hata'}`);
            }
            return;
        }

        downloadTextFile(makeDownloadFileName(title, 'html'), html, 'text/html;charset=utf-8;');
        alert('Bu tarayıcıda doğrudan PDF kaydı yok. Belge HTML olarak indirildi; açıp PDF olarak kaydedebilirsiniz.');
    } catch (error) {
        alert(`Belge kaydedilirken hata oluştu: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML;
        }
    }
}

function getWhatsAppShareMessage(title, shareContext = {}) {
    const customerName = plainText(shareContext.customerName || '');
    const documentNo = plainText(shareContext.documentNo || '');
    const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';
    const reference = documentNo ? ` (${documentNo})` : '';
    return `${greeting}\n\n${plainText(title)}${reference} belgesini iletiyorum.\n\nAK LAZER`;
}

async function sharePrintPreviewOnWhatsApp(title, html, shareContext = {}) {
    const button = document.getElementById('btn-print-preview-whatsapp');
    const originalHTML = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hazırlanıyor';
    }

    try {
        if (!window.electronAPI?.sharePDFWhatsApp) {
            alert('WhatsApp paylaşımı masaüstü uygulamasında çalışır.');
            return;
        }
        const result = await window.electronAPI.sharePDFWhatsApp({
            title,
            html,
            phone: plainText(shareContext.phone || ''),
            message: getWhatsAppShareMessage(title, shareContext)
        });
        if (!result?.success) {
            alert(`WhatsApp paylaşımı hazırlanamadı: ${result?.error || 'Bilinmeyen hata'}`);
            return;
        }
        const chatNote = result.phoneMatched
            ? 'Müşterinin WhatsApp sohbeti açıldı.'
            : 'Kayıtlı geçerli telefon bulunamadığı için WhatsApp kişi seçme ekranı açıldı.';
        showToast({ type: 'info', title: 'WhatsApp paylaşımı hazır', message: `${chatNote} Seçili PDF’yi sohbete sürükleyerek gönderebilirsiniz.`, duration: 9000 });
    } catch (error) {
        alert(`WhatsApp paylaşımı hazırlanırken hata oluştu: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML;
        }
    }
}

function openPrintPreview(title, contentHTML, extraStyles = '', options = {}) {
    const existingPreview = document.getElementById('print-preview-overlay');
    if (existingPreview) {
        if (typeof existingPreview.closePreview === 'function') existingPreview.closePreview();
        else existingPreview.remove();
    }

    const isLandscape = options.orientation === 'landscape';
    const frameWidth = isLandscape ? '297mm' : '210mm';
    const frameMinHeight = isLandscape ? '210mm' : '297mm';

    const previewHTML = `
        <!doctype html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <base href="${escapeHTML(getPrintBaseHref())}">
            <title>${escapeHTML(title)}</title>
            <style>
                ${getPrintBaseStyles(options)}
                ${extraStyles}
            </style>
        </head>
        <body>
            ${contentHTML}
            ${options.paymentFooter ? getPrintPaymentFooterHTML() : ''}
        </body>
        </html>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'print-preview-overlay';
    overlay.className = 'print-preview-overlay';
    overlay.innerHTML = `
        <div class="print-preview-toolbar">
            <div>
                <strong>Yazdırma Önizleme</strong>
                <span>${escapeHTML(title)}</span>
            </div>
            <div class="print-preview-actions">
                <button type="button" class="btn btn-outline" id="btn-print-preview-close">Kapat</button>
                <button type="button" class="btn btn-whatsapp" id="btn-print-preview-whatsapp" aria-label="PDF belgesini WhatsApp ile gönder"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp'tan Gönder</button>
                <button type="button" class="btn btn-outline" id="btn-print-preview-download"><i class="fa-solid fa-file-pdf"></i> PDF İndir</button>
                <button type="button" class="btn btn-primary" id="btn-print-preview-print"><i class="fa-solid fa-print"></i> Yazdır</button>
            </div>
        </div>
        <div class="print-preview-body">
            <iframe class="print-preview-frame" title="${escapeHTML(title)}" style="width:min(${frameWidth},100%);min-height:${frameMinHeight};"></iframe>
        </div>
    `;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;display:flex;flex-direction:column;background:rgba(8,10,14,0.96);';
    overlay.dataset.orientation = isLandscape ? 'landscape' : 'portrait';
    document.body.classList.add('print-preview-open');
    document.body.appendChild(overlay);

    const handleKeydown = event => {
        if (event.key === 'Escape') overlay.closePreview();
    };
    overlay.closePreview = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        if (!document.getElementById('print-preview-overlay')) document.body.classList.remove('print-preview-open');
    };
    document.addEventListener('keydown', handleKeydown);

    const frame = overlay.querySelector('.print-preview-frame');
    frame.srcdoc = previewHTML;
    frame.addEventListener('load', () => {
        const frameDocument = frame.contentDocument;
        if (!frameDocument) return;
        const height = Math.max(
            frameDocument.body?.scrollHeight || 0,
            frameDocument.documentElement?.scrollHeight || 0,
            Math.round(window.innerHeight * 0.72)
        );
        frame.style.height = `${height + 8}px`;
    });

    overlay.querySelector('#btn-print-preview-close')?.addEventListener('click', () => overlay.closePreview());
    overlay.querySelector('#btn-print-preview-download')?.addEventListener('click', () => {
        savePrintPreviewDocument(title, previewHTML);
    });
    overlay.querySelector('#btn-print-preview-whatsapp')?.addEventListener('click', () => {
        sharePrintPreviewOnWhatsApp(title, previewHTML, options.share || {});
    });
    overlay.querySelector('#btn-print-preview-print')?.addEventListener('click', () => {
        const frameWindow = frame.contentWindow;
        if (!frameWindow) return;
        frameWindow.focus();
        frameWindow.print();
    });
}

function getReportDateSlug() {
    return new Date().toISOString().slice(0, 10);
}

function getFilteredCarilerForReport() {
    const search = document.getElementById('cari-search')?.value.toLowerCase() || '';
    let cariler = getDBArray('cariler').filter(c =>
        (c.adi || '').toLowerCase().includes(search) ||
        codeSearchText(c).toLowerCase().includes(search)
    );

    if (cariTabFilter === 'alacakli') {
        cariler = cariler.filter(c => c.bakiye > 0);
    } else if (cariTabFilter === 'borclu') {
        cariler = cariler.filter(c => c.bakiye < 0);
    }

    return cariler;
}

function getFilteredStoklarForReport() {
    const searchVal = (document.getElementById('stok-search')?.value || '').toLowerCase();
    const filtered = getDBArray('stoklar').filter(s => !s.cutVoided && !(Number(s.miktar || 0) === 0 && Number(s.kg || 0) === 0)).filter(s =>
        (s.cinsi || '').toLowerCase().includes(searchVal) ||
        codeSearchText(s).toLowerCase().includes(searchVal)
    );
    return filterByReportDate('inventory', filtered);
}

function getFilteredFirelerForReport() {
    const search = normalizeLookupText(document.getElementById('scraps-search')?.value || '');
    let rows = getDBArray('fireler');
    if (search) {
        rows = rows.filter(item => [item.cinsi, item.mm, item.en, item.boy, item.sahibi, item.tarih]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    return filterByReportDate('scraps', rows);
}

function getFilteredExpensesForReport() {
    const search = normalizeLookupText(document.getElementById('expenses-search')?.value || '');
    let rows = getDBArray('giderler');
    if (search) {
        rows = rows.filter(item => [item.kategori, item.aciklama, item.tarih, item.kasaAdi]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    return filterByReportDate('expenses', rows);
}

function getFilteredInvoicesForReport() {
    const search = normalizeLookupText(document.getElementById('invoices-search')?.value || '');
    let rows = getDBArray('faturalar');
    if (search) {
        rows = rows.filter(item => [item.faturaNo, item.firma, item.aciklama, item.tarih, item.orderNo]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    return filterByReportDate('invoices', rows);
}

function getFilteredOrdersForReport() {
    const search = normalizeLookupText(document.getElementById('orders-search')?.value || '');
    let rows = getDBArray('isEmirleri');
    if (search) {
        rows = rows.filter(item => [item.orderNo, item.customerName, item.description, item.durum, item.quoteNo]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    return filterByReportDate('orders', rows);
}

function getFilteredProfitabilityOrders() {
    const search = normalizeLookupText(document.getElementById('profitability-search')?.value || '');
    const scope = document.getElementById('profitability-status-filter')?.value || 'delivered';
    let rows = filterByReportDate('profitability', getDBArray('isEmirleri'))
        .filter(order => order.durum !== 'İptal');

    if (search) {
        rows = rows.filter(order =>
            normalizeLookupText(order.orderNo).includes(search) ||
            normalizeLookupText(order.customerName).includes(search) ||
            normalizeLookupText(order.description).includes(search)
        );
    }

    if (scope === 'delivered') rows = rows.filter(order => order.durum === 'Teslim Edildi');
    if (scope === 'incomplete') rows = rows.filter(order => getProfitabilityStatus(order) !== 'Kesin');
    if (scope === 'loss') rows = rows.filter(order => getOrderProfitability(order).grossProfit < 0);
    return rows;
}

function getFilteredQuotesForReport() {
    const search = normalizeLookupText(document.getElementById('quotes-search')?.value || '');
    let rows = getDBArray('teklifler');
    if (search) {
        rows = rows.filter(item => [item.teklifNo, item.customerName, item.description, item.durum]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    return filterByReportDate('quotes', rows);
}

function getFilteredPersonnelPayrollForReport() {
    return filterByReportDate('personnel', getDBArray('personelPuantajlari'));
}

function getFilteredCekSenetlerForReport() {
    const searchVal = normalizeLookupText(document.getElementById('ceksenet-search')?.value || '');
    const statusFilter = document.getElementById('ceksenet-status-filter')?.value || 'all';
    let rows = getDBArray('cekSenetler');

    if (searchVal) {
        rows = rows.filter(record =>
            normalizeLookupText(record.firma).includes(searchVal) ||
            normalizeLookupText(record.belgeNo).includes(searchVal) ||
            normalizeLookupText(record.banka).includes(searchVal) ||
            normalizeLookupText(record.aciklama).includes(searchVal)
        );
    }

    if (statusFilter !== 'all') {
        rows = rows.filter(record => record.durum === statusFilter);
    }

    return filterByReportDate('cheques', rows);
}

const reportSelections = {};

const LIST_PAGE_SIZE_DEFAULT = 25;
const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100];
const LIST_PREFERENCES_KEY = 'ak_lazer_list_preferences';
const LIST_SCOPE_CONFIG = Object.freeze({
    accounts: { pageKey: 'pageAccounts', render: () => renderCariler() },
    orders: { pageKey: 'pageOrders', render: () => renderOrders() },
    inventory: { pageKey: 'pageInventory', render: () => renderStoklar() },
    scraps: { pageKey: 'pageScraps', render: () => renderFireler() },
    expenses: { pageKey: 'pageExpenses', render: () => renderExpenses() },
    profitability: { pageKey: 'pageProfitability', render: () => renderProfitability() },
    personnel: { pageKey: 'pagePersonnel', render: () => renderPersonnel() },
    audit: { pageKey: 'pageAudit', render: () => renderAuditTrail() },
    cheques: { pageKey: 'pageCheques', render: () => renderCekSenetler() },
    invoices: { pageKey: 'pageInvoices', render: () => renderInvoices() },
    quotes: { pageKey: 'pageQuoteHistory', render: () => renderQuoteHistory() },
    'stock-movements': { pageKey: 'pageStockMovements', render: () => renderStockMovements() },
    'cash-movements': { pageKey: 'pageCashMovements', render: () => renderCashBank() },
    'payment-plans': { pageKey: 'pagePaymentPlans', render: () => renderPaymentPlans() },
    ekstre: { pageKey: 'cariHistoryPage', render: () => renderCariHistory() },
    'stat-detail': { pageKey: 'pageStatDetail', render: () => renderStatModal() }
});

const LIST_SORT_STATE = {};
const LIST_SORT_TABLES = Object.freeze({
    accounts: { tbodyId: 'accounts-tbody', columns: { 'Firma / Cari': 'name', 'İletişim': 'contact', 'Bakiye': 'balance', 'Durum': 'status' } },
    orders: { tbodyId: 'orders-tbody', columns: { 'İş Emri No': 'number', 'Müşteri': 'customer', 'İş Açıklaması': 'description', 'Tutar': 'amount', 'Durum': 'status' } },
    inventory: { tbodyId: 'inventory-tbody', columns: { 'Kod': 'code', 'Cinsi / Kalite': 'material', 'Kalınlık (mm)': 'thickness', 'Ebat (EnxBoy)': 'size', 'Miktar (Plaka)': 'quantity', 'Ağırlık (KG)': 'weight', 'Sahibi': 'owner', 'KG Birim Fiyatı (₺)': 'cost', 'Toplam Maliyet (₺)': 'totalCost' } },
    scraps: { tbodyId: 'scraps-tbody', columns: { 'Cinsi': 'material', 'Kalınlık (mm)': 'thickness', 'Ebat (EnxBoy)': 'size', 'Sahibi': 'owner', 'Tarih': 'date' } },
    expenses: { tbodyId: 'expenses-tbody', columns: { 'Tarih': 'date', 'Kategori': 'category', 'Açıklama': 'description', 'Tutar': 'amount' } },
    profitability: { tbodyId: 'profitability-tbody', columns: { 'İş Emri': 'number', 'Tarih': 'date', 'Müşteri / İş': 'customer', 'Net Satış': 'revenue', 'Maliyet': 'cost', 'Kâr': 'profit', 'Marj': 'margin', 'Maliyet Durumu': 'status' } },
    personnel: { tbodyId: 'personnel-tbody', columns: { 'Dönem': 'period', 'Personel': 'person', 'Gün / İzin / Eksik': 'attendance', 'Net Maaş': 'salary', 'Durum': 'status', 'Telefon': 'phone', 'Görev': 'role', 'Maaş': 'salary', 'Son Puantaj': 'period' } },
    audit: { tbodyId: 'audit-tbody', columns: { 'Tarih': 'date', 'İşlem': 'action', 'Kayıt Türü': 'entity', 'Açıklama': 'detail', 'Kullanıcı': 'actor' } },
    cheques: { tbodyId: 'cheques-tbody', columns: { 'Tip': 'type', 'Firma / Belge No': 'company', 'Vade': 'date', 'Banka': 'bank', 'Tutar': 'amount', 'Durum': 'status' } },
    invoices: { tbodyId: 'invoices-tbody', columns: { 'Fatura No': 'number', 'Tarih': 'date', 'Firma': 'company', 'Açıklama': 'description', 'Tutar': 'amount' } }
});

function compareListSortValues(left, right) {
    if (left instanceof Date && Number.isNaN(left.getTime())) left = null;
    if (right instanceof Date && Number.isNaN(right.getTime())) right = null;
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : (leftEmpty ? 1 : -1);
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
    return String(left).localeCompare(String(right), 'tr', { numeric: true, sensitivity: 'base' });
}

function applyListSort(scope, records, accessors = {}) {
    const state = LIST_SORT_STATE[scope];
    if (!state || typeof accessors[state.key] !== 'function') return [...records];
    const direction = state.direction === 'desc' ? -1 : 1;
    return [...records].sort((left, right) => compareListSortValues(accessors[state.key](left), accessors[state.key](right)) * direction);
}

function enhanceSortableTableHeaders(scope = '') {
    const entries = scope ? [[scope, LIST_SORT_TABLES[scope]]] : Object.entries(LIST_SORT_TABLES);
    entries.forEach(([tableScope, config]) => {
        if (!config) return;
        const tbody = document.getElementById(config.tbodyId);
        const table = tbody?.closest('table');
        if (!table) return;
        table.dataset.sortScope = tableScope;
        table.querySelectorAll('thead th').forEach(th => {
            const label = plainText(th.textContent);
            const key = config.columns[label];
            if (!key) return;
            th.classList.add('sortable-column');
            th.dataset.sortKey = key;
            const state = LIST_SORT_STATE[tableScope];
            th.setAttribute('aria-sort', state?.key === key ? (state.direction === 'desc' ? 'descending' : 'ascending') : 'none');
            let button = th.querySelector('.table-sort-button');
            if (!button) {
                th.textContent = '';
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'table-sort-button';
                button.dataset.sortScope = tableScope;
                button.dataset.sortKey = key;
                button.innerHTML = `<span>${escapeHTML(label)}</span><i class="fa-solid fa-sort" aria-hidden="true"></i>`;
                button.addEventListener('click', () => setListSort(tableScope, key));
                th.appendChild(button);
            }
            const active = state?.key === key;
            button.classList.toggle('active', active);
            const icon = button.querySelector('i');
            if (icon) icon.className = `fa-solid ${active ? (state.direction === 'desc' ? 'fa-sort-down' : 'fa-sort-up') : 'fa-sort'}`;
            button.setAttribute('aria-label', `${label} sütununu ${active && state.direction === 'asc' ? 'azalan' : 'artan'} sırala`);
        });
    });
}

window.setListSort = function(scope, key) {
    const current = LIST_SORT_STATE[scope];
    LIST_SORT_STATE[scope] = current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' };
    resetListPage(scope);
    renderListScope(scope);
};

function readListPreferences() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LIST_PREFERENCES_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function getListPageSize(scope) {
    const value = Number(readListPreferences()[scope]);
    return LIST_PAGE_SIZE_OPTIONS.includes(value) ? value : LIST_PAGE_SIZE_DEFAULT;
}

function saveListPageSize(scope, value) {
    const size = Number(value);
    if (!LIST_PAGE_SIZE_OPTIONS.includes(size)) return;
    const preferences = readListPreferences();
    preferences[scope] = size;
    try {
        localStorage.setItem(LIST_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (_) {
        // Tercih kaydedilemese bile mevcut oturumda liste çalışmaya devam eder.
    }
}

function getListScopeConfig(scope) {
    return LIST_SCOPE_CONFIG[scope] || null;
}

function resetListPage(scope) {
    const config = getListScopeConfig(scope);
    if (config) window[config.pageKey] = 1;
}

function renderListScope(scope) {
    getListScopeConfig(scope)?.render();
    enhanceSortableTableHeaders(scope);
}

window.setListPageSize = function(scope, value) {
    saveListPageSize(scope, value);
    resetListPage(scope);
    document.querySelectorAll(`[data-list-page-size="${scope}"]`).forEach(select => {
        select.value = String(getListPageSize(scope));
    });
    renderListScope(scope);
};

window.changeListPage = function(scope, delta) {
    const config = getListScopeConfig(scope);
    if (!config) return;
    window[config.pageKey] = Math.max(1, (Number(window[config.pageKey]) || 1) + Number(delta || 0));
    config.render();
};

window.handleHighVolumeSearch = function(scope) {
    resetListPage(scope);
    renderListScope(scope);
};

function formatListPagination(page, totalPages, totalRecords, pageSize) {
    const total = Math.max(0, Number(totalRecords) || 0);
    const current = Math.max(1, Number(page) || 1);
    const start = total ? ((current - 1) * pageSize) + 1 : 0;
    const end = total ? Math.min(current * pageSize, total) : 0;
    return `${start}–${end} / ${total} kayıt · Sayfa ${current}/${Math.max(1, totalPages)}`;
}

function buildListPageSizeControl(scope) {
    const label = document.createElement('label');
    label.className = 'list-page-size-control';
    label.innerHTML = `
        <span>Sayfada</span>
        <select class="list-page-size-select" data-list-page-size="${scope}" aria-label="Sayfada gösterilecek kayıt sayısı">
            ${LIST_PAGE_SIZE_OPTIONS.map(size => `<option value="${size}"${getListPageSize(scope) === size ? ' selected' : ''}>${size}</option>`).join('')}
        </select>
        <span>kayıt</span>
    `;
    label.querySelector('select')?.addEventListener('change', event => setListPageSize(scope, event.target.value));
    return label;
}

function enhancePaginationBar(bar, scope) {
    if (!bar || bar.dataset.volumePaginationEnhanced === 'true') return;
    bar.dataset.volumePaginationEnhanced = 'true';
    bar.classList.add('pagination-bar');
    const info = bar.querySelector('[id$="-page-info"]');
    if (!info) return;
    const summary = document.createElement('div');
    summary.className = 'pagination-summary';
    info.parentNode.insertBefore(summary, info);
    summary.append(info, buildListPageSizeControl(scope));
}

function createListPaginationBar(scope, tbodyId) {
    if (document.getElementById(`${scope}-page-info`)) return;
    const tbody = document.getElementById(tbodyId);
    const shell = tbody?.closest('.table-scroll-shell');
    if (!shell) return;
    const bar = document.createElement('div');
    bar.className = 'flex-between align-center mt-3 pagination-bar';
    bar.innerHTML = `
        <span id="${scope}-page-info">0–0 / 0 kayıt · Sayfa 1/1</span>
        <div class="pagination-actions">
            <button type="button" class="btn btn-outline" id="btn-${scope}-prev" aria-label="Önceki sayfa">&laquo; Önceki</button>
            <button type="button" class="btn btn-outline" id="btn-${scope}-next" aria-label="Sonraki sayfa">Sonraki &raquo;</button>
        </div>
    `;
    bar.querySelector(`#btn-${scope}-prev`)?.addEventListener('click', () => changeListPage(scope, -1));
    bar.querySelector(`#btn-${scope}-next`)?.addEventListener('click', () => changeListPage(scope, 1));
    shell.insertAdjacentElement('afterend', bar);
    enhancePaginationBar(bar, scope);
}

function createHighVolumeSearch(scope, tbodyId, placeholder) {
    const inputId = `${scope}-search`;
    if (document.getElementById(inputId)) return;
    const tbody = document.getElementById(tbodyId);
    const shell = tbody?.closest('.table-scroll-shell');
    if (!shell) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'high-volume-list-toolbar';
    toolbar.innerHTML = `
        <div class="search-box high-volume-search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" id="${inputId}" class="form-control" placeholder="${placeholder}" autocomplete="off">
        </div>
        <span class="high-volume-list-hint"><i class="fa-solid fa-database" aria-hidden="true"></i> İsim, kod veya açıklamayla bulun</span>
    `;
    toolbar.querySelector('input')?.addEventListener('input', () => handleHighVolumeSearch(scope));
    shell.insertAdjacentElement('beforebegin', toolbar);
}

function enhanceHighVolumeListControls() {
    const autoPagination = [
        ['inventory', 'inventory-tbody'],
        ['stock-movements', 'stock-movements-tbody'],
        ['cash-movements', 'cash-movements-tbody'],
        ['payment-plans', 'payment-plans-tbody']
    ];
    autoPagination.forEach(([scope, tbodyId]) => createListPaginationBar(scope, tbodyId));

    document.querySelectorAll('[id$="-page-info"]').forEach(info => {
        const scope = info.id.replace(/-page-info$/, '');
        if (getListScopeConfig(scope)) enhancePaginationBar(info.closest('.flex-between') || info.parentElement, scope);
    });

    [
        ['orders', 'orders-tbody', 'İş emri no, müşteri veya açıklama ara...'],
        ['scraps', 'scraps-tbody', 'Malzeme, ölçü veya sahip ara...'],
        ['expenses', 'expenses-tbody', 'Kategori, açıklama veya tarih ara...'],
        ['invoices', 'invoices-tbody', 'Fatura no, firma veya açıklama ara...'],
        ['stock-movements', 'stock-movements-tbody', 'Stok, hareket veya açıklama ara...'],
        ['cash-movements', 'cash-movements-tbody', 'Hesap, açıklama veya tarih ara...'],
        ['payment-plans', 'payment-plans-tbody', 'Cari, plan no veya açıklama ara...']
    ].forEach(args => createHighVolumeSearch(...args));

    const quoteList = document.getElementById('quote-history-list');
    if (quoteList && !document.getElementById('quotes-search')) {
        const toolbar = document.createElement('div');
        toolbar.className = 'high-volume-list-toolbar quote-history-search-toolbar';
        toolbar.innerHTML = `
            <div class="search-box high-volume-search-box">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" id="quotes-search" class="form-control" placeholder="Teklif no, müşteri veya iş ara..." autocomplete="off">
            </div>
        `;
        toolbar.querySelector('input')?.addEventListener('input', () => handleHighVolumeSearch('quotes'));
        quoteList.insertAdjacentElement('beforebegin', toolbar);
        const bar = document.createElement('div');
        bar.className = 'flex-between align-center mt-3 pagination-bar quote-history-pagination';
        bar.innerHTML = `
            <span id="quotes-page-info">0–0 / 0 kayıt · Sayfa 1/1</span>
            <div class="pagination-actions">
                <button type="button" class="btn btn-outline" id="btn-quotes-prev">&laquo; Önceki</button>
                <button type="button" class="btn btn-outline" id="btn-quotes-next">Sonraki &raquo;</button>
            </div>
        `;
        bar.querySelector('#btn-quotes-prev')?.addEventListener('click', () => changeListPage('quotes', -1));
        bar.querySelector('#btn-quotes-next')?.addEventListener('click', () => changeListPage('quotes', 1));
        quoteList.insertAdjacentElement('afterend', bar);
        enhancePaginationBar(bar, 'quotes');
    }
}

const reportDateRenderers = {
    orders: () => {
        window.pageOrders = 1;
        renderOrders();
    },
    inventory: () => {
        window.pageInventory = 1;
        renderStoklar();
    },
    scraps: () => {
        window.pageScraps = 1;
        renderFireler();
    },
    expenses: () => {
        window.pageExpenses = 1;
        renderExpenses();
    },
    profitability: () => {
        window.pageProfitability = 1;
        renderProfitability();
    },
    invoices: () => {
        window.pageInvoices = 1;
        renderInvoices();
    },
    quotes: () => {
        window.pageQuoteHistory = 1;
        renderQuoteHistory();
    },
    personnel: () => {
        window.pagePersonnel = 1;
        renderPersonnel();
    },
    audit: () => {
        window.pageAudit = 1;
        renderAuditTrail();
    },
    cheques: () => {
        window.pageCheques = 1;
        renderCekSenetler();
    }
};

function getReportDateRange(type) {
    const startValue = document.getElementById(`report-date-${type}-start`)?.value || '';
    const endValue = document.getElementById(`report-date-${type}-end`)?.value || '';
    return {
        startValue,
        endValue,
        startDate: parseDateInputValue(startValue, false),
        endDate: parseDateInputValue(endValue, true)
    };
}

function getReportDateValue(type, item) {
    if (!item) return '';
    if (type === 'orders' || type === 'profitability') return item.faturaTarihi || item.teslimTarihi || item.tarih || '';
    if (type === 'personnel') return item.tarih || monthToReportDate(item.donem) || '';
    if (type === 'cheques') return item.vadeTarihi || item.tarih || '';
    return item.tarih || item.faturaTarihi || '';
}

function filterByReportDate(type, rows) {
    const range = getReportDateRange(type);
    return rows.filter(row => isDateInRange(getReportDateValue(type, row), range));
}

function isInvalidDateRange(range) {
    return !!(range?.startDate && range?.endDate && range.startDate > range.endDate);
}

function getReportDateRangeLabel(type) {
    const range = getReportDateRange(type);
    return (!range.startValue && !range.endValue) ? 'Tüm tarihler' : formatDateRangeLabel(range);
}

function validateReportDateRange(type) {
    const range = getReportDateRange(type);
    if (isInvalidDateRange(range)) {
        alert('Başlangıç tarihi bitiş tarihinden büyük olamaz.');
        return false;
    }
    return true;
}

window.updateReportDateRangeUI = function(type, activePreset = '') {
    const range = getReportDateRange(type);
    const labelEl = document.getElementById(`report-date-${type}-label`);
    if (labelEl) {
        labelEl.textContent = isInvalidDateRange(range)
            ? 'Tarih aralığı hatalı.'
            : ((!range.startValue && !range.endValue)
                ? 'Tüm tarihler listelenir.'
                : `Liste aralığı: ${formatDateRangeLabel(range)}`);
    }

    document.querySelectorAll(`[data-report-date-panel="${type}"] .account-date-preset`).forEach(btn => {
        btn.classList.toggle('active', !!activePreset && btn.dataset.preset === activePreset);
    });
    refreshDateInputDisplay();
    document.querySelectorAll(`[data-report-date-panel="${type}"]`).forEach(updateFilterPanelIndicator);
};

window.applyReportDateFilter = function(type) {
    updateReportDateRangeUI(type);
    reportDateRenderers[type]?.();
};

window.clearReportDateRange = function(type) {
    const startEl = document.getElementById(`report-date-${type}-start`);
    const endEl = document.getElementById(`report-date-${type}-end`);
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';
    updateReportDateRangeUI(type, 'all');
    reportDateRenderers[type]?.();
};

function getDatePresetRange(preset, referenceDate = new Date()) {
    const now = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    let start = null;
    let end = null;

    if (preset === 'thisWeek') {
        const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    } else if (preset === 'thisMonth') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === 'lastMonth') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'thisYear') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
    }

    return { start, end };
}

window.setReportDatePreset = function(type, preset) {
    if (preset === 'all') {
        clearReportDateRange(type);
        return;
    }

    const { start, end } = getDatePresetRange(preset);

    const startEl = document.getElementById(`report-date-${type}-start`);
    const endEl = document.getElementById(`report-date-${type}-end`);
    if (startEl) startEl.value = toDateInputValue(start);
    if (endEl) endEl.value = toDateInputValue(end);
    updateReportDateRangeUI(type, preset);
    reportDateRenderers[type]?.();
};

function getReportSelection(type) {
    if (!reportSelections[type]) reportSelections[type] = new Set();
    return reportSelections[type];
}

function reportRowValues(row) {
    return Array.isArray(row) ? row : row.values;
}

function getReportRows(report, selectedOnly = false) {
    if (!selectedOnly) return report.rows;
    const selected = getReportSelection(report.type);
    return report.rows.filter(row => selected.has(String(row.id)));
}

function renderSelectionCell(type, id) {
    const checked = getReportSelection(type).has(String(id)) ? 'checked' : '';
    return `<td class="selection-cell" onclick="event.stopPropagation();"><input type="checkbox" class="report-row-check" data-select-row="${type}" value="${id}" onchange="toggleReportSelection('${type}', '${id}', this.checked)" ${checked}></td>`;
}

function updateReportSelectionUI(type) {
    const selected = getReportSelection(type);
    const visibleChecks = [...document.querySelectorAll(`input[data-select-row="${type}"]`)];
    const allCheck = document.querySelector(`input[data-select-all="${type}"]`);
    const countEl = document.getElementById(`${type}-selection-count`);

    if (allCheck) {
        const checkedCount = visibleChecks.filter(cb => cb.checked).length;
        allCheck.checked = visibleChecks.length > 0 && checkedCount === visibleChecks.length;
        allCheck.indeterminate = checkedCount > 0 && checkedCount < visibleChecks.length;
    }

    if (countEl) {
        countEl.textContent = selected.size ? `${selected.size} seçili` : 'Seçim yok';
        countEl.classList.toggle('is-empty', selected.size === 0);
    }
}

window.toggleReportSelection = function(type, id, checked) {
    const selected = getReportSelection(type);
    if (checked) selected.add(String(id));
    else selected.delete(String(id));
    updateReportSelectionUI(type);
};

window.toggleVisibleReportSelection = function(type, checked) {
    const selected = getReportSelection(type);
    document.querySelectorAll(`input[data-select-row="${type}"]`).forEach(cb => {
        cb.checked = checked;
        if (checked) selected.add(String(cb.value));
        else selected.delete(String(cb.value));
    });
    updateReportSelectionUI(type);
};

window.clearReportSelection = function(type) {
    getReportSelection(type).clear();
    document.querySelectorAll(`input[data-select-row="${type}"]`).forEach(cb => cb.checked = false);
    updateReportSelectionUI(type);
};

function getListReport(type) {
    const reports = {
        accounts: () => ({
            type: 'accounts',
            title: 'Cari Hesaplar',
            headers: ['Cari Kodu', 'Firma Adı', 'Telefon', 'Bakiye', 'Durum'],
            rows: getFilteredCarilerForReport().map(c => ({
                id: String(c.id),
                values: [
                    c.kodu || '-',
                    c.adi || '-',
                    c.tel || c.telefon || '-',
                    formatCurrency(c.bakiye || 0),
                    c.isPasif ? 'Pasif' : (c.bakiye === 0 ? 'Temiz' : (c.bakiye > 0 ? 'Alacaklı' : 'Borçlumuz'))
                ]
            }))
        }),
        inventory: () => ({
            type: 'inventory',
            title: 'Stok Malzeme Listesi',
            dateRangeLabel: getReportDateRangeLabel('inventory'),
            headers: ['Kod', 'Tarih', 'Cinsi / Kalite', 'Kalınlık (mm)', 'Ebat', 'Miktar', 'Kritik Seviye', 'Ağırlık (KG)', 'Sahibi', 'KG Birim Fiyatı (₺)', 'Toplam Maliyet (₺)'],
            rows: getFilteredStoklarForReport().map(s => ({
                id: String(s.id),
                values: [
                    getStockDisplayCode(s),
                    s.tarih || '-',
                    s.cinsi || '-',
                    s.mm || '-',
                    s.ebat || '-',
                    s.miktar || 0,
                    s.kritikSeviye || 0,
                    s.kg || 0,
                    s.sahibi || 'Biz',
                    s.sahibiTipi === 'musteri' ? '-' : formatCurrency(s.maliyet || 0),
                    s.sahibiTipi === 'musteri' ? '-' : formatCurrency(getStockTotalCost(s))
                ]
            }))
        }),
        scraps: () => ({
            type: 'scraps',
            title: 'Fireler ve Artık Parçalar',
            dateRangeLabel: getReportDateRangeLabel('scraps'),
            headers: ['Tür', 'Cinsi', 'Kalınlık (mm)', 'Ebat', 'Miktar', 'Ağırlık', 'Sahibi', 'İş Emri', 'Tarih'],
            rows: [...getFilteredFirelerForReport()].reverse().map(f => ({
                id: String(f.id),
                values: [
                    f.tur === 'kullanilabilir' ? 'Kullanılabilir Parça' : (f.tur === 'hurda' ? 'Hurda' : 'Fire'),
                    f.cinsi || '-',
                    f.mm || '-',
                    `${f.en || '-'}x${f.boy || '-'}`,
                    f.miktar || 0,
                    f.kg || 0,
                    f.sahibi || 'Biz',
                    f.isEmriNo || '-',
                    f.tarih || '-'
                ]
            }))
        }),
        expenses: () => ({
            type: 'expenses',
            title: 'Gider Kayıtları',
            dateRangeLabel: getReportDateRangeLabel('expenses'),
            headers: ['Tarih', 'Kategori', 'Belge No', 'Cari', 'Açıklama', 'Matrah', 'KDV', 'Toplam'],
            rows: [...getFilteredExpensesForReport()].reverse().map(g => ({
                id: String(g.id),
                values: [
                    g.tarih || '-',
                    g.kategori || '-',
                    g.belgeNo || '-',
                    g.cariAdi || '-',
                    g.aciklama || '-',
                    formatCurrency(g.matrah ?? g.tutar ?? 0),
                    formatCurrency(g.kdvTutari || 0),
                    formatCurrency(g.tutar || 0)
                ]
            }))
        }),
        invoices: () => {
            const filtered = getFilteredInvoicesForReport().filter(f => f.tur === invoiceTabFilter);
            return {
                type: 'invoices',
                title: invoiceTabFilter === 'kesilen' ? 'Kesilen Faturalar' : 'Alınan Faturalar',
                dateRangeLabel: getReportDateRangeLabel('invoices'),
                headers: ['Fatura No', 'Tarih', 'Vade', 'Firma', 'Matrah', 'KDV', 'Genel Toplam', 'Ödeme Durumu', 'Ek'],
                rows: [...filtered].reverse().map(f => ({
                    id: String(f.id),
                    values: [
                        f.faturaNo || '-',
                        f.faturaTarihi || f.tarih || '-',
                        f.vadeTarihi || '-',
                        f.firma || '-',
                        formatCurrency(getInvoiceDocumentLine(f).subTotal),
                        `%${getInvoiceDocumentLine(f).taxRate} / ${formatCurrency(getInvoiceDocumentLine(f).tax)}`,
                        `${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar || 0)}`,
                        getInvoicePaymentLabel(f),
                        f.ek ? (f.ek.name || 'Var') : '-'
                    ]
                }))
            };
        },
        orders: () => ({
            type: 'orders',
            title: 'İş Emirleri',
            dateRangeLabel: getReportDateRangeLabel('orders'),
            headers: ['İş Emri No', 'Tarih', 'Müşteri', 'İş Açıklaması', 'Tutar', 'Durum'],
            rows: [...getFilteredOrdersForReport()].reverse().map(o => ({
                id: String(o.id),
                values: [
                    o.orderNo || '-',
                    o.tarih || '-',
                    o.customerName || '-',
                    o.islemTipi === 'hammadde' ? `${o.kgAmount || 0} KG Satış` : (o.description || '-'),
                    formatCurrency(o.total || 0),
                    o.durum || 'Beklemede'
                ]
            }))
        }),
        profitability: () => ({
            type: 'profitability',
            title: 'Şirket İçi İş Emri Kârlılık Raporu',
            dateRangeLabel: getReportDateRangeLabel('profitability'),
            headers: ['İş Emri', 'Tarih', 'Müşteri', 'İş Açıklaması', 'Net Satış', 'Toplam Maliyet', 'Brüt Kâr', 'Kâr Marjı', 'Maliyet Durumu'],
            rows: [...getFilteredProfitabilityOrders()].reverse().map(order => {
                const result = getOrderProfitability(order);
                return {
                    id: String(order.id),
                    values: [
                        order.orderNo || '-',
                        getReportDateValue('profitability', order) || '-',
                        order.customerName || '-',
                        order.islemTipi === 'hammadde' ? `${order.kgAmount || 0} KG hammadde satışı` : (order.description || '-'),
                        formatCurrency(result.profitNetRevenue),
                        formatCurrency(result.costTotal),
                        formatCurrency(result.grossProfit),
                        `%${result.profitMargin.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        getProfitabilityStatus(order)
                    ]
                };
            })
        }),
        personnel: () => {
            const rows = getPersonnelReportRows();
            return {
                type: 'personnel',
                title: personnelTabFilter === 'payroll' ? 'Personel Maaş ve Puantaj' : 'Personel Listesi',
                dateRangeLabel: getReportDateRangeLabel('personnel'),
                headers: personnelTabFilter === 'payroll'
                    ? ['Dönem', 'Personel', 'Geldiği Gün', 'İzin', 'Eksik', 'Net Maaş', 'Durum']
                    : ['Personel', 'Telefon', 'Görev', 'Maaş Tipi', 'Maaş', 'Durum'],
                rows
            };
        },
        audit: () => ({
            type: 'audit',
            title: 'Denetim Geçmişi',
            dateRangeLabel: getReportDateRangeLabel('audit'),
            headers: ['Tarih', 'İşlem', 'Kayıt Türü', 'Açıklama', 'Kullanıcı'],
            rows: getSortedAuditRecords().map(record => ({
                id: String(record.id),
                values: [
                    record.tarih || '-',
                    record.action || 'İşlem',
                    record.entityType || 'Genel',
                    record.detail || '-',
                    record.actor || 'Yerel Kullanıcı'
                ]
            }))
        }),
        cheques: () => ({
            type: 'cheques',
            title: 'Çek / Senet Takibi',
            dateRangeLabel: getReportDateRangeLabel('cheques'),
            headers: ['Vade', 'Tip', 'Firma', 'Belge No', 'Seri', 'Keşideci', 'Lehtar', 'Banka', 'Tutar', 'Durum', 'Ciro', 'Teslim', 'Ek'],
            rows: [...getFilteredCekSenetlerForReport()].reverse().map(record => ({
                id: String(record.id),
                values: [
                    record.vadeTarihi || '-',
                    getCekSenetTypeLabel(record.tip),
                    record.firma || '-',
                    record.belgeNo || '-',
                    record.seriNo || '-',
                    record.kesideci || '-',
                    record.lehtar || '-',
                    record.banka || '-',
                    formatCurrency(record.tutar || 0),
                    getCekSenetStatusLabel(record.durum),
                    record.ciroDurumu === 'ciro_edildi' ? 'Ciro Edildi' : (record.ciroDurumu === 'ciro_alindi' ? 'Ciro ile Alındı' : 'Ciro Yok'),
                    record.teslimAlan || '-',
                    record.ek ? (record.ek.name || 'Var') : '-'
                ]
            }))
        })
    };

    return reports[type] ? reports[type]() : null;
}

function exportReportToExcel(type, selectedOnly = false) {
    const report = getListReport(type);
    if (!report) return alert('Dışa aktarılacak liste bulunamadı.');
    if (type !== 'accounts' && !validateReportDateRange(type)) return;
    const rows = getReportRows(report, selectedOnly);
    if (!rows.length) {
        return alert(selectedOnly ? 'Excel için önce listedeki kayıtları seçin.' : 'Bu listede dışa aktarılacak kayıt yok.');
    }

    const tableHead = report.headers.map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const tableBody = rows.map(row => `
        <tr>${reportRowValues(row).map(cell => `<td>${escapeHTML(cell)}</td>`).join('')}</tr>
    `).join('');
    const firmaAdi = getCompanyName();
    const exportDate = new Date().toLocaleDateString('tr-TR');
    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <style>
                .title { font-size: 18pt; font-weight: 700; color: #111827; }
                .meta { color: #4b5563; font-size: 10pt; }
                th { background: #e5e7eb; font-weight: 700; border: 1px solid #9ca3af; }
                td { border: 1px solid #d1d5db; }
                th, td { padding: 8px; mso-number-format: "\\@"; }
            </style>
        </head>
        <body>
            <table>
                <tr><td class="title" colspan="${report.headers.length}">${escapeHTML(report.title)}</td></tr>
                <tr><td class="meta" colspan="${report.headers.length}">Firma: ${escapeHTML(firmaAdi)}</td></tr>
                <tr><td class="meta" colspan="${report.headers.length}">Tarih: ${escapeHTML(exportDate)} | Kayıt Sayısı: ${rows.length}</td></tr>
                ${report.dateRangeLabel ? `<tr><td class="meta" colspan="${report.headers.length}">Tarih Aralığı: ${escapeHTML(report.dateRangeLabel)}</td></tr>` : ''}
                <tr><td colspan="${report.headers.length}"></td></tr>
            </table>
            <table>
                <thead><tr>${tableHead}</tr></thead>
                <tbody>${tableBody}</tbody>
            </table>
        </body>
        </html>
    `;
    const suffix = selectedOnly ? 'secilen' : 'tum';
    const fileName = `${report.title.toLowerCase().replace(/\s+/g, '-')}-${suffix}-${getReportDateSlug()}.xls`;
    downloadTextFile(fileName, `\uFEFF${html}`, 'application/vnd.ms-excel;charset=utf-8;');
}

window.exportListToCSV = function(type) {
    exportReportToExcel(type, false);
};

window.exportSelectedListToExcel = function(type) {
    exportReportToExcel(type, true);
};

function getCariStatementDate(line) {
    return line.faturaTarihi || line.tarih || '-';
}

function parseDateInputValue(value, endOfDay = false) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
}

function toDateInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getAccountPrintDateRange() {
    const startValue = document.getElementById('account-print-date-start')?.value || '';
    const endValue = document.getElementById('account-print-date-end')?.value || '';
    return {
        startValue,
        endValue,
        startDate: parseDateInputValue(startValue, false),
        endDate: parseDateInputValue(endValue, true)
    };
}

function formatDateRangeLabel(range) {
    if (!range?.startValue && !range?.endValue) return 'Tüm tarihler';
    const startLabel = range.startValue ? parseTRDate(range.startValue.split('-').reverse().join('.')).toLocaleDateString('tr-TR') : 'Başlangıç yok';
    const endLabel = range.endValue ? parseTRDate(range.endValue.split('-').reverse().join('.')).toLocaleDateString('tr-TR') : 'Bitiş yok';
    return `${startLabel} - ${endLabel}`;
}

function formatDateInputDisplay(value) {
    if (!value) return '';
    const date = parseDateInputValue(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR');
}

function refreshDateInputDisplay(root = document) {
    root.querySelectorAll('.account-date-input[type="date"]').forEach(input => {
        const field = input.closest('.account-date-field');
        if (!field) return;
        let trigger = field.querySelector('.account-date-display');
        if (!trigger) {
            trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'account-date-display';
            input.insertAdjacentElement('afterend', trigger);
            trigger.addEventListener('click', () => {
                try {
                    if (typeof input.showPicker === 'function') {
                        input.showPicker();
                    } else {
                        input.focus();
                        input.click();
                    }
                } catch (error) {
                    input.focus();
                    input.click();
                }
            });
        }
        const isEndDate = normalizeLookupText(field.querySelector(':scope > span')?.textContent).includes('bitiş');
        const label = isEndDate ? 'Bitiş tarihi' : 'Başlangıç tarihi';
        const display = formatDateInputDisplay(input.value);
        const visibleValue = display || 'GG.AA.YYYY';
        field.dataset.displayDate = visibleValue;
        trigger.innerHTML = `<span class="account-date-display-value">${visibleValue}</span><i class="fa-regular fa-calendar" aria-hidden="true"></i>`;
        trigger.setAttribute('aria-label', display
            ? `${label}: ${display}. Değiştirmek için takvimi aç`
            : `${label} seçmek için takvimi aç`);
        trigger.title = display ? `${label}: ${display}` : `${label} seç`;
        trigger.classList.toggle('date-empty', !display);
        field.classList.toggle('date-empty', !display);
        input.classList.toggle('date-empty', !display);
    });
}
window.refreshDateInputDisplay = refreshDateInputDisplay;

function updateFilterPanelIndicator(panel) {
    if (!panel) return;
    const dateInputs = [...panel.querySelectorAll('input[type="date"]')];
    const hasActiveFilter = dateInputs.some(input => !!input.value);
    const toggle = panel.querySelector('.filter-panel-toggle');
    const status = toggle?.querySelector('.filter-panel-toggle-status');
    panel.classList.toggle('has-active-filter', hasActiveFilter);
    if (status) status.textContent = hasActiveFilter ? 'Etkin' : 'Tümü';
}

function setFilterPanelExpanded(panel, expanded) {
    if (!panel) return;
    const toggle = panel.querySelector('.filter-panel-toggle');
    panel.classList.toggle('is-collapsed', !expanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        const label = toggle.querySelector('.filter-panel-toggle-label');
        if (label) label.textContent = expanded ? 'Filtreleri gizle' : 'Filtreler';
    }
}

window.toggleFilterPanel = function(button) {
    const panel = button?.closest('.filter-panel');
    if (!panel) return;
    setFilterPanelExpanded(panel, panel.classList.contains('is-collapsed'));
};

function enhanceFilterPanels() {
    document.querySelectorAll('.report-date-panel, .account-date-panel-main').forEach(panel => {
        if (panel.dataset.filterEnhanced === 'true') return;
        panel.dataset.filterEnhanced = 'true';
        panel.classList.add('filter-panel');

        const copy = panel.querySelector('.account-statement-copy');
        if (copy) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'filter-panel-toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('onclick', 'toggleFilterPanel(this)');
            toggle.innerHTML = '<i class="fa-solid fa-sliders" aria-hidden="true"></i><span class="filter-panel-toggle-label">Filtreler</span><span class="filter-panel-toggle-status">Tümü</span><i class="fa-solid fa-chevron-down filter-panel-chevron" aria-hidden="true"></i>';
            copy.appendChild(toggle);
        }

        panel.addEventListener('change', () => updateFilterPanelIndicator(panel));
        updateFilterPanelIndicator(panel);
        setFilterPanelExpanded(panel, false);
    });
}

function setQuoteSectionExpanded(section, expanded) {
    if (!section) return;
    section.classList.toggle('is-collapsed', !expanded);
    const button = section.querySelector('.quote-section-toggle');
    if (button) {
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        button.setAttribute('aria-label', expanded ? 'Bölümü daralt' : 'Bölümü aç');
    }
}

window.toggleQuoteSection = function(button) {
    const section = button?.closest('.quote-form-section');
    if (!section) return;
    setQuoteSectionExpanded(section, section.classList.contains('is-collapsed'));
};

function enhanceQuoteSections() {
    document.querySelectorAll('.quote-form-section').forEach((section, index) => {
        if (section.dataset.sectionEnhanced === 'true') return;
        section.dataset.sectionEnhanced = 'true';
        section.classList.add('is-collapsible');
        const heading = section.querySelector('.quote-section-heading');
        if (heading) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'quote-section-toggle';
            button.setAttribute('onclick', 'toggleQuoteSection(this)');
            button.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
            heading.appendChild(button);
        }
        setQuoteSectionExpanded(section, index === 0);
    });
}

window.toggleSecondaryPanel = function(button) {
    const panel = button?.closest('.secondary-data-panel');
    if (!panel) return;
    const willExpand = panel.classList.contains('is-collapsed');
    panel.classList.toggle('is-collapsed', !willExpand);
    button.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
    const label = button.querySelector('span');
    if (label) label.textContent = willExpand ? 'Gizle' : 'Göster';
};

function enhanceInnerPageActions() {
    document.querySelectorAll('.view:not(#view-dashboard) button').forEach(button => {
        const label = plainText(button.textContent).toLocaleLowerCase('tr-TR');
        if (label.includes('excel') || label.includes('yazdır')) button.classList.add('btn-secondary-action');
    });
    document.querySelectorAll('.view:not(#view-dashboard) .flex-between.mb-4').forEach(toolbar => {
        toolbar.classList.add('content-page-toolbar');
    });
    document.querySelectorAll('.selection-count').forEach(counter => {
        counter.classList.toggle('is-empty', plainText(counter.textContent) === 'Seçim yok');
    });
}

const INNER_PAGE_LAYOUTS = Object.freeze({
    quicksales: { category: 'Finans', title: 'Hızlı Satış', description: 'Peşin satışları müşteri kartı açmadan kaydedin, tahsilat ve stok hareketlerini birlikte takip edin.', context: 'Satış · Tahsilat · Stok', icon: 'fa-bolt', accent: '37, 99, 235' },
    quotation: {
        category: 'Operasyon',
        title: 'Teklif Merkezi',
        description: 'Müşteri, malzeme ve fiyat bilgilerini adım adım tamamlayıp iş emrine dönüştürün.',
        context: 'Hesapla · Kaydet · Onayla',
        icon: 'fa-file-invoice-dollar',
        accent: '255, 51, 102'
    },
    orders: {
        category: 'Operasyon',
        title: 'İş Emirleri',
        description: 'Onaylanan işleri üretimden teslimata kadar tek akışta izleyin.',
        context: 'Planla · Üret · Teslim et',
        icon: 'fa-clipboard-list',
        accent: '76, 201, 240'
    },
    accounts: {
        category: 'Finans',
        title: 'Cari Hesaplar',
        description: 'Müşteri ve tedarikçi bakiyelerini, vadeleri ve tahsilat geçmişini yönetin.',
        context: 'Bakiye · Tahsilat · Vade',
        icon: 'fa-users',
        accent: '6, 214, 160'
    },
    inventory: {
        category: 'Operasyon',
        title: 'Stok ve Malzeme',
        description: 'Fiziki stok, rezervasyon, kullanılabilir miktar ve hareketleri birlikte görün.',
        context: 'Stok · Rezervasyon · Hareket',
        icon: 'fa-boxes-stacked',
        accent: '255, 209, 102'
    },
    scraps: {
        category: 'Operasyon',
        title: 'Kalan Parça ve Hurda',
        description: 'Yeniden kullanılabilir parçaları ölçü, sahiplik ve tarih bilgisiyle takip edin.',
        context: 'Parça · Sahiplik · Ölçü',
        icon: 'fa-recycle',
        accent: '6, 214, 160'
    },
    expenses: {
        category: 'Finans',
        title: 'Gider Yönetimi',
        description: 'İşletme giderlerini kategorileri ve ödeme kaynaklarıyla kontrollü kaydedin.',
        context: 'Kategori · Ödeme · Takip',
        icon: 'fa-money-bill-wave',
        accent: '239, 71, 111'
    },
    collections: {
        category: 'Finans', title: 'Tahsilat Takibi', description: 'Açık faturaları vadesine göre izleyin; tahsilat girin veya hatırlatma hazırlayın.',
        context: 'Açık faturalar · Vade · Tahsilat', icon: 'fa-hand-holding-dollar', accent: '6, 214, 160'
    },
    accountcheck: {
        category: 'Raporlar', title: 'Hesap Kontrolü', description: 'Cari, fatura ve kasa kayıtlarının tutar ve bağlantılarını birlikte kontrol edin.',
        context: 'Cari · Fatura · Kasa', icon: 'fa-scale-balanced', accent: '76, 201, 240'
    },
    profitability: {
        category: 'Raporlar',
        title: 'İş Emri Kârlılığı',
        description: 'KDV hariç satış, doğrudan maliyet ve brüt kârı iş emri bazında karşılaştırın.',
        context: 'Net satış · Maliyet · Marj',
        icon: 'fa-chart-line',
        accent: '76, 201, 240'
    },
    cashbank: {
        category: 'Finans',
        title: 'Kasa ve Banka',
        description: 'Nakit ve banka hesaplarının bakiyesini, girişlerini ve çıkışlarını izleyin.',
        context: 'Hesap · Hareket · Mutabakat',
        icon: 'fa-building-columns',
        accent: '76, 201, 240'
    },
    personnel: {
        category: 'Yönetim',
        title: 'Personel ve Puantaj',
        description: 'Personel kartlarını, çalışma kayıtlarını ve maaş ödemelerini yönetin.',
        context: 'Personel · Puantaj · Maaş',
        icon: 'fa-user-clock',
        accent: '156, 125, 255'
    },
    audit: {
        category: 'Yönetim',
        title: 'Denetim Geçmişi',
        description: 'Oluşturma, düzenleme, durum değişikliği ve geri alma işlemlerini kronolojik olarak inceleyin.',
        context: 'Ara · Filtrele · Dışa aktar',
        icon: 'fa-clock-rotate-left',
        accent: '76, 201, 240'
    },
    cheques: {
        category: 'Finans',
        title: 'Çek ve Senet Takibi',
        description: 'Alınan ve verilen belgeleri vade, durum, cari ve kasa etkisiyle takip edin.',
        context: 'Belge · Vade · Tahsilat',
        icon: 'fa-money-check-dollar',
        accent: '255, 209, 102'
    },
    invoices: {
        category: 'Finans',
        title: 'Fatura Merkezi',
        description: 'Kesilen ve alınan faturaları ilgili cari ve iş emirleriyle birlikte yönetin.',
        context: 'Kesilen · Alınan · İş Emri',
        icon: 'fa-file-invoice',
        accent: '255, 51, 102'
    }
});

function enhanceTableHeaderScopes(root = document) {
    root.querySelectorAll('table.data-table thead th').forEach(th => {
        th.setAttribute('scope', 'col');
        th.classList.toggle('numeric-column', /tutar|bakiye|fiyat|maliyet|kâr|marj|miktar|maaş|ücret|ağırlık/i.test(th.textContent));
    });
}

const MODAL_PRESENTATION = Object.freeze({
    'modal-sheet-cut': { icon: 'fa-scissors', accent: '37, 99, 235', width: 860, subtitle: 'Kullanılan sacı ve yeniden kullanılacak parçaları birlikte kaydedin.' },
    'modal-quick-sale': { icon: 'fa-bolt', accent: '37, 99, 235', width: 700, subtitle: 'Tamamı ödenmiş satışlar için. İsim belirtmek zorunlu değil.' },
    'modal-ceksenet': { icon: 'fa-money-check-dollar', accent: '76, 201, 240', width: 700, subtitle: 'Belge, vade ve tahsilat bilgilerini tek kayıtta yönetin.' },
    'modal-fatura': { icon: 'fa-file-invoice', accent: '255, 51, 102', width: 620, subtitle: 'Faturayı ilgili cari ve varsa teslim edilmiş işle bağlayın.' },
    'modal-cari': { icon: 'fa-user-plus', accent: '6, 214, 160', width: 540, subtitle: 'Yeni müşteri veya tedarikçi hesabını hızlıca oluşturun.' },
    'modal-stok': { icon: 'fa-boxes-stacked', accent: '255, 209, 102', width: 760, subtitle: 'Malzeme sahipliği, ölçü ve miktar bilgilerini girin.' },
    'modal-stok-duzenle': { icon: 'fa-pen-to-square', accent: '255, 209, 102', width: 640, subtitle: 'Mevcut stok kartının temel bilgilerini güncelleyin.' },
    'modal-fire': { icon: 'fa-recycle', accent: '255, 159, 67', width: 640, subtitle: 'Kalan malzeme veya kullanılabilir parçayı kayıt altına alın.' },
    'modal-islem': { icon: 'fa-arrow-right-arrow-left', accent: '76, 201, 240', width: 680, subtitle: 'Cari, kasa ve belge etkisini tek işlemde yönetin.' },
    'modal-cari-detay': { icon: 'fa-address-card', accent: '6, 214, 160', width: 860, subtitle: 'Finansal hareketleri ve müşteriye ait malzemeleri inceleyin.' },
    'modal-cari-ekstre': { icon: 'fa-list-check', accent: '6, 214, 160', width: 980 },
    'modal-cari-duzenle': { icon: 'fa-user-pen', accent: '6, 214, 160', width: 540, subtitle: 'Cari kart bilgilerini ve aktiflik durumunu güncelleyin.' },
    'modal-gider': { icon: 'fa-receipt', accent: '239, 71, 111', width: 660, subtitle: 'Gideri sınıflandırın ve ödeme yapılan hesabı seçin.' },
    'modal-personel': { icon: 'fa-user-tie', accent: '156, 125, 255', width: 680, subtitle: 'Personel, görev ve ücret bilgilerini düzenleyin.' },
    'modal-puantaj': { icon: 'fa-calendar-check', accent: '156, 125, 255', width: 720, subtitle: 'Dönem, çalışma ve ödeme değerlerini birlikte hesaplayın.' },
    'modal-order-status': { icon: 'fa-list-check', accent: '76, 201, 240', width: 540, subtitle: 'İş emrinin üretim aşamasını kontrollü olarak güncelleyin.' },
    'modal-order-history': { icon: 'fa-clock-rotate-left', accent: '76, 201, 240', width: 720 },
    'modal-notifications': { icon: 'fa-bell', accent: '255, 209, 102', width: 560, subtitle: 'Bekleyen ve dikkat gerektiren işleri görüntüleyin.' },
    'modal-settlement': { icon: 'fa-hand-holding-dollar', accent: '6, 214, 160', width: 560, subtitle: 'Ödeme sözünü kapatın ve bağlı hesap etkisini uygulayın.' },
    'modal-payment-plan': { icon: 'fa-calendar-days', accent: '76, 201, 240', width: 600, subtitle: 'Tahsilat veya ödeme için tarih ve tutar planlayın.' },
    'modal-kasa-hesap': { icon: 'fa-building-columns', accent: '76, 201, 240', width: 560, subtitle: 'Yeni kasa veya banka hesabının açılış bilgilerini girin.' },
    'modal-kasa-hareket': { icon: 'fa-money-bill-transfer', accent: '76, 201, 240', width: 560, subtitle: 'Seçilen hesaba manuel para giriş veya çıkışı kaydedin.' },
    'modal-fatura-detail': { icon: 'fa-file-lines', accent: '255, 51, 102', width: 560 },
    'modal-quote-detail': { icon: 'fa-file-signature', accent: '255, 51, 102', width: 760 }
});

const modalReturnFocus = new WeakMap();
let modalOpenSequence = 0;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function getModalFormSnapshot(modal) {
    if (!modal) return '';
    return JSON.stringify([...modal.querySelectorAll('input, select, textarea')]
        .filter(control => !control.disabled && control.type !== 'file')
        .map(control => [control.id || control.name, control.type === 'checkbox' ? control.checked : control.value]));
}

function markModalFormClean(modalOrId) {
    const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
    if (!modal) return;
    modal.dataset.formSnapshot = getModalFormSnapshot(modal);
}

function isModalFormDirty(modal) {
    if (!modal?.querySelector('.modal-content.modal-form-shell') || !modal.dataset.formSnapshot) return false;
    const fileChanged = [...modal.querySelectorAll('input[type="file"]')].some(input => input.files?.length);
    return fileChanged || getModalFormSnapshot(modal) !== modal.dataset.formSnapshot;
}

function requestCloseModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!isModalFormDirty(modal)) {
        closeModal(id);
        return;
    }
    confirmAction('Bu pencerede kaydedilmemiş değişiklikler var. Değişiklikler silinerek pencere kapatılsın mı?', () => closeModal(id), {
        title: 'Kaydedilmemiş Değişiklikler',
        confirmLabel: 'Değişiklikleri Sil',
        cancelLabel: 'Düzenlemeye Dön'
    });
}
window.requestCloseModal = requestCloseModal;

function clearFieldError(controlOrId) {
    const control = typeof controlOrId === 'string' ? document.getElementById(controlOrId) : controlOrId;
    if (!control) return;
    const errorId = `${control.id || 'field'}-error`;
    document.getElementById(errorId)?.remove();
    control.removeAttribute('aria-invalid');
    if (control.getAttribute('aria-describedby') === errorId) control.removeAttribute('aria-describedby');
}

function setFieldError(controlOrId, message) {
    const control = typeof controlOrId === 'string' ? document.getElementById(controlOrId) : controlOrId;
    if (!control) return false;
    clearFieldError(control);
    const error = document.createElement('span');
    error.id = `${control.id || `field-${Date.now()}`}-error`;
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', error.id);
    (control.closest('.form-group') || control.parentElement)?.appendChild(error);
    return false;
}

function validateModalFields(modalId, rules = []) {
    const modal = document.getElementById(modalId);
    if (!modal) return false;
    modal.querySelector('.form-error-summary')?.remove();
    rules.forEach(rule => clearFieldError(rule.id));
    const invalid = [];
    rules.forEach(rule => {
        const control = document.getElementById(rule.id);
        const valid = control && rule.test(control.value, control);
        if (!valid) {
            setFieldError(control, rule.message);
            invalid.push({ control, message: rule.message });
        }
    });
    if (!invalid.length) return true;
    const summary = document.createElement('div');
    summary.className = 'form-error-summary';
    summary.setAttribute('role', 'alert');
    summary.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${invalid.length} alanı kontrol edip yeniden deneyin.</span>`;
    modal.querySelector('.modal-body')?.prepend(summary);
    invalid[0].control?.focus();
    invalid[0].control?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return false;
}
window.validateModalFields = validateModalFields;

function beginModalSubmit(modalId, loadingLabel = 'Kaydediliyor...') {
    const modal = document.getElementById(modalId);
    if (modal && !modal.querySelector('.modal-submit-action')) enhanceModalLayout(modal);
    const button = modal?.querySelector('.modal-submit-action');
    if (!button || button.dataset.submitting === 'true') return null;
    button.dataset.submitting = 'true';
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<i class="fa-solid fa-circle-notch" aria-hidden="true"></i> ${escapeHTML(loadingLabel)}`;
    return () => {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.innerHTML = button.dataset.originalHtml || 'Kaydet';
        delete button.dataset.originalHtml;
        delete button.dataset.submitting;
    };
}
window.beginModalSubmit = beginModalSubmit;

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
    return `${Math.ceil(bytes / 1024).toLocaleString('tr-TR')} KB`;
}

function renderFileInputSummary(input) {
    const summary = input?._fileSummary;
    if (!input || !summary) return;
    const file = input.files?.[0] || null;
    if (!file) {
        summary.hidden = true;
        summary.innerHTML = '';
        return;
    }
    summary.hidden = false;
    const preview = file.type?.startsWith('image/') ? `<img src="${URL.createObjectURL(file)}" alt="Seçilen dosya önizlemesi" style="width:36px;height:36px;object-fit:cover;border-radius:7px;">` : '<i class="fa-solid fa-file-lines" aria-hidden="true"></i>';
    summary.innerHTML = `<span style="display:flex;align-items:center;gap:8px;min-width:0;">${preview}<span><strong>${escapeHTML(file.name)}</strong><br>${formatFileSize(file.size)}</span></span><button type="button" aria-label="Seçilen dosyayı kaldır" title="Dosyayı kaldır"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>`;
    summary.querySelector('button')?.addEventListener('click', () => {
        input.value = '';
        renderFileInputSummary(input);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function enhanceFileInput(input) {
    if (!input || input.dataset.fileEnhanced === 'true') return;
    input.dataset.fileEnhanced = 'true';
    const summary = document.createElement('div');
    summary.className = 'file-input-summary';
    summary.hidden = true;
    input.insertAdjacentElement('afterend', summary);
    input._fileSummary = summary;
    input.addEventListener('change', () => {
        clearFieldError(input);
        const file = input.files?.[0];
        if (file && file.size > MAX_ATTACHMENT_SIZE) {
            input.value = '';
            setFieldError(input, 'Dosya en fazla 10 MB olabilir. Daha küçük bir belge seçin.');
        }
        renderFileInputSummary(input);
    });
}

function enhanceCurrencyInput(input) {
    if (!input || input.dataset.currencyEnhanced === 'true') return;
    const label = input.closest('.form-group')?.querySelector('label')?.textContent || '';
    if (!label.includes('₺')) return;
    input.dataset.currencyEnhanced = 'true';
    const preview = document.createElement('span');
    preview.className = 'currency-input-preview';
    input.insertAdjacentElement('afterend', preview);
    const update = () => {
        const value = input.dataset.turkishMoney==='true'?parseSheetPurchaseDocumentTotal(input.value):Number(input.value);
        preview.textContent = Number.isFinite(value) && input.value !== '' ? `Türkçe gösterim: ${formatCurrency(value)}` : '';
    };
    input.addEventListener('input', update);
    input.addEventListener('blur', update);
    update();
}

function getModalFocusables(modal) {
    return [...modal.querySelectorAll('button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.offsetParent !== null);
}

function enhanceModalLayout(modal) {
    const content = modal?.querySelector('.modal-content');
    if (!content) return;

    const meta = MODAL_PRESENTATION[modal.id] || { icon: 'fa-window-maximize', accent: '76, 201, 240', width: 620 };
    const specialLayout = content.matches('.settings-modal, .profitability-modal, .quote-detail-modal, .stat-detail-modal, .confirm-dialog');
    const header = content.querySelector(':scope > .modal-titlebar, :scope > .flex-between.mb-4');
    const title = header?.querySelector('h3');

    modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
    modal.setAttribute('aria-modal', 'true');
    content.style.setProperty('--modal-accent-rgb', 'var(--primary-rgb)');

    if (title) {
        if (!title.id) title.id = `${modal.id || 'modal'}-title`;
        modal.setAttribute('aria-labelledby', title.id);
    }

    content.querySelectorAll('.btn-close').forEach(button => {
        button.type = 'button';
        if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'Pencereyi kapat');
        if (!button.title) button.title = 'Kapat';
        if (button.dataset.safeClose !== 'true' && modal.id !== 'modal-confirm') {
            button.dataset.safeClose = 'true';
            button.removeAttribute('onclick');
            button.addEventListener('click', () => requestCloseModal(modal.id));
        }
    });

    content.querySelectorAll('.form-group .form-control').forEach(control => {
        const label = control.closest('.form-group')?.querySelector('label');
        if (label && control.id && !label.htmlFor) label.htmlFor = control.id;
    });

    if (specialLayout || !header) return;

    content.classList.add('modal-shell');
    if (content.querySelector('.form-control')) content.classList.add('modal-form-shell');
    content.style.setProperty('--modal-max-width', `${meta.width || 620}px`);
    header.classList.add('modal-titlebar');

    if (title && !header.querySelector(':scope > .modal-heading')) {
        const heading = document.createElement('div');
        heading.className = 'modal-heading';

        const icon = document.createElement('span');
        icon.className = 'modal-heading-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<i class="fa-solid ${meta.icon}"></i>`;

        let copy = title.parentElement !== header ? title.parentElement : null;
        if (copy) {
            header.insertBefore(heading, copy);
            heading.append(icon, copy);
        } else {
            copy = document.createElement('div');
            copy.className = 'modal-heading-copy';
            header.insertBefore(heading, title);
            heading.append(icon, copy);
            copy.appendChild(title);
        }
        copy.classList.add('modal-heading-copy');

        if (meta.subtitle && !copy.querySelector('.modal-subtitle')) {
            const subtitle = document.createElement('p');
            subtitle.className = 'modal-subtitle';
            subtitle.textContent = meta.subtitle;
            copy.appendChild(subtitle);
        }
    }

    let actions = content.querySelector(':scope > .modal-actions, :scope > form.modal-form-element > .modal-actions');
    if (!actions) {
        const primaryAction = [...content.children].reverse().find(child =>
            child.matches?.('button.btn') && !child.classList.contains('btn-close')
        );
        if (primaryAction) {
            actions = document.createElement('div');
            actions.className = 'modal-actions';
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'btn btn-outline modal-cancel-action';
            cancelButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Vazgeç';
            cancelButton.addEventListener('click', () => requestCloseModal(modal.id));
            primaryAction.classList.remove('w-100', 'mt-4');
            primaryAction.classList.add('modal-submit-action');
            actions.append(cancelButton, primaryAction);
            content.appendChild(actions);
        }
    }

    if (!content.querySelector(':scope > .modal-body, :scope > form.modal-form-element > .modal-body')) {
        const body = document.createElement('div');
        body.className = 'modal-body';
        if (content.classList.contains('modal-form-shell')) body.classList.add('modal-form-body');
        const bodyNodes = [...content.children].filter(child => child !== header && child !== actions);
        header.after(body);
        bodyNodes.forEach(child => body.appendChild(child));
    }

    const body = content.querySelector(':scope > .modal-body, :scope > form.modal-form-element > .modal-body');
    actions = content.querySelector(':scope > .modal-actions, :scope > form.modal-form-element > .modal-actions');
    if (content.classList.contains('modal-form-shell') && body && actions && !content.querySelector(':scope > form.modal-form-element')) {
        const form = document.createElement('form');
        form.className = 'modal-form-element';
        form.noValidate = true;
        content.insertBefore(form, body);
        form.append(body, actions);
        const primary = actions.querySelector('.modal-submit-action');
        if (primary) primary.type = 'button';
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!primary?.disabled) primary?.click();
        });
        form.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.shiftKey || event.target.matches('textarea, button')) return;
            event.preventDefault();
            form.requestSubmit();
        });
    }

    content.querySelectorAll('input[type="file"]').forEach(enhanceFileInput);
    content.querySelectorAll('input[type="number"]').forEach(enhanceCurrencyInput);
    content.querySelectorAll('.form-control').forEach(control => {
        if (control.dataset.inlineValidation === 'true') return;
        control.dataset.inlineValidation = 'true';
        control.addEventListener('input', () => clearFieldError(control));
        control.addEventListener('change', () => clearFieldError(control));
    });
}

function enhanceContentPageLayouts() {
    Object.entries(INNER_PAGE_LAYOUTS).forEach(([page, meta]) => {
        const view = document.getElementById(`view-${page}`);
        if (!view || view.dataset.pageLayoutEnhanced === 'true') return;
        view.dataset.pageLayoutEnhanced = 'true';
        view.style.setProperty('--page-accent-rgb', 'var(--primary-rgb)');

        const intro = document.createElement('section');
        intro.className = 'content-page-intro';
        intro.setAttribute('aria-labelledby', `content-page-title-${page}`);
        intro.innerHTML = `
            <div class="content-page-intro-icon" aria-hidden="true"><i class="fa-solid ${meta.icon}"></i></div>
            <div class="content-page-intro-copy">
                <span class="content-page-kicker">${meta.category}</span>
                <h1 id="content-page-title-${page}">${meta.title}</h1>
                <p>${meta.description}</p>
            </div>
            <span class="content-page-context"><i class="fa-solid fa-route" aria-hidden="true"></i>${meta.context}</span>
        `;
        view.prepend(intro);

        view.querySelectorAll('.glass-panel').forEach(panel => {
            panel.classList.add('content-surface');
            if (panel.querySelector('table.data-table')) {
                panel.classList.add('data-panel');
                panel.querySelector(':scope > .flex-between.mb-4, :scope > .content-page-toolbar')?.classList.add('workspace-panel-toolbar');
            }
        });
        view.querySelectorAll('.accounts-toolbar').forEach(toolbar => toolbar.classList.add('content-control-bar'));
        view.querySelectorAll('.profitability-filter-bar').forEach(toolbar => toolbar.classList.add('content-filter-bar'));

        const redundantHeading = view.querySelector(':scope > .profitability-heading, :scope > .flex-between.mb-4');
        if (redundantHeading?.querySelector('h2')) {
            redundantHeading.classList.add('content-page-action-strip');
            const headingCopy = redundantHeading.querySelector(':scope > div:first-child, :scope > h2');
            if (headingCopy) headingCopy.hidden = true;
        }

        view.querySelectorAll('table.data-table').forEach((table, index) => {
            enhanceTableHeaderScopes(table);
            if (table.closest('.table-scroll-shell')) return;
            const shell = document.createElement('div');
            shell.className = 'table-scroll-shell';
            shell.tabIndex = 0;
            shell.setAttribute('role', 'region');
            shell.setAttribute('aria-label', `${meta.title} veri tablosu${index ? ` ${index + 1}` : ''}`);
            table.parentNode.insertBefore(shell, table);
            shell.appendChild(table);
        });

        view.querySelectorAll('[id$="-page-info"]').forEach(info => {
            info.closest('.flex-between')?.classList.add('pagination-bar');
        });

        view.querySelectorAll('.form-control').forEach(control => {
            const group = control.closest('.form-group');
            const label = group?.querySelector('label');
            if (label && control.id && !label.htmlFor) label.htmlFor = control.id;
        });
    });

    enhanceHighVolumeListControls();
    document.querySelectorAll('.modal-overlay').forEach(enhanceModalLayout);
}

window.updateAccountDateRangeUI = function(activePreset = '') {
    const labelEl = document.getElementById('account-print-date-label');
    const range = getAccountPrintDateRange();
    if (labelEl) {
        labelEl.textContent = (!range.startValue && !range.endValue)
            ? 'Tüm tarihler yazdırılır.'
            : `Yazdırma aralığı: ${formatDateRangeLabel(range)}`;
    }
    document.querySelectorAll('.account-date-panel-main .account-date-preset').forEach(btn => {
        btn.classList.toggle('active', !!activePreset && btn.getAttribute('onclick')?.includes(`'${activePreset}'`));
    });
    refreshDateInputDisplay();
    updateFilterPanelIndicator(document.querySelector('.account-date-panel-main'));
};

window.clearAccountPrintDateRange = function() {
    const startEl = document.getElementById('account-print-date-start');
    const endEl = document.getElementById('account-print-date-end');
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';
    updateAccountDateRangeUI('all');
};

window.setAccountPrintDatePreset = function(preset) {
    if (preset === 'all') {
        clearAccountPrintDateRange();
        return;
    }

    const { start, end } = getDatePresetRange(preset);

    const startEl = document.getElementById('account-print-date-start');
    const endEl = document.getElementById('account-print-date-end');
    if (startEl) startEl.value = toDateInputValue(start);
    if (endEl) endEl.value = toDateInputValue(end);
    updateAccountDateRangeUI(preset);
};

function isDateInRange(dateValue, range) {
    if (!range?.startDate && !range?.endDate) return true;
    const date = parseTRDate(dateValue);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return true;
    if (range.startDate && date < range.startDate) return false;
    if (range.endDate && date > range.endDate) return false;
    return true;
}

function formatPercentLabel(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return `%${number.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

function getOrderStatementAmounts(order) {
    const total = roundMoney(order.total || 0);
    const discountPercent = Number.isFinite(Number(order.discountPercent)) ? Number(order.discountPercent) : 0;
    const discountAmount = roundMoney(order.discountAmount || 0);
    const taxRate = Number.isFinite(Number(order.taxRate)) ? Number(order.taxRate) : null;
    const tax = roundMoney(order.tax || 0);

    let subTotal = Number.isFinite(Number(order.subTotal)) ? roundMoney(order.subTotal) : null;
    if (subTotal === null) {
        subTotal = tax > 0 ? roundMoney(total - tax) : total;
    }

    const gross = Number.isFinite(Number(order.subTotalBeforeDiscount))
        ? roundMoney(order.subTotalBeforeDiscount)
        : roundMoney(subTotal + discountAmount);

    return { gross, discountPercent, discountAmount, subTotal, taxRate, tax, total };
}

function getCariStatementLines(cari) {
    const matchesCari = item => cariRecordMatches(item, cari);

    const orderLines = getDBArray('isEmirleri')
        .filter(order =>
            matchesCari(order) &&
            Number(order.total || 0) > 0 &&
            order.durum !== 'İptal' &&
            (order.durum === 'Teslim Edildi' || order.bakiyeCariyeYansitildi === true || order.faturaKesildi === true)
        )
        .map(order => {
            const amounts = getOrderStatementAmounts(order);
            return {
                source: 'order',
                sourceId: order.id,
                id: `order-${order.id}`,
                tarih: order.faturaTarihi || order.tarih || '-',
                belge: order.faturaNo ? `Fatura ${order.faturaNo}` : (order.orderNo || 'İş Emri'),
                faturaNo: order.faturaNo || '',
                orderNo: order.orderNo || '',
                aciklama: order.description || (order.islemTipi === 'hammadde' ? `${order.kgAmount || 0} KG hammadde satışı` : 'Teslim edilen iş'),
                ...amounts
            };
        });

    const linkedOrderIds = new Set(orderLines
        .map(line => String(line.id).replace('order-', ''))
        .filter(Boolean));

    const invoiceLines = getDBArray('faturalar')
        .filter(fatura =>
            fatura.tur === 'kesilen' &&
            matchesCari(fatura) &&
            !(fatura.orderId && linkedOrderIds.has(String(fatura.orderId)))
        )
        .map(fatura => {
            const total = roundMoney(fatura.tutar || 0);
            return {
                source: 'invoice',
                sourceId: fatura.id,
                id: `invoice-${fatura.id}`,
                tarih: fatura.tarih || '-',
                belge: fatura.faturaNo ? `Fatura ${fatura.faturaNo}` : 'Kesilen Fatura',
                faturaNo: fatura.faturaNo || '',
                orderNo: fatura.orderNo || '',
                aciklama: fatura.aciklama || 'Kesilen fatura',
                gross: total,
                discountPercent: null,
                discountAmount: 0,
                subTotal: total,
                taxRate: null,
                tax: 0,
                total
            };
        });

    return [...orderLines, ...invoiceLines].sort((a, b) => {
        const dateDiff = parseTRDate(getCariStatementDate(a)) - parseTRDate(getCariStatementDate(b));
        if (dateDiff !== 0) return dateDiff;
        return String(a.belge).localeCompare(String(b.belge), 'tr');
    });
}

function getCariCollectionTotal(cari) {
    return getCariMovementLines(cari, [])
        .filter(movement => movement.delta < 0)
        .reduce((total, collection) => total + roundMoney(collection.tutar || 0), 0);
}

function getCariMovementLines(cari, saleLines = []) {
    const saleOrderIds = new Set(saleLines
        .filter(line => line.source === 'order')
        .map(line => String(line.sourceId)));
    const saleInvoiceIds = new Set(saleLines
        .filter(line => line.source === 'invoice')
        .map(line => String(line.sourceId)));

    const cariMovements = getDBArray('islemler')
        .filter(islem => cariRecordMatches(islem, cari));
    // Keep cancellation history in the records, but omit verified, fully offset
    // invoice pairs from the customer statement. Support older unlinked entries.
    const cancelledIds = new Set();
    const activeInvoiceIds = new Set(getDBArray('faturalar').map(invoice => String(invoice.id)));
    for (const cancellation of cariMovements) {
        if (!normalizeLookupText(cancellation.tip).startsWith('fatura silindi') ||
            !cancellation.faturaId || activeInvoiceIds.has(String(cancellation.faturaId))) continue;
        const originals = cariMovements.filter(movement => {
            const type = normalizeLookupText(movement.tip);
            const isInvoice = type.startsWith('kesilen fatura') || type.startsWith('alınan fatura') || type.startsWith('fatura kesildi');
            return isInvoice && (String(movement.id) === String(cancellation.reversalOf) ||
                (movement.faturaId != null ? String(movement.faturaId) === String(cancellation.faturaId) :
                    !!cancellation.faturaNo && movement.faturaNo === cancellation.faturaNo));
        });
        if (originals.length !== 1) continue;
        const original = originals[0];
        if (cancelledIds.has(String(original.id))) continue;
        if (typeof original.bakiyeDegisimi !== 'number' || typeof cancellation.bakiyeDegisimi !== 'number' ||
            roundMoney(original.bakiyeDegisimi + cancellation.bakiyeDegisimi) !== 0) continue;
        cancelledIds.add(String(original.id));
        cancelledIds.add(String(cancellation.id));
    }

    return cariMovements
        .filter(islem => !cancelledIds.has(String(islem.id)))
        .filter(islem => {
            const tip = normalizeLookupText(islem.tip);
            const isCollection = islem.isGelir === true || tip.includes('tahsilat');
            if (isCollection) return true;
            if (islem.orderId && saleOrderIds.has(String(islem.orderId))) return false;
            if (islem.faturaId && saleInvoiceIds.has(String(islem.faturaId))) return false;
            if (tip.includes('fatura kesildi') || tip.includes('kesilen fatura')) return false;
            if (tip.includes('iş emri borçlandırma')) return false;
            return true;
        })
        .map(islem => ({
            id: islem.id,
            tarih: islem.tarih || '-',
            tip: islem.tip || 'Cari İşlem',
            aciklama: islem.aciklama || islem.tip || 'Cari işlem',
            movementNo: islem.movementNo || '',
            quickSaleNo: islem.quickSaleNo || '',
            faturaNo: islem.faturaNo || '',
            orderNo: islem.orderNo || '',
            tutar: roundMoney(islem.tutar || 0),
            delta: Number.isFinite(Number(islem.bakiyeDegisimi))
                ? roundMoney(islem.bakiyeDegisimi)
                : roundMoney((islem.isGelir === true || normalizeLookupText(islem.tip).includes('tahsilat')) ? -(islem.tutar || 0) : (islem.tutar || 0))
        }))
        .filter(islem => islem.delta !== 0)
        .sort((a, b) => {
            const dateDiff = parseTRDate(a.tarih) - parseTRDate(b.tarih);
            if (dateDiff !== 0) return dateDiff;
            return String(a.id || '').localeCompare(String(b.id || ''), 'tr');
        });
}

function getCariLedgerLines(cari, saleLines, currentBalance, dateRange = null) {
    const movementLines = getCariMovementLines(cari, saleLines);
    const allLedgerLines = [
        ...saleLines.map(line => ({
            id: line.id,
            code: line.quickSaleNo || line.faturaNo || line.orderNo || `SAT-${String(line.sourceId || '').slice(-6) || 'KAYIT'}`,
            date: getCariStatementDate(line),
            type: 'Satış',
            description: line.aciklama || 'Satış',
            debit: roundMoney(line.total || 0),
            credit: 0,
            delta: roundMoney(line.total || 0),
            discountPercent: line.discountPercent,
            discountAmount: line.discountAmount,
            taxRate: line.taxRate,
            tax: line.tax
        })),
        ...movementLines.map(line => {
            const isCredit = line.delta < 0;
            return {
                id: `movement-${line.id}`,
                code: line.quickSaleNo || line.faturaNo || line.orderNo || line.movementNo || `HRK-${String(line.id || '').slice(-6) || 'KAYIT'}`,
                date: line.tarih || '-',
                type: isCredit ? 'Tahsilat / Ödeme' : 'Cari Borç',
                description: line.aciklama || line.tip || 'Cari işlem',
                debit: isCredit ? 0 : Math.abs(roundMoney(line.delta || line.tutar || 0)),
                credit: isCredit ? Math.abs(roundMoney(line.delta || line.tutar || 0)) : 0,
                delta: roundMoney(line.delta || 0),
                discountPercent: null,
                discountAmount: 0,
                taxRate: null,
                tax: 0
            };
        })
    ].sort((a, b) => {
        const dateDiff = parseTRDate(a.date) - parseTRDate(b.date);
        if (dateDiff !== 0) return dateDiff;
        return String(a.id || '').localeCompare(String(b.id || ''), 'tr');
    });

    const ledgerDelta = roundMoney(allLedgerLines.reduce((sum, line) => sum + roundMoney(line.delta || 0), 0));
    const openingBalance = roundMoney((currentBalance || 0) - ledgerDelta);
    const priorDelta = roundMoney(allLedgerLines
        .filter(line => dateRange?.startDate && parseTRDate(line.date) < dateRange.startDate)
        .reduce((sum, line) => sum + roundMoney(line.delta || 0), 0));
    const visibleOpeningBalance = roundMoney(openingBalance + priorDelta);
    const selectedLines = allLedgerLines.filter(line => isDateInRange(line.date, dateRange));
    const allById = new Map(allLedgerLines.map(line => [String(line.id), line]));
    const movementsById = new Map(getDBArray('islemler').map(item => [String(item.id), item]));
    const hiddenIds = new Set();
    const replacements = new Map();
    const parents = new Map();
    const rootOf = id => {
        if (!parents.has(id)) parents.set(id, id);
        if (parents.get(id) !== id) parents.set(id, rootOf(parents.get(id)));
        return parents.get(id);
    };
    const join = (left, right) => parents.set(rootOf(right), rootOf(left));
    // Join only reciprocal, amount-offsetting audit links. A later correction
    // can itself be corrected, so project the whole chain for the print period.
    for (const original of movementsById.values()) {
        if (original.reversedBy == null) continue;
        const reversal = movementsById.get(String(original.reversedBy));
        if (!reversal || String(reversal.reversalOf) !== String(original.id)) continue;
        const originalLine = allById.get(`movement-${original.id}`);
        const reversalLine = allById.get(`movement-${reversal.id}`);
        if (!originalLine || !reversalLine || roundMoney(originalLine.delta + reversalLine.delta) !== 0) continue;
        join(String(originalLine.id), String(reversalLine.id));
        const corrected = movementsById.get(String(original.correctedBy));
        const correctedLine = corrected && allById.get(`movement-${corrected.id}`);
        if (correctedLine && corrected.correctionOf != null &&
            String(corrected.correctionOf) === String(original.id) &&
            String(reversal.correctedBy) === String(corrected.id)) join(String(originalLine.id), String(correctedLine.id));
    }
    const selectedGroups = new Map();
    for (const line of selectedLines) {
        if (!parents.has(String(line.id))) continue;
        const root = rootOf(String(line.id));
        if (!selectedGroups.has(root)) selectedGroups.set(root, []);
        selectedGroups.get(root).push(line);
    }
    for (const group of selectedGroups.values()) {
        if (group.length < 2) continue;
        const delta = roundMoney(group.reduce((sum, line) => sum + line.delta, 0));
        group.forEach(line => hiddenIds.add(String(line.id)));
        if (delta === 0) continue;
        const anchor = [...group].reverse().find(line => !movementsById.get(String(line.id).slice(9))?.reversalOf) || group[group.length - 1];
        const startsInRange = group.some(line => {
            const movement = movementsById.get(String(line.id).slice(9));
            return movement && !movement.reversalOf && !movement.correctionOf;
        });
        hiddenIds.delete(String(anchor.id));
        replacements.set(String(anchor.id), {
            ...anchor,
            description: startsInRange ? anchor.description : 'Tahsilat / ödeme düzeltmesi',
            type: startsInRange ? anchor.type : 'Düzeltme',
            debit: delta > 0 ? delta : 0,
            credit: delta < 0 ? Math.abs(delta) : 0,
            delta
        });
    }
    let ledgerLines = selectedLines.filter(line => !hiddenIds.has(String(line.id)))
        .map(line => replacements.get(String(line.id)) || line);
    const selectedDelta = roundMoney(selectedLines.reduce((sum, line) => sum + line.delta, 0));
    const projectedDelta = roundMoney(ledgerLines.reduce((sum, line) => sum + line.delta, 0));
    if (selectedDelta !== projectedDelta) ledgerLines = selectedLines;

    if (Math.abs(visibleOpeningBalance) >= 0.01) {
        ledgerLines.unshift({
            id: 'opening-balance',
            code: 'DEVİR',
            date: '-',
            type: 'Devir',
            description: dateRange?.startValue ? 'Seçilen tarih öncesi bakiye' : 'Devir Bakiyesi',
            debit: visibleOpeningBalance > 0 ? visibleOpeningBalance : 0,
            credit: visibleOpeningBalance < 0 ? Math.abs(visibleOpeningBalance) : 0,
            delta: visibleOpeningBalance,
            discountPercent: null,
            discountAmount: 0,
            taxRate: null,
            tax: 0
        });
    }

    let runningBalance = 0;
    return ledgerLines.map(line => {
        runningBalance = roundMoney(runningBalance + roundMoney(line.delta || 0));
        return { ...line, balance: runningBalance };
    });
}

function printAccountStatement(cariId) {
    const cari = getDBArray('cariler').find(c => String(c.id) === String(cariId));
    if (!cari) return alert('Yazdırılacak cari kayıt bulunamadı.');

    const dateRange = getAccountPrintDateRange();
    if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) {
        return alert('Başlangıç tarihi bitiş tarihinden büyük olamaz.');
    }
    const allLines = getCariStatementLines(cari);
    const remainingBalance = roundMoney(cari.bakiye || 0);
    const ledgerLines = getCariLedgerLines(cari, allLines, remainingBalance, dateRange);
    const periodClosingBalance = roundMoney(ledgerLines.length ? (ledgerLines[ledgerLines.length - 1].balance || 0) : 0);
    const totalCollection = roundMoney(ledgerLines
        .reduce((total, line) => total + roundMoney(line.credit || 0), 0));
    const totalDebt = roundMoney(ledgerLines
        .reduce((total, line) => total + roundMoney(line.debit || 0), 0));
    const emptyRow = `
        <tr>
            <td colspan="6" class="statement-empty">Bu cari için yazdırılacak hareket bulunamadı.</td>
        </tr>
    `;
    const ledgerRows = ledgerLines.map(line => {
        const detailParts = [
            line.type,
            line.taxRate === null ? '' : `KDV ${formatPercentLabel(line.taxRate)}`,
            line.discountAmount ? `İskonto ${formatPercentLabel(line.discountPercent)} (-${formatCurrency(line.discountAmount)})` : ''
        ].filter(Boolean);
        return `
        <tr class="${line.id === 'opening-balance' ? 'statement-opening' : ''}">
            <td class="statement-code"><strong>${escapeHTML(line.code || '-')}</strong></td>
            <td class="statement-date">${escapeHTML(line.date || '-')}</td>
            <td>
                <strong class="statement-description-title">${escapeHTML(line.description || line.type || '-')}</strong>
                <div class="statement-description-meta">${detailParts.map(part => `<span>${escapeHTML(part)}</span>`).join('<i aria-hidden="true">·</i>')}</div>
            </td>
            <td class="number-cell">${line.debit ? escapeHTML(formatCurrency(line.debit)) : '—'}</td>
            <td class="number-cell">${line.credit ? escapeHTML(formatCurrency(line.credit)) : '—'}</td>
            <td class="number-cell statement-balance"><strong>${escapeHTML(formatCurrency(line.balance || 0))}</strong></td>
        </tr>
    `;
    }).join('');

    const contentHTML = `
        ${getPrintBrandHTML('Cari Hesap Ekstresi', getPrintMetaHTML([
            ['Düzenleme', new Date().toLocaleDateString('tr-TR')],
            ['Aralık', formatDateRangeLabel(dateRange)]
        ]))}
        ${getPrintPartyHTML('Hesap Sahibi', cari.adi, cari)}
        <div class="section-heading">
            <h2>Hesap Hareketleri</h2>
            <span>${ledgerLines.length} hareket · TL</span>
        </div>
        <table class="statement-table" aria-label="Cari hesap hareketleri">
            <thead>
                <tr>
                    <th scope="col">İşlem Kodu</th>
                    <th scope="col">Tarih</th>
                    <th scope="col">Açıklama</th>
                    <th scope="col" class="text-right">Borç (TL)</th>
                    <th scope="col" class="text-right">TAHSİLAT</th>
                    <th scope="col" class="text-right">Bakiye (TL)</th>
                </tr>
            </thead>
            <tbody>${ledgerLines.length ? ledgerRows : emptyRow}</tbody>
            <tbody class="statement-totals">
                <tr>
                    <th scope="row" colspan="3">GENEL TOPLAM (DEVİR DAHİL)</th>
                    <td class="number-cell">${escapeHTML(formatCurrency(totalDebt))}</td>
                    <td class="number-cell">${escapeHTML(formatCurrency(totalCollection))}</td>
                    <td class="number-cell">${escapeHTML(formatCurrency(periodClosingBalance))}</td>
                </tr>
            </tbody>
        </table>
    `;

    openPrintPreview('Cari Hesap Ekstresi', contentHTML, `
        .brand-header { margin-bottom: 16px; }
        .document-intro-grid { gap: 18px; margin-bottom: 14px; }
        .metric-item { background: #fff; padding: 8px 10px; }
        .metric-item.is-accent { background: var(--surface-blue); }
        .metric-item.is-accent .metric-label { color: var(--ink-soft); }
        .metric-item.is-accent .metric-value { color: var(--primary); }
        .statement-table { table-layout: fixed; border: 1px solid var(--line-strong); font-size: 9px; }
        .statement-table th:nth-child(1) { width: 14%; }
        .statement-table th:nth-child(2) { width: 17%; }
        .statement-table th:nth-child(3) { width: 27%; }
        .statement-table th:nth-child(4),
        .statement-table th:nth-child(5),
        .statement-table th:nth-child(6) { width: 14%; }
        .statement-table th, .statement-table td { border: 1px solid var(--line-strong); padding: 7px 6px; vertical-align: middle; }
        .statement-table thead th { background: #edf1f5; color: var(--ink); font-size: 8px; letter-spacing: 0; }
        .statement-table .number-cell { font-variant-numeric: tabular-nums; }
        .statement-code { color: var(--ink-soft); font-size: 8px; overflow-wrap: anywhere; }
        .statement-date { white-space: normal; font-size: 8.5px; }
        .statement-description-title { display: block; color: var(--ink); font-size: 9px; font-weight: 400; line-height: 1.4; overflow-wrap: anywhere; }
        .statement-description-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 5px; margin-top: 3px; color: var(--ink-soft); font-size: 7.5px; line-height: 1.4; }
        .statement-description-meta i { font-style: normal; }
        .statement-balance { color: var(--ink); background: #f3f6fa; }
        .statement-opening td { background: #edf1f5 !important; font-weight: 700; }
        .statement-empty { text-align: center; color: var(--muted); padding: 24px; }
        .statement-totals { break-inside: avoid; page-break-inside: avoid; }
        .statement-totals th, .statement-totals td { background: #e8eef5 !important; color: var(--ink); border-top: 2px solid var(--primary); font-size: 9px; font-weight: 700; }
        .statement-totals th { text-align: right; letter-spacing: 0; }

    `, {
        orientation: 'portrait',
        paymentFooter: true,
        share: {
            phone: cari.tel || cari.telefon || '',
            customerName: cari.adi || '',
            documentNo: cari.kodu || ''
        }
    });
}

function printOrderStatement(orderId) {
    const order = getDBArray('isEmirleri').find(o => String(o.id) === String(orderId));
    if (!order) return alert('Yazdırılacak iş emri bulunamadı.');

    const amounts = getOrderStatementAmounts(order);
    const orderDate = order.faturaTarihi || order.tarih || new Date().toLocaleDateString('tr-TR');
    const customerCari = findCariByReference(order.customerId, order.customerName);
    const customerName = order.customerName || customerCari?.adi || '-';
    const description = order.description || (order.islemTipi === 'hammadde' ? `${order.kgAmount || 0} KG hammadde satışı` : 'Teslim edilen iş');

    const contentHTML = `
        ${getPrintBrandHTML('İş Emri Dökümü', getPrintMetaHTML([
            ['İş Emri No', order.orderNo], ['Tarih', orderDate], ['Durum', order.durum]
        ]))}
        ${getPrintPartyHTML('Müşteri', customerName, customerCari)}
        ${getPrintServiceLineHTML(description, amounts.gross)}
        <div class="document-footer-grid">${getPrintTotalsHTML(amounts, 'İş emri tutar özeti')}</div>
    `;

    openPrintPreview('İş Emri Dökümü', contentHTML, '', {
        paymentFooter: true,
        share: {
            phone: customerCari?.tel || customerCari?.telefon || '',
            customerName,
            documentNo: order.orderNo || ''
        }
    });
}

// Read saved invoice amounts consistently, including zero-rate and older records.
function getSavedInvoiceAmounts(invoice, linkedOrder = null) {
    const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const total = roundMoney(number(invoice.tutar) ?? 0);
    const compatibleOrder = linkedOrder && roundMoney(linkedOrder.total) === total ? linkedOrder : null;
    const storedTax = number(invoice.kdvTutari) ?? number(compatibleOrder?.tax);
    const storedBase = number(invoice.matrah) ?? number(compatibleOrder?.subTotal) ?? (storedTax !== null ? total - storedTax : null);
    const inferredRate = storedBase > 0 ? roundMoney(((storedTax ?? (total - storedBase)) / storedBase) * 100) : null;
    const rate = number(invoice.kdvOrani) ?? number(compatibleOrder?.taxRate) ?? inferredRate ?? 20;
    const subTotal = roundMoney(number(invoice.matrah) ?? number(compatibleOrder?.subTotal) ?? (storedTax !== null ? total - storedTax : total / (1 + rate / 100)));
    const tax = roundMoney(storedTax ?? (total - subTotal));
    const discountAmount = roundMoney(number(invoice.discountAmount) ?? number(compatibleOrder?.discountAmount) ?? 0);
    return { total, subTotal, tax, taxRate: rate, discountAmount,
        discountPercent: number(invoice.discountPercent) ?? number(compatibleOrder?.discountPercent),
        gross: roundMoney(subTotal + discountAmount) };
}

function createInvoiceDocumentSnapshot(invoice, order, cari, issuer) {
    return {
        version: 1,
        line: { ...getSavedInvoiceAmounts(invoice, order), description: invoice.aciklama || order?.description || 'Fatura kalemi', orderNo: invoice.orderNo || order?.orderNo || '' },
        customer: { adi: invoice.firma || cari?.adi || '', kodu: cari?.kodu || '', tel: cari?.tel || cari?.telefon || '', adres: cari?.adres || '', vergiDairesi: cari?.vergiDairesi || '', vergiNo: invoice.vergiNo || cari?.vergiNo || '' },
        issuer: { firmaAdi: issuer?.firmaAdi || 'AK LAZER Fiber Lazer Kesimleri', telefon: issuer?.telefon || '', adres: issuer?.adres || '' }
    };
}

function initializeInvoiceDocuments(database) {
    for (const invoice of database.faturalar || []) {
        if (invoice.documentSnapshot?.version === 1) continue;
        const order = (database.isEmirleri || []).find(item => String(item.id) === String(invoice.orderId));
        const cari = (database.cariler || []).find(item => invoice.cariId != null ? String(item.id) === String(invoice.cariId) : item.adi === invoice.firma);
        invoice.documentSnapshot = createInvoiceDocumentSnapshot(invoice, order, cari, database.ayarlar);
    }
}

function invoiceMatchesCari(invoice, cariId, name = '', database = db) {
    if (invoice?.cariId != null && String(invoice.cariId).trim() !== '' &&
        cariId != null && String(cariId).trim() !== '') {
        return String(invoice.cariId) === String(cariId);
    }
    const invoiceCari = findCariByReference(invoice?.cariId, invoice?.firma, database);
    const candidateCari = findCariByReference(cariId, name, database);
    return !!invoiceCari && !!candidateCari && String(invoiceCari.id) === String(candidateCari.id);
}

function getInvoicePaymentMovements(invoice, database = db) {
    const invoicesForOrder = invoice.orderId == null ? [] : (database.faturalar || []).filter(item => item.tur === invoice.tur && String(item.orderId) === String(invoice.orderId) && invoiceMatchesCari(item, invoice.cariId, invoice.firma, database));
    return (database.islemler || []).filter(movement => {
        if (movement.reversalOf || !invoiceMatchesCari(invoice, movement.cariId, movement.firma, database)) return false;
        const type = getCariMovementFormType(movement);
        if (invoice.tur === 'kesilen' ? type !== 'tahsilat' : type !== 'odeme_yaptik') return false;
        if (movement.paymentInvoiceId != null) return String(movement.paymentInvoiceId) === String(invoice.id);
        return invoicesForOrder.length === 1 && movement.orderId != null && String(movement.orderId) === String(invoice.orderId);
    });
}

function getInvoicePaymentSummary(invoice, excludeMovementId = '', database = db) {
    const total = roundMoney(invoice.tutar || 0);
    const movements = getInvoicePaymentMovements(invoice, database);
    const active = movements.filter(item => !item.reversedBy && String(item.id) !== String(excludeMovementId));
    const linkedPaid = roundMoney(active.reduce((sum, item) => sum + (Number(item.tutar) || 0), 0));
    const legacy = invoice.paymentTrackingVersion !== 1 && ['odendi', 'kismi'].includes(invoice.odemeDurumu);
    if (legacy) {
        return { status: invoice.odemeDurumu, paid: invoice.odemeDurumu === 'odendi' ? total : null,
            remaining: invoice.odemeDurumu === 'odendi' ? 0 : null, linkedPaid, legacy: true, movements: active };
    }
    const paid = roundMoney((Number(invoice.paymentOpeningAmount) || 0) + linkedPaid);
    const remaining = roundMoney(Math.max(total - paid, 0));
    return { status: remaining === 0 ? 'odendi' : paid > 0 ? 'kismi' : 'odenmedi', paid, remaining, linkedPaid, legacy: false, movements: active };
}

function getInvoicePaymentLabel(invoice) {
    const summary = getInvoicePaymentSummary(invoice);
    return summary.status === 'odendi' ? 'Ödendi' : summary.status === 'kismi' ? 'Kısmi Ödendi' : 'Ödenmedi';
}

function syncInvoicePaymentStates(database) {
    for (const invoice of database.faturalar || []) {
        if (invoice.paymentTrackingVersion !== 1 && !['odendi', 'kismi'].includes(invoice.odemeDurumu) && getInvoicePaymentMovements(invoice, database).length) invoice.paymentTrackingVersion = 1;
        if (invoice.paymentTrackingVersion === 1) invoice.odemeDurumu = getInvoicePaymentSummary(invoice, '', database).status;
    }
}

function getSelectedPaymentInvoice() {
    const id = document.getElementById('input-islem-payment-invoice-id')?.value;
    return id ? getDBArray('faturalar').find(invoice => String(invoice.id) === String(id)) || null : null;
}

function renderPaymentInvoiceOptions() {
    const select = document.getElementById('input-islem-payment-invoice-id');
    const container = document.getElementById('payment-invoice-container');
    if (!select || !container) return;
    const type = document.getElementById('input-islem-tipi')?.value;
    const isPayment = type === 'tahsilat' || type === 'odeme_yaptik';
    container.hidden = !isPayment;
    if (!isPayment) { select.value = ''; return; }
    const cari = getCurrentIslemCari();
    const previous = select.value;
    const editId = document.getElementById('input-islem-edit-id')?.value || '';
    const orderId = document.getElementById('input-islem-payment-order-id')?.value;
    const invoices = getDBArray('faturalar').filter(invoice => invoiceMatchesCari(invoice, cari?.id, cari?.adi) && invoice.tur === (type === 'tahsilat' ? 'kesilen' : 'alinan'));
    select.innerHTML = '<option value="">Cari hesabına işle — fatura seçilmedi</option>' + invoices.map(invoice => {
        const summary = getInvoicePaymentSummary(invoice, editId);
        const suffix = summary.remaining === null ? 'Ödeme geçmişi tamamlanmalı' : `Kalan ${formatCurrency(summary.remaining)}`;
        const disabled = summary.legacy || summary.remaining === 0;
        return `<option value="${escapeHTML(invoice.id)}"${disabled ? ' disabled' : ''}>${escapeHTML(invoice.faturaNo)} · ${escapeHTML(suffix)}</option>`;
    }).join('');
    if (invoices.some(invoice => String(invoice.id) === previous)) select.value = previous;
    else if (orderId) {
        const linked = invoices.filter(invoice => String(invoice.orderId) === String(orderId));
        if (linked.length === 1) select.value = String(linked[0].id);
    }
    updatePaymentInvoiceSummary();
}

window.selectPaymentInvoice = function() {
    const invoice = getSelectedPaymentInvoice();
    document.getElementById('input-islem-payment-order-id').value = invoice?.orderId || '';
    updatePaymentInvoiceSummary();
};

window.updatePaymentInvoiceSummary = function() {
    const invoice = getSelectedPaymentInvoice();
    const hint = document.getElementById('payment-invoice-summary');
    if (hint) {
        const remaining = invoice ? getInvoicePaymentSummary(invoice, document.getElementById('input-islem-edit-id')?.value).remaining : null;
        hint.textContent = invoice ? `${invoice.faturaNo} · Kalan: ${remaining === null ? 'Ödeme geçmişi tamamlanmalı' : formatCurrency(remaining)}` : 'Fatura seçerseniz ödeme durumu ve kalan tutar birlikte güncellenir.';
    }
    updateTahsilatSummary();
};

window.openInvoicePayment = function(id) {
    const invoice = getDBArray('faturalar').find(item => String(item.id) === String(id));
    const cari = invoice ? findCariByReference(invoice.cariId, invoice.firma) : null;
    if (!invoice || !cari) return alert('Fatura veya cari bulunamadı.');
    const summary = getInvoicePaymentSummary(invoice);
    if (summary.legacy) return showToast({ type: 'info', message: 'Önce fatura detayındaki ödeme geçmişini tamamlayın.' });
    if (summary.remaining <= 0) return showToast({ type: 'info', message: 'Bu faturanın ödemesi tamamlanmış.' });
    closeModal('modal-fatura-detail');
    openIslemModal(cari.id, cari.adi);
    document.getElementById('input-islem-tipi').value = invoice.tur === 'kesilen' ? 'tahsilat' : 'odeme_yaptik';
    updateIslemTipiInfo();
    document.getElementById('input-islem-payment-invoice-id').value = String(invoice.id);
    document.getElementById('input-islem-tutar').value = summary.remaining;
    document.getElementById('input-islem-aciklama').value = `${invoice.faturaNo} ${invoice.tur === 'kesilen' ? 'tahsilatı' : 'ödemesi'}`;
    updatePaymentInvoiceSummary();
    markModalFormClean('modal-islem');
};

window.saveInvoicePaymentHistory = function(id) {
    const invoice = getDBArray('faturalar').find(item => String(item.id) === String(id));
    if (!invoice || (!getInvoicePaymentSummary(invoice).legacy && invoice.paymentOpeningAmount === undefined)) return;
    const input = document.getElementById('invoice-history-paid');
    const value = input?.value;
    const paid = roundMoney(Number(value));
    const linkedPaid = getInvoicePaymentSummary(invoice).linkedPaid;
    if (value === '' || !Number.isFinite(Number(value)) || paid < linkedPaid || paid > roundMoney(invoice.tutar)) return alert(`Ödenen toplam ${formatCurrency(linkedPaid)} ile ${formatCurrency(invoice.tutar)} arasında olmalı.`);
    invoice.paymentOpeningAmount = roundMoney(paid - linkedPaid);
    invoice.paymentTrackingVersion = 1;
    addAuditLog('Güncellendi', 'Fatura', invoice.id, `${invoice.faturaNo} ödeme geçmişi: ${formatCurrency(paid)}. Cari ve kasa bakiyeleri değiştirilmedi.`);
    saveDB();
    showFaturaDetail(invoice.id);
    showToast({ type: 'success', title: 'Ödeme geçmişi tamamlandı', message: 'Faturanın kalan tutarı güncellendi. Yeni para hareketi oluşturulmadı.' });
};

function getInvoiceDocumentLine(fatura) {
    return fatura.documentSnapshot?.line || {
        ...getSavedInvoiceAmounts(fatura, getDBArray('isEmirleri').find(order => String(order.id) === String(fatura.orderId))),
        description: fatura.aciklama || 'Fatura kalemi', orderNo: fatura.orderNo || ''
    };
}

window.printInvoiceDocument = function(faturaId) {
    const fatura = getDBArray('faturalar').find(f => String(f.id) === String(faturaId));
    if (!fatura) return alert('Yazdırılacak fatura bulunamadı.');

    const line = getInvoiceDocumentLine(fatura);
    const cari = findCariByReference(fatura.cariId, fatura.firma);
    const title = fatura.tur === 'kesilen' ? 'Fatura Belgesi' : 'Alınan Fatura Kaydı';
    const referenceHTML = line.orderNo ? `<div class="document-card-label">İş Emri</div><div class="document-card-value">${escapeHTML(line.orderNo)}</div>` : '';
    const contentHTML = `
        ${getPrintBrandHTML(title, getPrintMetaHTML([
            ['Fatura No', fatura.faturaNo],
            ['Tarih', fatura.faturaTarihi || fatura.tarih || new Date().toLocaleDateString('tr-TR')],
            ['Vade', fatura.vadeTarihi],
            ['Ödeme', getInvoicePaymentLabel(fatura)]
        ]), fatura.documentSnapshot?.issuer)}
        ${getPrintPartyHTML(fatura.tur === 'kesilen' ? 'Müşteri' : 'Tedarikçi', fatura.documentSnapshot?.customer?.adi || fatura.firma || cari?.adi,
            fatura.documentSnapshot?.customer || { ...cari, vergiNo: fatura.vergiNo || cari?.vergiNo }, referenceHTML)}
        ${getPrintServiceLineHTML(line.description, line.gross)}
        <div class="document-footer-grid">${getPrintTotalsHTML(line, 'Fatura tutar özeti')}</div>
        <div class="document-footnote">${fatura.tur === 'kesilen' ? 'Bilgilendirme amaçlıdır. Resmî fatura yerine geçmez.' : 'Uygulamada kayıtlı alış faturasının bilgi dökümüdür.'}</div>
    `;

    openPrintPreview(title, contentHTML, '', {
        paymentFooter: fatura.tur === 'kesilen',
        share: {
            phone: cari?.tel || cari?.telefon || '',
            customerName: fatura.firma || cari?.adi || '',
            documentNo: fatura.faturaNo || ''
        }
    });
};

window.printList = function(type, selectedOnly = false) {
    const report = getListReport(type);
    if (!report) return alert('Yazdırılacak liste bulunamadı.');
    if (type !== 'accounts' && !validateReportDateRange(type)) return;
    const effectiveSelectedOnly = selectedOnly || getReportSelection(type).size > 0;
    const rows = getReportRows(report, effectiveSelectedOnly);
    if (!rows.length) return alert(effectiveSelectedOnly ? 'Yazdırmak için önce listedeki kayıtları seçin.' : 'Bu listede yazdırılacak kayıt yok.');

    if (type === 'accounts' && effectiveSelectedOnly && rows.length === 1) {
        printAccountStatement(rows[0].id);
        return;
    }

    if (type === 'orders' && effectiveSelectedOnly && rows.length === 1) {
        printOrderStatement(rows[0].id);
        return;
    }

    if (type === 'invoices' && effectiveSelectedOnly && rows.length === 1) {
        window.printInvoiceDocument(rows[0].id);
        return;
    }

    if (type === 'personnel' && effectiveSelectedOnly && rows.length === 1 && rows[0].kind === 'payroll') {
        printPayrollStatement(rows[0].id);
        return;
    }

    const isProfitabilityReport = type === 'profitability';
    const profitabilityResults = new Map();
    if (isProfitabilityReport) {
        rows.forEach(row => {
            const order = getDBArray('isEmirleri').find(item => String(item.id) === String(row.id));
            if (order) profitabilityResults.set(String(row.id), getOrderProfitability(order));
        });
    }

    const numericColumns = new Set(report.headers.flatMap((header, index) =>
        /tutar|bakiye|fiyat|maliyet|kâr|marj|miktar|maaş|ücret|ağırlık|matrah|kdv|toplam|net satış/i.test(header) && !/durumu/i.test(header) ? [index] : []));
    const tableHead = report.headers.map((h, index) => `<th scope="col"${numericColumns.has(index) ? ' class="text-right"' : ''}>${escapeHTML(h)}</th>`).join('');
    const tableBody = rows.map(row => {
        const result = profitabilityResults.get(String(row.id));
        const values = reportRowValues(row);
        const cells = values.map((cell, index) => {
            const classes = [];
            if (numericColumns.has(index)) classes.push('number-cell');
            if (result && (index === 6 || index === 7)) {
                classes.push(result.grossProfit < 0 ? 'print-profit-negative' : 'print-profit-positive');
            }
            return `<td${classes.length ? ` class="${classes.join(' ')}"` : ''}>${escapeHTML(cell)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    let profitabilitySummaryHTML = '';
    if (isProfitabilityReport) {
        const summary = [...profitabilityResults.values()].reduce((totals, result) => {
            totals.revenue += result.profitNetRevenue;
            totals.cost += result.costTotal;
            totals.profit += result.grossProfit;
            return totals;
        }, { revenue: 0, cost: 0, profit: 0 });
        summary.revenue = roundMoney(summary.revenue);
        summary.cost = roundMoney(summary.cost);
        summary.profit = roundMoney(summary.profit);
        summary.margin = summary.revenue > 0 ? roundMoney((summary.profit / summary.revenue) * 100) : 0;
        const incompleteCount = rows.filter(row => {
            const order = getDBArray('isEmirleri').find(item => String(item.id) === String(row.id));
            return order && getProfitabilityStatus(order) !== 'Kesin';
        }).length;
        profitabilitySummaryHTML = `
            <section class="print-summary-grid" aria-label="Kârlılık özeti">
                <div class="print-summary-card"><span>Net Satış</span><strong>${escapeHTML(formatCurrency(summary.revenue))}</strong></div>
                <div class="print-summary-card"><span>Toplam Maliyet</span><strong>${escapeHTML(formatCurrency(summary.cost))}</strong></div>
                <div class="print-summary-card ${summary.profit < 0 ? 'is-negative' : ''}"><span>Brüt Kâr</span><strong>${escapeHTML(formatCurrency(summary.profit))}</strong></div>
                <div class="print-summary-card ${summary.margin < 0 ? 'is-negative' : ''}"><span>Ortalama Kâr Marjı</span><strong>${escapeHTML(formatProfitPercent(summary.margin))}</strong></div>
            </section>
            ${incompleteCount ? `<div class="print-summary-note">Not: ${incompleteCount} iş emrinin maliyet durumu kesinleştirilmemiştir.</div>` : ''}
        `;
    }

    const scopeLabel = effectiveSelectedOnly ? 'Seçilen kayıtlar' : 'Mevcut liste';
    const contentHTML = `
        ${getPrintBrandHTML(report.title, getPrintMetaHTML([
            ['Düzenleme', new Date().toLocaleDateString('tr-TR')],
            ['Kapsam', scopeLabel],
            ...(report.dateRangeLabel ? [['Aralık', report.dateRangeLabel]] : [])
        ]))}
        ${profitabilitySummaryHTML}
        <div class="section-heading report-section-heading">
            <h2>Rapor Detayı</h2>
            <span>${rows.length} kayıt</span>
        </div>
        <table class="report-list-table report-list-${escapeHTML(type)}">
            <thead><tr>${tableHead}</tr></thead>
            <tbody>${tableBody}</tbody>
        </table>
    `;

    const landscapeReports = new Set(['inventory', 'profitability', 'cheques', 'expenses', 'invoices', 'scraps']);
    const orientation = landscapeReports.has(type) ? 'landscape' : 'portrait';
    const reportStyles = `
        .report-section-heading { margin-top: ${isProfitabilityReport ? '18px' : '0'}; }
        .report-list-table { table-layout: auto; }
        .report-list-table th { white-space: normal; }
        .report-list-inventory th:nth-child(1),
        .report-list-inventory th:nth-child(2),
        .report-list-inventory th:nth-child(4),
        .report-list-inventory th:nth-child(6),
        .report-list-inventory th:nth-child(7),
        .report-list-inventory th:nth-child(8),
        .report-list-inventory th:nth-child(10),
        .report-list-inventory td:nth-child(1),
        .report-list-inventory td:nth-child(2),
        .report-list-inventory td:nth-child(4),
        .report-list-inventory td:nth-child(6),
        .report-list-inventory td:nth-child(7),
        .report-list-inventory td:nth-child(8),
        .report-list-inventory td:nth-child(10),
        .report-list-profitability th:nth-child(n+5):nth-child(-n+8),
        .report-list-profitability td:nth-child(n+5):nth-child(-n+8),
        .report-list-cheques th:nth-child(1),
        .report-list-cheques th:nth-child(6),
        .report-list-cheques td:nth-child(1),
        .report-list-cheques td:nth-child(6) { white-space: nowrap; }
        .report-list-profitability th:nth-child(4) { width: 18%; }
        .report-list-profitability th:nth-child(3) { width: 13%; }
    `;
    openPrintPreview(report.title, contentHTML, reportStyles, { orientation });
};

window.openModal = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    enhanceModalLayout(el);
    if (!el.classList.contains('active')) modalReturnFocus.set(el, document.activeElement);
    el.dataset.modalOrder = String(++modalOpenSequence);
    const activeModalCount = [...document.querySelectorAll('.modal-overlay.active')].filter(modal => modal !== el).length;
    el.style.zIndex = String(1000 + (activeModalCount * 10));
    el.classList.add('active');
    document.body.classList.add('modal-open');
    setTimeout(() => {
        markModalFormClean(el);
        const preferred = el.querySelector('.modal-body .form-control:not([type="hidden"]):not([disabled]), .modal-body button:not([disabled]), .btn-close');
        preferred?.focus();
    }, 0);
}

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    delete el.dataset.modalOrder;
    el.style.removeProperty('z-index');
    if (!document.querySelector('.modal-overlay.active')) document.body.classList.remove('modal-open');
    const returnTarget = modalReturnFocus.get(el);
    modalReturnFocus.delete(el);
    if (returnTarget?.isConnected && typeof returnTarget.focus === 'function') {
        setTimeout(() => returnTarget.focus(), 0);
    }
}

document.addEventListener('keydown', event => {
    const activeModals = [...document.querySelectorAll('.modal-overlay.active')]
        .sort((a, b) => Number(a.dataset.modalOrder || 0) - Number(b.dataset.modalOrder || 0));
    const modal = activeModals.at(-1);
    if (!modal || modal.id === 'modal-confirm') return;

    if (event.key === 'Escape') {
        event.preventDefault();
        requestCloseModal(modal.id);
        return;
    }

    if (event.key !== 'Tab') return;
    const focusables = getModalFocusables(modal);
    if (!focusables.length) {
        event.preventDefault();
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.tabIndex = -1;
            content.focus();
        }
        return;
    }

    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

function getCariFormPayload(prefix = 'input-cari') {
    const value = suffix => document.getElementById(`${prefix}-${suffix}`)?.value || '';
    return {
        adi: plainText(value('adi')),
        tel: plainText(value('tel')) || '-',
        cariTuru: value('tur') || 'musteri',
        yetkili: plainText(value('yetkili')),
        email: plainText(value('email')).toLocaleLowerCase('tr-TR'),
        adres: plainText(value('adres')),
        vergiDairesi: plainText(value('vergi-dairesi')),
        vergiNo: plainText(value('vergi-no')),
        vadeGun: Math.max(0, parseInt(value('vade'), 10) || 0),
        iban: plainText(value('iban')).replace(/\s+/g, '').toLocaleUpperCase('tr-TR')
    };
}

function setCariFormPayload(prefix, cari = {}) {
    const set = (suffix, value) => {
        const el = document.getElementById(`${prefix}-${suffix}`);
        if (el) el.value = value ?? '';
    };
    set('adi', cari.adi || '');
    set('tel', cari.tel === '-' ? '' : (cari.tel || ''));
    set('tur', cari.cariTuru || 'musteri');
    set('yetkili', cari.yetkili || '');
    set('email', cari.email || '');
    set('adres', cari.adres || '');
    set('vergi-dairesi', cari.vergiDairesi || '');
    set('vergi-no', cari.vergiNo || '');
    set('vade', cari.vadeGun || 0);
    set('iban', cari.iban || '');
}

window.saveCari = function() {
    const unlock = beginModalSubmit('modal-cari');
    if (!unlock) return;
    try {
        const payload = getCariFormPayload('input-cari');
        if (!validateModalFields('modal-cari', [
            { id: 'input-cari-adi', test: value => !!plainText(value), message: 'Firma adı zorunludur.' },
            { id: 'input-cari-email', test: value => !plainText(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), message: 'Geçerli bir e-posta adresi girin.' }
        ])) return;

        const cari = {
            id: createRecordId(),
            kodu: generateSerialNo('cari'),
            ...payload,
            bakiye: 0,
            ledgerOpeningBalance: 0,
            durum: 'Temiz'
        };
        db.cariler.push(cari);
        addAuditLog('Oluşturuldu', 'Cari', cari.id, `${cari.kodu} / ${cari.adi}`);
        saveDB();
        closeModal('modal-cari');
        renderCariler();
        updateQuoteMaterials();
        setCariFormPayload('input-cari', {});
        showToast({ type: 'success', title: 'Cari oluşturuldu', message: `${payload.adi} hesabı kullanıma hazır.` });
    } catch(e) {
        alert("Cari kaydedilirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
}

window.editCari = function(id) {
    if (getDBArray('cariler').some(c => c.id == id && c.systemRole === 'retail')) return alert('Perakende Müşteri sistem hesabıdır. Satışları Hızlı Satış bölümünden yönetin.');
    const cari = db.cariler.find(c => c.id == id);
    if (!cari) return;

    document.getElementById('input-duzenle-id').value = cari.id;
    setCariFormPayload('input-duzenle', cari);
    document.getElementById('input-duzenle-pasif').checked = !!cari.isPasif;
    
    openModal('modal-cari-duzenle');
}

window.updateCari = function() {
    const unlock = beginModalSubmit('modal-cari-duzenle', 'Güncelleniyor...');
    if (!unlock) return;
    try {
        const id = document.getElementById('input-duzenle-id').value;
        const payload = getCariFormPayload('input-duzenle');
        const isPasif = document.getElementById('input-duzenle-pasif').checked;
        if (!validateModalFields('modal-cari-duzenle', [
            { id: 'input-duzenle-adi', test: value => !!plainText(value), message: 'Firma adı zorunludur.' },
            { id: 'input-duzenle-email', test: value => !plainText(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), message: 'Geçerli bir e-posta adresi girin.' }
        ])) return;
        
        const cari = db.cariler.find(c => c.id == id);
        if (cari) {
            if (isPasif && cari.bakiye !== 0) {
                return alert("Dikkat: Bu müşterinin aktif bir bakiyesi (borcu/alacağı) var! Hesap sıfırlanmadan pasife alamazsınız.");
            }

            const oldName = cari.adi;
            if (oldName !== payload.adi) {
                (db.islemler || []).forEach(islem => {
                    if (islem.firma === oldName) {
                        islem.firma = payload.adi;
                    }
                });
            }

            Object.assign(cari, payload);
            cari.isPasif = isPasif;
            addAuditLog('Güncellendi', 'Cari', cari.id, `${oldName} -> ${cari.adi} / ${isPasif ? 'Pasif' : 'Aktif'}`);
            saveDB();
            closeModal('modal-cari-duzenle');
            renderCariler();
            updateQuoteMaterials();
        }
    } catch(e) {
        alert("Cari güncellenirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
}

window.deleteCari = function(id) {
    const cari = getDBArray('cariler').find(c => c.id == id);
    if (!cari) return alert('Cari bulunamadı.');

    if (Math.abs(Number(cari.bakiye) || 0) > 0.009) {
        return alert('Bakiyesi bulunan cari silinemez. Önce hesabı kapatın veya cariyi pasife alın.');
    }

    const linkedRecords = [
        ['cari hareketi', getDBArray('islemler').filter(item => item.cariId == id).length],
        ['fatura', getDBArray('faturalar').filter(item => item.cariId == id).length],
        ['iş emri', getDBArray('isEmirleri').filter(item => item.customerId == id).length],
        ['teklif', getDBArray('teklifler').filter(item => item.customerId == id).length],
        ['çek/senet', getDBArray('cekSenetler').filter(item => item.cariId == id).length],
        ['ödeme planı', getDBArray('odemePlanlari').filter(item => item.cariId == id).length],
        ['emanet stok', getDBArray('stoklar').filter(item => item.cariId == id).length]
    ].filter(([, count]) => count > 0);

    if (linkedRecords.length) {
        const summary = linkedRecords.map(([label, count]) => `${count} ${label}`).join(', ');
        return alert(`Bu cariye bağlı ${summary} var. Veri bütünlüğü için silinemez; cariyi pasife alın.`);
    }

    confirmAction('Bu müşteri kaydı kalıcı olarak silinsin mi?', () => {
        db.cariler = db.cariler.filter(c => c.id != id);
        addAuditLog('Silindi', 'Cari', cari.id, `${cari.kodu || '-'} / ${cari.adi}`);
        saveDB();
        renderCariler();
        updateQuoteMaterials();
        showToast({ type: 'success', title: 'Cari silindi', message: `${cari.adi} kaydı kaldırıldı.` });
    }, { title: 'Cari Kaydını Sil', confirmLabel: 'Cariyi Sil' });
}

window.toggleStokCariSelect = function() {
    const sahibi = document.getElementById('input-stok-sahibi').value;
    const container = document.getElementById('stok-cari-container');
    const maliyetContainer = document.getElementById('stok-maliyet-container');
    
    if (sahibi === 'musteri') {
        container.style.display = 'block';
        maliyetContainer.style.display = 'none';
        document.getElementById('input-stok-maliyet').value = 0;
    } else {
        container.style.display = 'none';
        maliyetContainer.style.display = 'block';
    }
};

window.toggleDuzenleStokCariSelect = function() {
    const sahibi = document.getElementById('input-duzenle-stok-sahibi')?.value || 'biz';
    const cariContainer = document.getElementById('duzenle-stok-cari-container');
    const maliyetContainer = document.getElementById('duzenle-stok-maliyet-container');
    if (cariContainer) cariContainer.style.display = sahibi === 'musteri' ? 'block' : 'none';
    if (maliyetContainer) maliyetContainer.style.display = sahibi === 'musteri' ? 'none' : 'block';
    if (sahibi === 'musteri') document.getElementById('input-duzenle-stok-maliyet').value = '0';
};

window.saveStok = function() {
    const unlock = beginModalSubmit('modal-stok');
    if (!unlock) return;
    try {
        const sahibi = document.getElementById('input-stok-sahibi').value;
        const cariId = document.getElementById('input-stok-cari').value;
        const cinsi = plainText(document.getElementById('input-stok-cinsi').value);
        const mm = document.getElementById('input-stok-mm').value;
        const miktar = Number(document.getElementById('input-stok-miktar').value || 0);
        if(document.getElementById('input-stok-kg').dataset.basis==='estimate' && !calculateNewSheetWeight(true)) return;
        const kgRaw = document.getElementById('input-stok-kg').value;
        const kg = Number(kgRaw);
        const en = Number(document.getElementById('input-stok-en').value || 0);
        const boy = Number(document.getElementById('input-stok-boy').value || 0);
        const girilenMaliyet = Number(document.getElementById('input-stok-maliyet').value || 0);
        const maliyet = sahibi === 'musteri' ? 0 : girilenMaliyet;
        const kritikSeviye = Number(document.getElementById('input-stok-kritik')?.value || 0);

        if (!validateModalFields('modal-stok', [
            { id: 'input-stok-mm', test: value => !!thicknessCodeKey(value), message: 'Geçerli bir sac kalınlığı girin.' },
            { id: 'input-stok-cinsi', test: value => !!plainText(value), message: 'Malzeme cinsi zorunludur.' },
            { id: 'input-stok-miktar', test: value => Number(value || 0) >= 0, message: 'Miktar negatif olamaz.' },
            { id: 'input-stok-kg', test: value => plainText(value) !== '' && Number(value) >= 0, message: 'Geçerli bir ağırlık girin.' },
            { id: 'input-stok-en', test: value => Number(value || 0) >= 0, message: 'En ölçüsü negatif olamaz.' },
            { id: 'input-stok-boy', test: value => Number(value || 0) >= 0, message: 'Boy ölçüsü negatif olamaz.' },
            { id: 'input-stok-maliyet', test: value => Number(value || 0) >= 0, message: 'Maliyet negatif olamaz.' },
            { id: 'input-stok-kritik', test: value => Number(value || 0) >= 0, message: 'Kritik seviye negatif olamaz.' },
            { id: 'input-stok-cari', test: value => sahibi !== 'musteri' || !!value, message: 'Müşteri malzemesi için sahibi seçin.' }
        ])) return;
        if (![miktar, kg, en, boy, girilenMaliyet, kritikSeviye].every(Number.isFinite)) return;

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        const stok = {
            id: createRecordId(),
            kodu: stockCodeForThickness(mm, true),
            cinsi: cinsi,
            mm: mm,
            en,
            boy,
            ebat: `${en || ''}x${boy || ''}`,
            miktar: miktar,
            kg: kg,
            weightBasis: document.getElementById('input-stok-kg').dataset.basis === 'estimate' ? 'estimate' : 'manual',
            maliyet: maliyet,
            costUnit: 'kg',
            kritikSeviye: kritikSeviye,
            sahibi: sahibiText,
            sahibiTipi: sahibi,
            cariId: cariId,
            tarih: new Date().toLocaleDateString('tr-TR')
        };
        db.stoklar.push(stok);
        addStokMovement(stok, {
            tip: 'Stok Girişi',
            alan: 'miktar',
            miktar,
            onceki: 0,
            sonraki: miktar,
            aciklama: sahibi === 'musteri' ? `${sahibiText} emanet malzeme girişi` : 'Yeni malzeme girişi',
            ref: stok.kodu
        });
        if (kg > 0) addStokMovement(stok, { tip: 'Stok Girişi', alan: 'kg', miktar: kg, onceki: 0, sonraki: kg, aciklama: 'Yeni malzeme ağırlığı', ref: stok.kodu });
        addAuditLog('Oluşturuldu', 'Stok', stok.id, `${stok.kodu} / ${stok.cinsi} / ${stok.miktar} adet / ${kg} KG`);
        
        saveDB();
        closeModal('modal-stok');
        renderStoklar();
        
        // Reset form
        document.getElementById('input-stok-cinsi').value = '';
        document.getElementById('input-stok-mm').value = '';
        document.getElementById('input-stok-miktar').value = '';
        document.getElementById('input-stok-kg').value = '';
        document.getElementById('input-stok-kg').dataset.basis='';
        document.getElementById('input-stok-en').value = '';
        document.getElementById('input-stok-boy').value = '';
        document.getElementById('input-stok-maliyet').value = '0';
        const kritikEl = document.getElementById('input-stok-kritik');
        if (kritikEl) kritikEl.value = '0';
    } catch(e) {
        alert("Stok kaydedilirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
}

window.openStokDuzenleModal = function(id) {
    if (getDBArray('stoklar').some(s => s.id == id && s.originCutId)) return alert('Kalan parçanın miktarı kesim veya satışla değişir. Hatalı kayıt için Kesim Geçmişi bölümündeki Geri Al işlemini kullanın.');
    const stok = db.stoklar.find(s => s.id === id);
    if (!stok) return;

    document.getElementById('input-duzenle-stok-id').value = stok.id;
    document.getElementById('input-duzenle-stok-cinsi').value = stok.cinsi;
    document.getElementById('input-duzenle-stok-mm').value = stok.mm || '';
    document.getElementById('input-duzenle-stok-miktar').value = stok.miktar;
    const legacyEbat = String(stok.ebat || '').match(/^\s*([\d.,]+)\s*[xX×]\s*([\d.,]+)\s*$/);
    document.getElementById('input-duzenle-stok-en').value = stok.en ?? (legacyEbat ? Number(legacyEbat[1].replace(',', '.')) : '');
    document.getElementById('input-duzenle-stok-boy').value = stok.boy ?? (legacyEbat ? Number(legacyEbat[2].replace(',', '.')) : '');
    document.getElementById('input-duzenle-stok-kg').value = stok.kg ?? '';
    document.getElementById('input-duzenle-stok-maliyet').value = stok.maliyet || 0;
    document.getElementById('input-duzenle-stok-sahibi').value = stok.sahibiTipi || 'biz';
    document.getElementById('input-duzenle-stok-cari').value = stok.cariId || '';
    const kritikEl = document.getElementById('input-duzenle-stok-kritik');
    if (kritikEl) kritikEl.value = stok.kritikSeviye || 0;

    toggleDuzenleStokCariSelect();

    renderStockCodeHint(true);
    openModal('modal-stok-duzenle');
};

window.updateStok = function() {
    const unlock = beginModalSubmit('modal-stok-duzenle', 'Güncelleniyor...');
    if (!unlock) return;
    try {
        const id = parseInt(document.getElementById('input-duzenle-stok-id').value);
        const cinsi = plainText(document.getElementById('input-duzenle-stok-cinsi').value);
        const mm = document.getElementById('input-duzenle-stok-mm').value;
        const miktar = Number(document.getElementById('input-duzenle-stok-miktar').value || 0);
        const kg = Number(document.getElementById('input-duzenle-stok-kg').value || 0);
        const en = Number(document.getElementById('input-duzenle-stok-en').value || 0);
        const boy = Number(document.getElementById('input-duzenle-stok-boy').value || 0);
        const sahibiTipi = document.getElementById('input-duzenle-stok-sahibi').value || 'biz';
        const cariId = document.getElementById('input-duzenle-stok-cari').value || '';
        const maliyet = Number(document.getElementById('input-duzenle-stok-maliyet').value || 0);
        const kritikSeviye = Number(document.getElementById('input-duzenle-stok-kritik')?.value || 0);

        if (!validateModalFields('modal-stok-duzenle', [
            { id: 'input-duzenle-stok-mm', test: value => !!thicknessCodeKey(value), message: 'Geçerli bir sac kalınlığı girin.' },
            { id: 'input-duzenle-stok-cinsi', test: value => !!plainText(value), message: 'Malzeme cinsi zorunludur.' },
            { id: 'input-duzenle-stok-miktar', test: value => Number(value || 0) >= 0, message: 'Miktar negatif olamaz.' },
            { id: 'input-duzenle-stok-kg', test: value => plainText(value) !== '' && Number(value) >= 0, message: 'Geçerli bir ağırlık girin.' },
            { id: 'input-duzenle-stok-en', test: value => Number(value || 0) >= 0, message: 'En ölçüsü negatif olamaz.' },
            { id: 'input-duzenle-stok-boy', test: value => Number(value || 0) >= 0, message: 'Boy ölçüsü negatif olamaz.' },
            { id: 'input-duzenle-stok-maliyet', test: value => Number(value || 0) >= 0, message: 'Maliyet negatif olamaz.' },
            { id: 'input-duzenle-stok-kritik', test: value => Number(value || 0) >= 0, message: 'Kritik seviye negatif olamaz.' },
            { id: 'input-duzenle-stok-cari', test: value => sahibiTipi !== 'musteri' || !!value, message: 'Müşteri malzemesi için sahibi seçin.' }
        ])) return;
        if (![miktar, kg, en, boy, maliyet, kritikSeviye].every(Number.isFinite)) return;

        const stok = db.stoklar.find(s => s.id === id);
        if (!stok) return;
        if(stok.purchaseMovementId)return alert('Alıma bağlı stok doğrudan değiştirilemez. Cari geçmişinden sac alımını düzeltin.');
        if (stok.originCutId) return alert('Kesimden oluşan parça doğrudan değiştirilemez. Kesim Geçmişi bölümünü kullanın.');
        if (getDBArray('sacKesimleri').some(c => c.status === 'active' && c.stokId === id) && (Number(stok.en) !== en || Number(stok.boy) !== boy || Number(stok.mm) !== Number(mm) || stok.cinsi !== cinsi || (stok.sahibiTipi || 'biz') !== sahibiTipi || String(stok.cariId || '') !== String(cariId))) return alert('Bu malzeme kesim geçmişine bağlı. Cinsi, ölçüsü ve sahibi değiştirilemez.');
        if (sahibiTipi === 'musteri' && getDBArray('hizliSatislar').some(s => s.stokId === id && s.status === 'active')) return alert('Bu stokta geçerli hızlı satış var. Sahiplik değişmeden önce ilgili satışları kontrol edin.');
        const reservedQuantity = getReservedStockQuantity(stok.id, 'miktar');
        if (miktar < reservedQuantity) {
            return alert(`Bu malzemeden ${reservedQuantity} adet/plaka aktif iş emirlerine rezerve edildi. Fiziki miktar rezervasyonun altına düşürülemez.`);
        }
        const reservedKg = getReservedStockQuantity(stok.id, 'kg');
        if (kg < reservedKg) return alert(`Bu malzemeden ${reservedKg} KG aktif iş emirlerine rezerve edildi. Ağırlık rezervasyonun altına düşürülemez.`);
        const reservationError = getStockEditReservationError(stok, { miktar, kg, en, boy, mm });
        if (reservationError) return alert(reservationError);
        const eskiMiktar = Number(stok.miktar) || 0;
        const eskiKg = Number(stok.kg) || 0;

        if (thicknessCodeKey(stok.mm) !== thicknessCodeKey(mm)) {
            const oldCode = stok.kodu;
            stok.kodu = stockCodeForThickness(mm, true);
            rememberDisplayCode(stok, oldCode);
            addAuditLog('Güncellendi', 'Stok Kodu', stok.id, `${oldCode} → ${stok.kodu} · Kalınlık düzeltmesi`);
        }
        stok.cinsi = cinsi;
        stok.mm = mm;
        stok.miktar = miktar;
        if(Number(stok.kg)!==kg) stok.weightBasis='manual';
        stok.kg = kg;
        stok.en = en;
        stok.boy = boy;
        stok.ebat = `${en || ''}x${boy || ''}`;
        stok.sahibiTipi = sahibiTipi;
        stok.cariId = sahibiTipi === 'musteri' ? cariId : '';
        stok.sahibi = sahibiTipi === 'musteri' ? (findCariByReference(cariId)?.adi || 'Müşteri') : 'Biz';
        stok.kritikSeviye = kritikSeviye;
        stok.maliyet = sahibiTipi === 'musteri' ? 0 : maliyet;
        stok.costUnit='kg';stok.costReviewRequired=false;
        if (roundMoney(eskiMiktar) !== roundMoney(miktar)) {
            addStokMovement(stok, {
                tip: 'Stok Düzeltme',
                alan: 'miktar',
                miktar: roundMoney(miktar - eskiMiktar),
                onceki: eskiMiktar,
                sonraki: miktar,
                aciklama: 'Malzeme düzenleme ekranından miktar değiştirildi',
                ref: stok.kodu
            });
        }
        if (roundMoney(eskiKg) !== roundMoney(kg)) {
            addStokMovement(stok, { tip: 'Stok Düzeltme', alan: 'kg', miktar: roundMoney(kg - eskiKg), onceki: eskiKg, sonraki: kg, aciklama: 'Malzeme düzenleme ekranından ağırlık değiştirildi', ref: stok.kodu });
        }
        addAuditLog('Güncellendi', 'Stok', stok.id, `${stok.kodu || '-'} / ${stok.cinsi} / ${eskiMiktar} -> ${miktar} adet / ${eskiKg} -> ${kg} KG`);

        saveDB();
        closeModal('modal-stok-duzenle');
        renderStoklar();
    } catch(e) {
        alert("Stok güncellenirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
};

window.deleteStok = function(id) {
    if(getDBArray('stoklar').some(s=>s.id===id&&s.purchaseMovementId))return alert('Bu stok sac alımına bağlı. Cari geçmişinden alımı geri alın.');
    if (isSheetCutStockLinked(id)) return alert('Bu malzeme kesim geçmişine bağlı olduğu için silinemez.');
    const stok = db.stoklar.find(s => s.id === id);
    if (!stok) return alert('Stok kaydı bulunamadı.');

    if (getDBArray('hizliSatislar').some(item => item.stokId == id)) return alert('Bu stok hızlı satış geçmişine bağlı olduğu için silinemez.');
    const linkedOrders = getDBArray('isEmirleri').filter(item => item.stokId == id).length;
    const linkedQuotes = getDBArray('teklifler').filter(item => item.stokId == id).length;
    if (linkedOrders || linkedQuotes) {
        const details = [
            linkedOrders ? `${linkedOrders} iş emri` : '',
            linkedQuotes ? `${linkedQuotes} teklif` : ''
        ].filter(Boolean).join(', ');
        return alert(`Bu malzemeye bağlı ${details} var. Geçmiş kayıtların bozulmaması için stok silinemez.`);
    }

    confirmAction('Bu malzeme kaydı ve mevcut stok miktarı silinsin mi?', () => {
        if (isSheetCutStockLinked(id)) return alert('Bu malzeme kesim geçmişine bağlı olduğu için silinemez.');
        if (getDBArray('hizliSatislar').some(item => item.stokId == id)) return alert('Bu stok hızlı satış geçmişine bağlı olduğu için silinemez.');
        addStokMovement(stok, {
            tip: 'Stok Silindi',
            alan: 'miktar',
            miktar: -(Number(stok.miktar) || 0),
            onceki: Number(stok.miktar) || 0,
            sonraki: 0,
            aciklama: 'Malzeme kaydı silindi',
            ref: stok.kodu || ''
        });
        if (Number(stok.kg) > 0) addStokMovement(stok, { tip: 'Stok Silindi', alan: 'kg', miktar: -Number(stok.kg), onceki: Number(stok.kg), sonraki: 0, aciklama: 'Malzeme kaydı silindi', ref: stok.kodu || '' });
        db.stoklar = db.stoklar.filter(s => s.id !== id);
        addAuditLog('Silindi', 'Stok', stok.id, `${stok.kodu || '-'} / ${stok.cinsi || 'Malzeme'}`);
        saveDB();
        renderStoklar();
        showToast({ type: 'success', title: 'Stok silindi', message: `${stok.cinsi || stok.kodu || 'Malzeme'} kaydı kaldırıldı.` });
    }, { title: 'Stok Kaydını Sil', confirmLabel: 'Stoğu Sil' });
}

window.toggleFireCariSelect = function() {
    const sahibi = document.getElementById('input-fire-sahibi').value;
    const container = document.getElementById('fire-cari-container');
    container.style.display = sahibi === 'musteri' ? 'block' : 'none';
};

window.openFireModal = function(id = '') {
    if (getDBArray('fireler').some(f => f.id == id && f.cutId)) return alert('Bu hurda kesim kaydına bağlı. Kesim Geçmişi bölümünden işlem yapın.');
    const record = id ? getDBArray('fireler').find(item => String(item.id) === String(id)) : null;
    const orderSelect = document.getElementById('input-fire-is-emri');
    if (orderSelect) {
        orderSelect.innerHTML = '<option value="">İş emrine bağlı değil</option>' + getDBArray('isEmirleri')
            .filter(order => order.durum !== 'İptal')
            .slice().reverse()
            .map(order => `<option value="${order.id}">${escapeHTML(order.orderNo || 'İş emri')} · ${escapeHTML(order.customerName || '-')}</option>`).join('');
    }
    resetAttachmentInputs('input-fire-ek', 'input-fire-ek-not');
    const cariSelect = document.getElementById('input-fire-cari');
    if (cariSelect) {
        cariSelect.innerHTML = '<option value="">Müşteri seçin...</option>' + getDBArray('cariler')
            .filter(cari => !cari.isPasif || String(cari.id) === String(record?.cariId || ''))
            .map(cari => `<option value="${cari.id}">${escapeHTML(cari.adi)} (${escapeHTML(cari.kodu || '-')})</option>`).join('');
    }
    document.getElementById('input-fire-id').value = record?.id || '';
    document.getElementById('input-fire-sahibi').value = record?.sahibiTipi || 'biz';
    document.getElementById('input-fire-tur').value = record?.tur || 'fire';
    document.getElementById('input-fire-cari').value = record?.cariId || '';
    document.getElementById('input-fire-cinsi').value = record?.cinsi || '';
    document.getElementById('input-fire-mm').value = record?.mm || '';
    document.getElementById('input-fire-en').value = record?.en || '';
    document.getElementById('input-fire-boy').value = record?.boy || '';
    document.getElementById('input-fire-miktar').value = record?.miktar ?? 1;
    document.getElementById('input-fire-kg').value = record?.kg || '';
    document.getElementById('input-fire-is-emri').value = record?.isEmriId || '';
    document.getElementById('input-fire-neden').value = record?.neden || '';
    document.getElementById('input-fire-ek-not').value = record?.ek?.note || '';
    document.getElementById('modal-fire-title').textContent = record ? 'Fire / Parça Kaydını Düzenle' : 'Yeni Fire / Parça Kaydı';
    document.getElementById('btn-fire-save').textContent = record ? 'Değişiklikleri Kaydet' : 'Kaydet';
    toggleFireCariSelect();
    openModal('modal-fire');
};

window.saveFire = function() {
    const unlock = beginModalSubmit('modal-fire');
    if (!unlock) return;
    try {
        const id = document.getElementById('input-fire-id')?.value || '';
        const existing = id ? getDBArray('fireler').find(item => String(item.id) === String(id)) : null;
        if (existing?.cutId) return alert('Kesime bağlı hurda doğrudan değiştirilemez.');
        const sahibi = document.getElementById('input-fire-sahibi').value;
        const cariId = document.getElementById('input-fire-cari').value;
        const cinsi = plainText(document.getElementById('input-fire-cinsi').value);
        const mm = Number(document.getElementById('input-fire-mm').value || 0);
        const en = Number(document.getElementById('input-fire-en').value || 0);
        const boy = Number(document.getElementById('input-fire-boy').value || 0);
        const miktar = Number(document.getElementById('input-fire-miktar').value || 0);
        const kg = Number(document.getElementById('input-fire-kg').value || 0);
        const tur = document.getElementById('input-fire-tur').value || 'fire';
        const isEmriId = document.getElementById('input-fire-is-emri').value || '';
        const neden = plainText(document.getElementById('input-fire-neden').value);
        const attachmentInput = document.getElementById('input-fire-ek');
        const attachmentNote = plainText(document.getElementById('input-fire-ek-not')?.value || '');
        const hasNewAttachment = !!attachmentInput?.files?.[0];
        const newAttachment = getAttachmentFromInputs('input-fire-ek', 'input-fire-ek-not');
        const ek = existing?.ek && !hasNewAttachment
            ? { ...existing.ek, note: attachmentNote }
            : newAttachment;

        if (!validateModalFields('modal-fire', [
            { id: 'input-fire-cinsi', test: value => !!plainText(value), message: 'Malzeme cinsi zorunludur.' },
            { id: 'input-fire-mm', test: value => Number(value) > 0, message: 'Kalınlığı sıfırdan büyük girin.' },
            { id: 'input-fire-en', test: value => Number(value) > 0, message: 'En ölçüsünü sıfırdan büyük girin.' },
            { id: 'input-fire-boy', test: value => Number(value) > 0, message: 'Boy ölçüsünü sıfırdan büyük girin.' },
            { id: 'input-fire-miktar', test: value => Number(value || 0) >= 0, message: 'Miktar negatif olamaz.' },
            { id: 'input-fire-kg', test: value => Number(value || 0) >= 0, message: 'Ağırlık negatif olamaz.' },
            { id: 'input-fire-cari', test: value => sahibi !== 'musteri' || !!value, message: 'Müşteri parçası için sahibi seçin.' }
        ])) return;
        if (![mm, en, boy, miktar, kg].every(Number.isFinite)) return;

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        const order = isEmriId ? getDBArray('isEmirleri').find(item => item.id == isEmriId) : null;
        const record = existing || {
            id: createRecordId(),
            tarih: new Date().toLocaleDateString('tr-TR')
        };
        Object.assign(record, {
            cinsi, mm, en, boy, miktar, kg, tur, neden,
            sahibi: sahibiText,
            sahibiTipi: sahibi,
            cariId: cariId,
            isEmriId: order?.id || null,
            isEmriNo: order?.orderNo || '',
            ek
        });
        if (!existing) db.fireler.push(record);
        if (!existing || hasNewAttachment) scheduleAttachmentArchive(ek, 'Fire ve Parcalar', sahibiText);
        addAuditLog(existing ? 'Güncellendi' : 'Oluşturuldu', 'Fire / Parça', record.id, `${tur} / ${cinsi}${order ? ` / ${order.orderNo}` : ''}`);

        saveDB();
        closeModal('modal-fire');
        renderFireler();
        showToast({ type: 'success', title: existing ? 'Fire / parça güncellendi' : 'Fire / parça kaydedildi', message: `${cinsi} bilgileri kaydedildi.` });
        
        // Reset
        document.getElementById('input-fire-cinsi').value = '';
        document.getElementById('input-fire-mm').value = '';
        document.getElementById('input-fire-en').value = '';
        document.getElementById('input-fire-boy').value = '';
        document.getElementById('input-fire-miktar').value = '1';
        document.getElementById('input-fire-kg').value = '';
        document.getElementById('input-fire-neden').value = '';
        document.getElementById('input-fire-id').value = '';
        resetAttachmentInputs('input-fire-ek', 'input-fire-ek-not');
    } catch(e) {
        alert("Fire kaydedilirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
}

window.deleteFire = function(id) {
    if (getDBArray('fireler').some(f => f.id == id && f.cutId)) return alert('Kesime bağlı hurda doğrudan silinemez. Kesim Geçmişi bölümünü kullanın.');
    const fire = db.fireler.find(f => f.id === id);
    if (!fire) return alert('Fire kaydı bulunamadı.');
    confirmAction('Bu fire/parça kaydı silinsin mi?', () => {
        db.fireler = db.fireler.filter(f => f.id !== id);
        addAuditLog('Silindi', 'Fire / Parça', fire.id, `${fire.tur || 'fire'} / ${fire.cinsi || '-'}`);
        saveDB();
        renderFireler();
        showToast({ type: 'success', title: 'Fire kaydı silindi', message: `${fire.cinsi || 'Fire/parça'} kaydı kaldırıldı.` });
    }, { title: 'Fire Kaydını Sil', confirmLabel: 'Kaydı Sil' });
}

function renderFireler() {
    try {
        const tbody = document.getElementById('scraps-tbody');
        if (!tbody) return;

        const fireler = getFilteredFirelerForReport();
        const reversedFireler = applyListSort('scraps', [...fireler].reverse(), {
            material: item => item.cinsi || '',
            thickness: item => Number(item.mm) || 0,
            size: item => `${item.en || ''}x${item.boy || ''}`,
            owner: item => item.sahibi || '',
            date: item => parseTRDate(item.tarih || '')
        });

        // Sayfalama (Pagination) - Fireler
        window.pageScraps = window.pageScraps || 1;
        const itemsPerPage = getListPageSize('scraps');
        const totalPages = Math.ceil(reversedFireler.length / itemsPerPage) || 1;
        
        if (window.pageScraps > totalPages) window.pageScraps = totalPages;
        if (window.pageScraps < 1) window.pageScraps = 1;

        const startIndex = (window.pageScraps - 1) * itemsPerPage;
        const paginatedItems = reversedFireler.slice(startIndex, startIndex + itemsPerPage);

        // Update pagination UI
        const pageInfo = document.getElementById('scraps-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageScraps, totalPages, reversedFireler.length, itemsPerPage);

        const btnPrev = document.getElementById('btn-scraps-prev');
        const btnNext = document.getElementById('btn-scraps-next');
        
        if (btnPrev) btnPrev.disabled = window.pageScraps <= 1;
        if (btnNext) btnNext.disabled = window.pageScraps >= totalPages;

        tbody.innerHTML = paginatedItems.length ? paginatedItems.map(f => `
            <tr>
                ${renderSelectionCell('scraps', f.id)}
                <td>${escapeHTML(f.cinsi || '-')}<br><span class="dashboard-muted-text">${f.tur === 'kullanilabilir' ? 'Kullanılabilir Parça' : (f.tur === 'hurda' ? 'Hurda' : 'Fire')}${f.miktar ? ` · ${escapeHTML(f.miktar)} adet` : ''}${f.kg ? ` · ${escapeHTML(f.kg)} kg` : ''}</span>${renderAttachmentBadge(f)}</td>
                <td>${escapeHTML(f.mm || '-')} mm</td>
                <td>${escapeHTML(f.en || '-')}x${escapeHTML(f.boy || '-')}</td>
                <td><span class="badge ${f.sahibiTipi === 'musteri' ? 'info' : 'success'}">${escapeHTML(f.sahibi || 'Biz')}</span>${f.isEmriNo ? `<br><button type="button" class="linked-record-button" onclick="openOrderHistory('${f.isEmriId}')">${escapeHTML(f.isEmriNo)}</button>` : ''}</td>
                <td>${escapeHTML(f.tarih || '-')}${f.neden ? `<br><span class="dashboard-muted-text">${escapeHTML(f.neden)}</span>` : ''}</td>
                <td><div class="table-actions destructive-actions">
                    <button class="btn btn-outline table-action-button" aria-label="Fire veya parça kaydını düzenle" title="Düzenle" onclick="openFireModal('${f.id}')"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzenle</button>
                    <button class="btn btn-danger table-action-button" aria-label="Fire veya parça kaydını sil" title="Sil" onclick="deleteFire(${f.id})"><i class="fa-solid fa-trash" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `).join('') : renderTableEmptyState(7, 'Fire veya artık parça bulunamadı.', 'Yeni bir parça kaydı ekleyebilir veya tarih filtresini değiştirebilirsiniz.', 'fa-recycle');
        updateReportSelectionUI('scraps');
    } catch(e) {
        console.error("renderFireler error:", e);
    }
}

window.prevScrapsPage = function() {
    if (window.pageScraps > 1) {
        window.pageScraps--;
        renderFireler();
    }
}

window.nextScrapsPage = function() {
    window.pageScraps = (window.pageScraps || 1) + 1;
    renderFireler();
}

window.openAyarlarModal = function() {
    document.getElementById('input-ayar-firma').value = db.ayarlar.firmaAdi || '';
    document.getElementById('input-ayar-tel').value = db.ayarlar.telefon || '';
    document.getElementById('input-ayar-adres').value = db.ayarlar.adres || '';
    const numbering = mergeNumberingSettings(db.ayarlar.numaralandirma);
    [
        ['input-num-hareket-prefix', 'hareket'],
        ['input-num-satis-prefix', 'hizliSatis'],
        ['input-num-kesim-prefix', 'sacKesim'],
        ['input-num-cari-prefix', 'cari'],
        ['input-num-stok-prefix', 'stok'],
        ['input-num-teklif-prefix', 'teklif'],
        ['input-num-isemri-prefix', 'isEmri'],
        ['input-num-fatura-prefix', 'fatura'],
        ['input-num-ceksenet-prefix', 'cekSenet'],
        ['input-num-vade-prefix', 'odemePlani'],
        ['input-num-kasa-prefix', 'kasa']
    ].forEach(([inputId, type]) => {
        const el = document.getElementById(inputId);
        if (el) el.value = numbering[type]?.prefix || '';
    });
    const profitability = getProfitabilitySettings();
    const machineCostInput = document.getElementById('input-ayar-makine-dakika-maliyeti');
    const laborCostInput = document.getElementById('input-ayar-iscilik-saat-maliyeti');
    if (machineCostInput) machineCostInput.value = profitability.makineDakikaMaliyeti;
    if (laborCostInput) laborCostInput.value = profitability.iscilikSaatMaliyeti;
    const resetInput = document.getElementById('input-safe-reset');
    const resetButton = document.getElementById('btn-safe-reset');
    if (resetInput) resetInput.value = '';
    if (resetButton) resetButton.disabled = true;
    renderUpdateState();
    renderNumberingExamples();
    setSettingsTab('company');
    openModal('modal-ayarlar');
}

window.setSettingsTab = function(tab = 'company') {
    const validTab = ['company', 'numbering', 'backup', 'update'].includes(tab) ? tab : 'company';
    if (validTab === 'backup') refreshBackupStatus();
    document.querySelectorAll('#modal-ayarlar .settings-tab').forEach(button => {
        const active = button.id === `settings-tab-${validTab}`;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#modal-ayarlar .settings-panel').forEach(panel => {
        const active = panel.id === `settings-panel-${validTab}`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
    });
    const footer = document.querySelector('#modal-ayarlar .settings-modal-footer');
    if (footer) footer.hidden = validTab === 'backup' || validTab === 'update';
};

window.saveAyarlar = function() {
    const firmaAdi = document.getElementById('input-ayar-firma').value || 'Firma Adı';
    const tel = document.getElementById('input-ayar-tel').value || '';
    const adres = document.getElementById('input-ayar-adres').value || '';
    const makineDakikaMaliyeti = Number(document.getElementById('input-ayar-makine-dakika-maliyeti')?.value || 0);
    const iscilikSaatMaliyeti = Number(document.getElementById('input-ayar-iscilik-saat-maliyeti')?.value || 0);
    if (![makineDakikaMaliyeti, iscilikSaatMaliyeti].every(Number.isFinite) || makineDakikaMaliyeti < 0 || iscilikSaatMaliyeti < 0) {
        return alert('Makine ve işçilik maliyetleri negatif olamaz.');
    }

    if ([...document.querySelectorAll('[id^="input-num-"]')].some(el => !/^[A-Z][A-Z0-9]{0,11}$/.test(el.value.trim().toUpperCase()))) return alert('Kod ön ekleri 1–12 harf/rakam olmalı ve harfle başlamalıdır.');
    const currentNumbering = mergeNumberingSettings(db.ayarlar?.numaralandirma);
    [
        ['input-num-hareket-prefix', 'hareket'],
        ['input-num-satis-prefix', 'hizliSatis'],
        ['input-num-kesim-prefix', 'sacKesim'],
        ['input-num-cari-prefix', 'cari'],
        ['input-num-stok-prefix', 'stok'],
        ['input-num-teklif-prefix', 'teklif'],
        ['input-num-isemri-prefix', 'isEmri'],
        ['input-num-fatura-prefix', 'fatura'],
        ['input-num-ceksenet-prefix', 'cekSenet'],
        ['input-num-vade-prefix', 'odemePlani'],
        ['input-num-kasa-prefix', 'kasa']
    ].forEach(([inputId, type]) => {
        const value = plainText(document.getElementById(inputId)?.value || '').toUpperCase();
        if (value) currentNumbering[type].prefix = value;
    });

    db.ayarlar = {
        ...db.ayarlar,
        firmaAdi,
        telefon: tel,
        adres,
        numaralandirma: currentNumbering,
        karlilik: {
            makineDakikaMaliyeti: roundMoney(makineDakikaMaliyeti),
            iscilikSaatMaliyeti: roundMoney(iscilikSaatMaliyeti)
        }
    };
    addAuditLog('Güncellendi', 'Kârlılık Ayarları', 'ayarlar', `Makine/dk: ${formatCurrency(makineDakikaMaliyeti)}, İşçilik/saat: ${formatCurrency(iscilikSaatMaliyeti)}`);
    saveDB();
    closeModal('modal-ayarlar');
}

function getCariMovementFormType(islem) {
    const label = String(islem?.tip || '').toLocaleLowerCase('tr-TR');
    if (label.includes('tahsilat')) return 'tahsilat';
    if (label.includes('mal alımı')) return 'mal_alimi';
    if (label.includes('ödeme yaptık')) return 'odeme_yaptik';
    if (label.includes('fatura kesildi')) return 'fatura_kes';
    return '';
}

function canEditCariMovement(islem) {
    if(islem?.sheetPurchase) return !islem.reversedBy;
    const type = getCariMovementFormType(islem);
    return canReverseCariMovement(islem) && ['tahsilat', 'mal_alimi', 'odeme_yaptik'].includes(type);
}

function resetIslemModalState(id, adi) {
    const setValue = (elementId, value = '') => {
        const element = document.getElementById(elementId);
        if (element) element.value = value;
    };
    setValue('input-islem-edit-id');
    setValue('input-islem-cari-id', id);
    setValue('input-islem-firma-adi', adi);
    setValue('input-islem-payment-order-id');
    setValue('input-islem-payment-invoice-id');
    setValue('input-islem-aciklama');
    setValue('input-islem-fatura-no');
    setValue('input-islem-tutar');
    setValue('input-islem-kasa');
    setValue('input-islem-tarih', toDateInputValue(new Date()));
    setValue('input-islem-ek-not');
    resetAttachmentInputs('input-islem-ek', 'input-islem-ek-not');
    resetSheetPurchaseForm();

    const typeSelect = document.getElementById('input-islem-tipi');
    if (typeSelect) {
        [...typeSelect.options].forEach(option => { option.disabled = false; });
        typeSelect.disabled=false;typeSelect.value = 'tahsilat';
    }
    const editNotice = document.getElementById('islem-edit-notice');
    if (editNotice) editNotice.hidden = true;
    const attachmentNote = document.getElementById('islem-existing-attachment-note');
    if (attachmentNote) attachmentNote.hidden = true;
    const saveButton = document.getElementById('btn-islem-save');
    if (saveButton) saveButton.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Kaydet';
}

window.openIslemModal = function(id, adi) {
    if (getDBArray('cariler').some(c => c.id == id && c.systemRole === 'retail')) return openQuickSale();
    resetIslemModalState(id, adi);
    document.getElementById('modal-islem-title').textContent = adi + " - İşlem Ekle";
    const orderSelect = document.getElementById('input-islem-order-id');
    if (orderSelect) {
        orderSelect.value = '';
        renderInvoiceOrderOptions(id);
    }
    populateKasaOptions();
    updateIslemTipiInfo();
    openModal('modal-islem');
}

window.openEditCariMovement = function(id) {
    const original = getDBArray('islemler').find(item => String(item.id) === String(id));
    if (!original) return alert('Düzeltilecek cari hareketi bulunamadı.');
    if(original.sheetPurchase)return openEditSheetPurchase(original);
    if (!canEditCariMovement(original)) {
        const owner = getCariMovementOwner(original);
        return alert(owner
            ? `Bu hareket ${owner} kaydına bağlı. Düzeltmeyi ilgili modülden yapın.`
            : 'Bu hareket düzeltilemez. Geri alınmış veya sistem tarafından oluşturulmuş olabilir.');
    }

    const cari = findCariByReference(original.cariId, original.firma);
    if (!cari) return alert('Cari bulunamadığı için hareket düzeltilemiyor.');
    const type = getCariMovementFormType(original);
    const originalCash = original.kasaHareketId
        ? getDBArray('kasaHareketleri').find(item => String(item.id) === String(original.kasaHareketId))
        : null;
    if (originalCash?.reversedBy) return alert('Bağlı kasa/banka hareketi daha önce geri alındığı için bu kayıt düzeltilemez.');

    openIslemModal(cari.id, cari.adi);
    document.getElementById('input-islem-edit-id').value = original.id;
    document.getElementById('modal-islem-title').textContent = `${cari.adi} - İşlem Düzelt`;
    document.getElementById('input-islem-tipi').value = type;
    document.getElementById('input-islem-aciklama').value = original.aciklama || '';
    document.getElementById('input-islem-tutar').value = roundMoney(original.tutar || 0);
    document.getElementById('input-islem-payment-order-id').value = original.orderId || '';
    populateKasaOptions(originalCash?.kasaId || '');
    document.getElementById('input-islem-kasa').value = originalCash?.kasaId || '';
    document.getElementById('input-islem-ek-not').value = original.ek?.note || '';

    const invoiceOption = document.querySelector('#input-islem-tipi option[value="fatura_kes"]');
    if (invoiceOption) invoiceOption.disabled = true;
    const editNotice = document.getElementById('islem-edit-notice');
    if (editNotice) editNotice.hidden = false;
    const attachmentNote = document.getElementById('islem-existing-attachment-note');
    if (attachmentNote) attachmentNote.hidden = !original.ek;
    const saveButton = document.getElementById('btn-islem-save');
    if (saveButton) saveButton.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzeltmeyi Kaydet';
    updateIslemTipiInfo();
    // The options renderer also restores unambiguous legacy work-order links.
    if (original.paymentInvoiceId != null) {
        document.getElementById('input-islem-payment-invoice-id').value = original.paymentInvoiceId;
    }
    updatePaymentInvoiceSummary();
    markModalFormClean('modal-islem');
};

function renderInvoiceOrderOptions(cariId) {
    const orderSelect = document.getElementById('input-islem-order-id');
    if (!orderSelect) return;

    const orders = getInvoiceableOrdersForCari(cariId);
    const options = [
        '<option value="">Serbest fatura / iş emri seçme</option>',
        ...orders.map(order => {
            const label = `${order.orderNo || 'İş Emri'} - ${formatCurrency(order.total)} - ${order.description || order.islemTipi || 'Teslim edilen iş'}`;
            return `<option value="${order.id}">${escapeHTML(label)}</option>`;
        })
    ];

    orderSelect.innerHTML = options.join('');
}

window.applySelectedOrderToInvoice = function() {
    const orderId = document.getElementById('input-islem-order-id')?.value;
    const tutarEl = document.getElementById('input-islem-tutar');
    const aciklamaEl = document.getElementById('input-islem-aciklama');
    if (!orderId || !tutarEl) return;

    const order = getDBArray('isEmirleri').find(o => o.id == orderId);
    if (!order) return;

    tutarEl.value = roundMoney(order.total);
    if (aciklamaEl && !plainText(aciklamaEl.value)) {
        aciklamaEl.value = `${order.orderNo || 'İş emri'} faturası - ${order.description || 'Teslim edilen iş'}`;
    }
};

function getCurrentIslemCari() {
    const cariId = parseInt(document.getElementById('input-islem-cari-id')?.value || '', 10);
    if (!Number.isFinite(cariId)) return null;
    return getDBArray('cariler').find(c => c.id === cariId) || null;
}

function getTahsilEdilebilirBorc(cari) {
    const invoice = getSelectedPaymentInvoice();
    if (invoice && invoiceMatchesCari(invoice, cari?.id, cari?.adi)) {
        return getInvoicePaymentSummary(invoice, document.getElementById('input-islem-edit-id')?.value).remaining ?? 0;
    }
    let effectiveBalance = Number(cari?.bakiye) || 0;
    const editId = document.getElementById('input-islem-edit-id')?.value || '';
    if (editId) {
        const original = getDBArray('islemler').find(item => String(item.id) === String(editId));
        if (original && String(original.cariId) === String(cari?.id)) {
            effectiveBalance = roundMoney(effectiveBalance - (Number(original.bakiyeDegisimi) || 0));
        }
    }
    return roundMoney(Math.max(effectiveBalance, 0));
}

window.fillFullTahsilatAmount = function() {
    const tutarEl = document.getElementById('input-islem-tutar');
    const cari = getCurrentIslemCari();
    if (!tutarEl || !cari) return;

    const borc = getTahsilEdilebilirBorc(cari);
    tutarEl.value = borc > 0 ? borc : '';
    updateTahsilatSummary();
};

window.updateTahsilatSummary = function() {
    const tip = document.getElementById('input-islem-tipi')?.value;
    const summaryEl = document.getElementById('tahsilat-summary');
    if (!summaryEl) return;

    if (tip !== 'tahsilat') {
        summaryEl.style.display = 'none';
        return;
    }

    const cari = getCurrentIslemCari();
    const borc = getTahsilEdilebilirBorc(cari);
    const tutar = roundMoney(parseFloat(document.getElementById('input-islem-tutar')?.value || '0') || 0);
    const kalan = roundMoney(Math.max(borc - tutar, 0));

    const label = document.getElementById('tahsilat-balance-label');
    if (label) label.textContent = getSelectedPaymentInvoice() ? 'Faturanın Kalan Tutarı' : 'Müşterinin Toplam Borcu';
    const currentEl = document.getElementById('tahsilat-current-balance');
    const enteredEl = document.getElementById('tahsilat-entered-amount');
    const remainingEl = document.getElementById('tahsilat-remaining-balance');

    if (currentEl) currentEl.textContent = formatCurrency(borc);
    if (enteredEl) enteredEl.textContent = formatCurrency(tutar);
    if (remainingEl) {
        remainingEl.textContent = formatCurrency(kalan);
        remainingEl.style.color = kalan === 0 && borc > 0 ? 'var(--success)' : 'var(--text-main)';
    }

    summaryEl.style.display = 'block';
};

function getCashMovementDelta(movement) {
    if (!movement) return 0;
    const amount = roundMoney(Number(movement.tutar) || 0);
    return movement.tip === 'cikis' ? -amount : amount;
}

// Back-dated entries keep the time of entry so same-day statement lines stay in recording order.
function getIslemDateTime(value) {
    const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${toTRDateFromInput(value)} ${time}`;
}

function saveCorrectedCariMovement(options = {}) {
    const {
        original, cari, tip, tipText, tutar, bakiyeArtisi,
        aciklama, kasaId, relatedOrder, paymentInvoice, isSuccess, isGelir, ek
    } = options;
    if (!original || !cari) return false;

    const originalCash = original.kasaHareketId
        ? getDBArray('kasaHareketleri').find(item => String(item.id) === String(original.kasaHareketId))
        : null;
    if (original.kasaHareketId && !originalCash) {
        alert('Eski kasa/banka hareketi bulunamadığı için düzeltme yapılamadı.');
        return false;
    }
    if (originalCash?.reversedBy) {
        alert('Eski kasa/banka hareketi daha önce geri alınmış. Düzeltme yapılamadı.');
        return false;
    }

    const originalDelta = roundMoney(Number(original.bakiyeDegisimi) || 0);
    const oldCashDelta = getCashMovementDelta(originalCash);
    const cashBalances = new Map(getDBArray('kasaHesaplari').map(account => [String(account.id), Number(account.bakiye) || 0]));
    const snapshot = {
        cariBalance: Number(cari.bakiye) || 0,
        islemLength: getDBArray('islemler').length,
        cashLength: getDBArray('kasaHareketleri').length,
        auditLength: getDBArray('denetimKayitlari').length,
        reversedBy: original.reversedBy || null,
        correctedBy: original.correctedBy || null,
        cashReversedBy: originalCash?.reversedBy || null
    };

    try {
        const reversal = addCariMovement(cari, {
            tip: `Düzeltme Ters Kaydı (${original.tip || 'Cari İşlem'})`,
            aciklama: `Hatalı kayıt düzeltme amacıyla ters çevrildi.${original.aciklama ? ` Önceki açıklama: ${original.aciklama}` : ''}`,
            tutar: original.tutar,
            bakiyeDegisimi: -originalDelta,
            isSuccess: false,
            isGelir: false,
            reversalOf: original.id,
            correctionReversal: true
        });
        if (!reversal) throw new Error('Düzeltme ters kaydı oluşturulamadı.');
        original.reversedBy = reversal.id;

        if (originalCash) {
            const cashReversal = reverseCashMovement(originalCash.id, `Cari hareketi düzeltildi: ${original.tip || 'Cari İşlem'}`);
            if (!cashReversal) throw new Error('Eski kasa/banka etkisi geri alınamadı.');
            reversal.kasaHareketId = cashReversal.id;
        }

        const corrected = addCariMovement(cari, {
            tip: tipText,
            aciklama: aciklama || (relatedOrder ? `${relatedOrder.orderNo || 'İş emri'} tahsilatı` : ''),
            tutar,
            bakiyeDegisimi: bakiyeArtisi,
            orderId: relatedOrder?.id || null,
            paymentInvoiceId: paymentInvoice?.id || null,
            orderNo: relatedOrder?.orderNo || '',
            isSuccess,
            isGelir,
            ek,
            correctionOf: original.id
        });
        if (!corrected) throw new Error('Düzeltilmiş cari hareketi oluşturulamadı.');

        let correctedCash = null;
        if (tip === 'tahsilat' || tip === 'odeme_yaptik') {
            correctedCash = addCashMovement(kasaId, {
                tip: tip === 'tahsilat' ? 'giris' : 'cikis',
                tutar,
                aciklama: `${cari.adi} - ${tipText} (Düzeltildi)`,
                kaynak: 'cari-islem-duzeltme',
                refId: corrected.id
            });
            if (!correctedCash) throw new Error('Düzeltilmiş kasa/banka hareketi oluşturulamadı.');
            corrected.kasaHareketId = correctedCash.id;
        }

        original.correctedBy = corrected.id;
        reversal.correctedBy = corrected.id;
        scheduleAttachmentArchive(ek, 'Cari Islemler', cari.adi);
        addAuditLog('Güncellendi', 'Cari İşlem', original.id, `${cari.adi} / ${original.tip || 'Cari İşlem'} ${formatCurrency(original.tutar || 0)} → ${tipText} ${formatCurrency(tutar)}`);
        saveDB();
        closeModal('modal-islem');
        document.getElementById('input-islem-edit-id').value = '';
        resetAttachmentInputs('input-islem-ek', 'input-islem-ek-not');
        renderCariler();
        renderDashboard();
        openCariDetay(cari.id);

        const newCashDelta = getCashMovementDelta(correctedCash);
        const impacts = [{ label: 'Cari', value: roundMoney(bakiyeArtisi - originalDelta) }];
        if (originalCash || correctedCash) impacts.push({ label: 'Kasa', value: roundMoney(newCashDelta - oldCashDelta) });
        showImpactSummary('İşlem düzeltildi', impacts, {
            message: `${formatCurrency(original.tutar || 0)} tutarındaki eski kayıt kapatıldı; ${formatCurrency(tutar)} tutarında düzeltilmiş kayıt oluşturuldu.`
        });
        return true;
    } catch (error) {
        db.islemler.splice(snapshot.islemLength);
        db.kasaHareketleri.splice(snapshot.cashLength);
        db.denetimKayitlari.splice(snapshot.auditLength);
        original.reversedBy = snapshot.reversedBy;
        original.correctedBy = snapshot.correctedBy;
        if (originalCash) originalCash.reversedBy = snapshot.cashReversedBy;
        cari.bakiye = snapshot.cariBalance;
        updateCariStatus(cari);
        getDBArray('kasaHesaplari').forEach(account => {
            if (cashBalances.has(String(account.id))) account.bakiye = cashBalances.get(String(account.id));
        });
        alert(`İşlem düzeltilemedi: ${error.message}`);
        return false;
    }
}

window.saveIslem = function() {
    if(document.getElementById('input-islem-tipi').value==='sac_alimi') return saveSheetPurchase();
    const editId = document.getElementById('input-islem-edit-id')?.value || '';
    const unlock = beginModalSubmit('modal-islem', editId ? 'Düzeltiliyor...' : 'Kaydediliyor...');
    if (!unlock) return;
    try {
        const original = editId ? getDBArray('islemler').find(item => String(item.id) === String(editId)) : null;
        if (editId && !original) return alert('Düzeltilecek cari hareketi bulunamadı.');
        if (original && !canEditCariMovement(original)) return alert('Bu hareket artık düzeltilemez. Listeyi yenileyip tekrar deneyin.');
        const cariId = parseInt(document.getElementById('input-islem-cari-id').value);
        const firmaAdi = document.getElementById('input-islem-firma-adi').value;
        const tip = document.getElementById('input-islem-tipi').value;
        const aciklama = document.getElementById('input-islem-aciklama')?.value || '';
        const faturaNo = document.getElementById('input-islem-fatura-no')?.value || '';
        const kasaId = document.getElementById('input-islem-kasa')?.value || '';
        const tarihInput = document.getElementById('input-islem-tarih')?.value || toDateInputValue(new Date());
        const linkedOrderId = tip === 'fatura_kes' ? (document.getElementById('input-islem-order-id')?.value || '') : '';
        const linkedOrder = linkedOrderId ? getDBArray('isEmirleri').find(o => o.id == linkedOrderId) : null;
        const paymentOrderId = tip === 'tahsilat' ? (document.getElementById('input-islem-payment-order-id')?.value || '') : '';
        const paymentOrder = paymentOrderId ? getDBArray('isEmirleri').find(o => o.id == paymentOrderId) : null;
        const paymentInvoice = getSelectedPaymentInvoice();
        const invoiceOrder = paymentInvoice?.orderId ? getDBArray('isEmirleri').find(order => String(order.id) === String(paymentInvoice.orderId)) : null;
        const relatedOrder = linkedOrder || (paymentInvoice ? invoiceOrder : paymentOrder);
        const tutar = linkedOrder ? roundMoney(linkedOrder.total) : parseFloat(document.getElementById('input-islem-tutar').value);
        const selectedFile = document.getElementById('input-islem-ek')?.files?.[0] || null;
        const newAttachment = getAttachmentFromInputs('input-islem-ek', 'input-islem-ek-not');
        const ek = original?.ek && !selectedFile
            ? { ...original.ek, note: plainText(document.getElementById('input-islem-ek-not')?.value || original.ek.note || '') }
            : (newAttachment || original?.ek || null);

        if (!Number.isFinite(tutar) || tutar <= 0) return alert("Geçerli bir tutar girin!");
        if (!original && financeDay(tarihInput) === null) return alert('Geçerli bir işlem tarihi seçin.');
        if (!original && financeDay(tarihInput) > financeDay(toDateInputValue(new Date()))) return alert('İşlem tarihi bugünden ileri olamaz. Gelecekteki ödemeler için Vade Planı kullanın.');
        const islemTarihi = getIslemDateTime(tarihInput);
        if (original && tip === 'fatura_kes') return alert('Fatura hareketleri cari geçmişinden düzeltilemez. Faturalar bölümünü kullanın.');
        if (tip === 'fatura_kes' && !faturaNo.trim()) return alert("Fatura kesmek için Fatura No girmek zorunludur!");
        if (tip === 'fatura_kes' && hasDuplicateInvoiceNo(faturaNo, { tur: 'kesilen' })) return alert('Bu fatura numarası daha önce kullanılmış. Farklı bir fatura numarası girin.');
        if (linkedOrder && linkedOrder.customerId != cariId) return alert("Seçilen iş emri bu cariye ait değil.");
        if (paymentOrder && paymentOrder.customerId != cariId) return alert("Ödeme bağlantısındaki iş emri bu cariye ait değil.");
        if (linkedOrder && linkedOrder.faturaKesildi === true) return alert("Bu iş emrinin faturası daha önce kesilmiş.");
        if ((tip === 'tahsilat' || tip === 'odeme_yaptik') && !kasaId) {
            return alert('Tahsilat veya ödeme için kasa/banka hesabı seçmek zorunludur.');
        }
        if ((tip === 'tahsilat' || tip === 'odeme_yaptik') && !getDBArray('kasaHesaplari').some(kasa => kasa.id == kasaId)) {
            return alert('Seçilen kasa/banka hesabı bulunamadı.');
        }

        const cari = db.cariler.find(c => c.id === cariId);
        if(!cari) return alert("Cari bulunamadı!");
        if (cari.systemRole === 'retail') return alert('Perakende hesabına kayıt için Hızlı Satış bölümünü kullanın. Veresiye satış için ayrı cari açın.');
        if (document.getElementById('input-islem-payment-invoice-id')?.value && !paymentInvoice) return alert('Seçilen fatura artık bulunamıyor. Fatura seçimini yenileyin.');
        if (paymentInvoice) {
            const expectedType = paymentInvoice.tur === 'kesilen' ? 'tahsilat' : 'odeme_yaptik';
            if (tip !== expectedType || !invoiceMatchesCari(paymentInvoice, cari.id, cari.adi)) return alert('Fatura, seçilen cari ve işlem tipiyle eşleşmiyor.');
            const summary = getInvoicePaymentSummary(paymentInvoice, original?.id);
            if (summary.legacy) return alert('Fatura detayından önceki ödeme bilgisini tamamlayın.');
            if (tutar > summary.remaining) return alert(`Bu faturanın kalan tutarı ${formatCurrency(summary.remaining)}. Fazla tutarı ayrı cari işlemi olarak kaydedin.`);
        }


        let isSuccess = false;
        let tipText = '';
        let bakiyeArtisi = 0;
        let isGelir = false;

        if (tip === 'tahsilat') {
            // Müşteri bize ödeme yaptı → borcu azalır
            tipText = 'Tahsilat (Gelen)';
            bakiyeArtisi = -tutar;
            isSuccess = true;
            isGelir = true;
        } else if (tip === 'fatura_kes') {
            tipText = linkedOrder ? `Fatura Kesildi (${faturaNo} / ${linkedOrder.orderNo})` : `Fatura Kesildi (${faturaNo})`;
            bakiyeArtisi = linkedOrder && linkedOrder.bakiyeCariyeYansitildi === true ? 0 : tutar;
            isSuccess = false;
            isGelir = false;
        } else if (tip === 'mal_alimi') {
            // Firmadan mal aldık → biz borçlandık
            tipText = 'Mal Alımı';
            bakiyeArtisi = -tutar;
            isSuccess = false;
            isGelir = false;
        } else if (tip === 'odeme_yaptik') {
            // Firmaya ödeme yaptık → borcumuz azaldı
            tipText = 'Ödeme Yaptık (Çıkan)';
            bakiyeArtisi = tutar;
            isSuccess = true;
            isGelir = false;
        }

        if (original) {
            return saveCorrectedCariMovement({
                original,
                cari,
                tip,
                tipText,
                tutar,
                bakiyeArtisi,
                aciklama,
                kasaId,
                relatedOrder,
                paymentInvoice,
                isSuccess,
                isGelir,
                ek
            });
        }

        const eskiBakiye = cari.bakiye || 0;
        const hareket = addCariMovement(cari, {
            tip: tipText,
            aciklama: linkedOrder && bakiyeArtisi === 0
                ? `${aciklama || `${linkedOrder.orderNo} faturası`}. Cari borç teslim aşamasında işlendiği için tekrar borç eklenmedi.`
                : (aciklama || (paymentOrder ? `${paymentOrder.orderNo || 'İş emri'} tahsilatı` : '')),
            faturaNo: faturaNo,
            tutar: tutar,
            bakiyeDegisimi: bakiyeArtisi,
            orderId: relatedOrder?.id || null,
            paymentInvoiceId: paymentInvoice?.id || null,
            orderNo: relatedOrder?.orderNo || '',
            isSuccess: isSuccess,
            isGelir: isGelir,
            ek,
            tarih: islemTarihi
        });
        scheduleAttachmentArchive(ek, 'Cari Islemler', cari.adi);

        let cashMovement = null;
        if (tip === 'tahsilat' || tip === 'odeme_yaptik') {
            cashMovement = addCashMovement(kasaId, {
                tip: tip === 'tahsilat' ? 'giris' : 'cikis',
                tutar,
                aciklama: `${cari.adi} - ${tipText}`,
                kaynak: 'cari-islem',
                refId: hareket?.id || null,
                tarih: islemTarihi
            });
            if (!cashMovement) {
                db.islemler = getDBArray('islemler').filter(item => String(item.id) !== String(hareket?.id));
                cari.bakiye = eskiBakiye;
                updateCariStatus(cari);
                return alert('Kasa/banka hareketi oluşturulamadı. İşlem kaydedilmedi.');
            }
            if (hareket) hareket.kasaHareketId = cashMovement.id;
        }

        if (tip === 'fatura_kes') {
            if (!db.faturalar) db.faturalar = [];
            const faturaId = createRecordId();
            if (hareket) hareket.faturaId = faturaId;
            db.faturalar.push({
                id: faturaId,
                tur: 'kesilen',
                faturaNo: faturaNo,
                cariId: cari.id,
                firma: cari.adi,
                aciklama: linkedOrder ? (aciklama || `${linkedOrder.orderNo} faturası`) : aciklama,
                tutar: tutar,
                tarih: toTRDateFromInput(tarihInput),
                faturaTarihi: toTRDateFromInput(tarihInput),
                cariYansitildi: true,
                cariBakiyeDegisimi: bakiyeArtisi,
                cariIslemId: hareket?.id || null,
                orderId: linkedOrder?.id || null,
                orderNo: linkedOrder?.orderNo || '',
                ek,
                paymentTrackingVersion: 1,
                odemeDurumu: 'odenmedi',
                ...(linkedOrder ? { matrah: getOrderStatementAmounts(linkedOrder).subTotal, kdvOrani: getOrderStatementAmounts(linkedOrder).taxRate, kdvTutari: getOrderStatementAmounts(linkedOrder).tax, discountAmount: linkedOrder.discountAmount, discountPercent: linkedOrder.discountPercent } : {}),
                kaynak: linkedOrder ? 'is-emri-faturasi' : 'cari-islem-faturasi'
            });
        }

        if (linkedOrder) {
            linkedOrder.faturaKesildi = true;
            linkedOrder.faturaNo = faturaNo;
            linkedOrder.faturaTarihi = toTRDateFromInput(tarihInput);
            if (bakiyeArtisi !== 0) {
                linkedOrder.bakiyeCariyeYansitildi = true;
            }
        }

        addAuditLog('Oluşturuldu', 'Cari İşlem', hareket?.id, `${cari.adi} / ${tipText} / ${formatCurrency(tutar)}`);

        saveDB();
        closeModal('modal-islem');

        // Formu temizle
        const aciklamaEl = document.getElementById('input-islem-aciklama');
        if (aciklamaEl) aciklamaEl.value = '';
        const faturaNoEl = document.getElementById('input-islem-fatura-no');
        if (faturaNoEl) faturaNoEl.value = '';
        const orderEl = document.getElementById('input-islem-order-id');
        if (orderEl) orderEl.value = '';
        const paymentOrderEl = document.getElementById('input-islem-payment-order-id');
        if (paymentOrderEl) paymentOrderEl.value = '';
        const kasaEl = document.getElementById('input-islem-kasa');
        if (kasaEl) kasaEl.value = '';
        document.getElementById('input-islem-tutar').value = '';
        resetAttachmentInputs('input-islem-ek', 'input-islem-ek-not');

        // Sayfayı yenile — cari listesini ve detayı güncelle
        renderCariler();
        renderDashboard();

        // Kullanıcıya bilgi ver
        const yeniBakiye = cari.bakiye;
        const impacts = [{ label: 'Cari', value: bakiyeArtisi }];
        if (cashMovement) impacts.push({ label: 'Kasa', value: tip === 'tahsilat' ? tutar : -tutar });
        showImpactSummary(`${tipText} kaydedildi`, impacts, {
            message: `${cari.adi}: ${formatCurrency(eskiBakiye)} → ${formatCurrency(yeniBakiye)}`,
            actions: relatedOrder ? [{ label: `${relatedOrder.orderNo || 'İş emri'} bağlantıları`, onClick: () => openOrderHistory(relatedOrder.id) }] : []
        });

    } catch(e) {
        alert("İşlem kaydedilirken hata oluştu: " + e.message);
    } finally {
        unlock();
    }
}

window.switchDetayTab = function(tab) {
    document.getElementById('detay-tab-ekstre-content').style.display = tab === 'ekstre' ? 'block' : 'none';
    document.getElementById('detay-tab-stok-content').style.display = tab === 'stok' ? 'block' : 'none';
    document.getElementById('btn-tab-ekstre').classList.toggle('active', tab === 'ekstre');
    document.getElementById('btn-tab-stok').classList.toggle('active', tab === 'stok');
};

window.openDetayModal = function(id) {
    const cari = db.cariler.find(c => c.id === id);
    if (!cari) return;

    document.getElementById('detay-title').textContent = `${cari.adi} - Cari Detay`;
    document.getElementById('detay-bakiye').textContent = formatCurrency(cari.bakiye);
    
    // Status Badge
    const badgeContainer = document.getElementById('detay-badge-container');
    let durumClass = 'success';
    if (cari.bakiye < 0) durumClass = 'warning';
    else if (cari.bakiye > 0) durumClass = 'info';
    badgeContainer.innerHTML = `<span class="badge ${durumClass}" style="padding:8px 16px; font-size:14px;">${escapeHTML(cari.durum)}</span>`;

    const details = document.getElementById('detay-cari-bilgileri');
    if (details) {
        const typeLabel = cari.cariTuru === 'tedarikci' ? 'Tedarikçi' : (['her_ikisi', 'musteri_tedarikci'].includes(cari.cariTuru) ? 'Müşteri + Tedarikçi' : 'Müşteri');
        const facts = [
            ['Cari tipi', typeLabel],
            ['Yetkili', cari.yetkili || '-'],
            ['Telefon', cari.tel || '-'],
            ['E-posta', cari.email || '-'],
            ['Vergi bilgisi', [cari.vergiDairesi, cari.vergiNo].filter(Boolean).join(' / ') || '-'],
            ['Vade', `${Math.max(0, Number(cari.vadeGun) || 0)} gün`],
            ['IBAN', cari.iban || '-'],
            ['Adres', cari.adres || '-']
        ];
        details.innerHTML = facts.map(([label, value]) => `<div class="detail-fact"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join('');
    }

    // Transactions
    const tbody = document.getElementById('detay-tbody');
    tbody.innerHTML = '';
    const islemler = db.islemler.filter(i => i.cariId != null ? i.cariId == id : i.firma === cari.adi);
    islemler.reverse().forEach(islem => {
        // Tahsilat = yeşil (ödeme geldi), Fatura = sarı (borç oluştu), Mal alımı = kırmızı, Ödeme yaptık = mavi
        let colorClass = 'text-alert';
        if (islem.isSuccess && islem.isGelir) colorClass = 'text-success'; // Tahsilat
        else if (!islem.isSuccess && !islem.isGelir && islem.tip.includes('Fatura')) colorClass = 'text-warning'; // Fatura
        else if (islem.isSuccess && !islem.isGelir) colorClass = 'text-info'; // Ödeme yaptık
        
        const islemSign = islem.tip.includes('Tahsilat') ? '-' : 
                          (islem.tip.includes('Fatura') ? '+' : 
                          (islem.tip.includes('Mal') ? '-' : '+'));
        
        tbody.innerHTML += `<tr>
            <td>${escapeHTML(islem.tarih)}</td>
            <td><strong>${escapeHTML(islem.tip)}</strong>${islem.movementNo ? '<br><span class="dashboard-muted-text">'+escapeHTML(islem.movementNo)+'</span>' : ''}${islem.aciklama ? `<br><span style="font-size:11px; color:var(--text-muted);">${escapeHTML(islem.aciklama)}</span>` : ''}</td>
            <td class="${colorClass}" style="text-align:right; font-weight:600;">${islemSign}${formatCurrency(islem.tutar)}</td>
        </tr>`;
    });

    // Consignment Stocks
    const stokTbody = document.getElementById('detay-stok-tbody');
    stokTbody.innerHTML = '';
    const carininStoklari = db.stoklar.filter(s => s.cariId == id);
    if (carininStoklari.length === 0) {
        stokTbody.innerHTML = renderTableEmptyState(4, 'Bu müşteriye ait emanet malzeme yok.', 'Müşteriye bağlı stok girişleri burada görünecek.', 'fa-box');
    } else {
        carininStoklari.forEach(s => {
            stokTbody.innerHTML += `<tr>
                <td>${escapeHTML(getStockDisplayCode(s))}</td>
                <td>${escapeHTML(s.cinsi)}</td>
                <td>${escapeHTML(s.mm)} mm</td>
                <td><strong>${s.miktar} Plaka</strong></td>
            </tr>`;
        });
    }

    switchDetayTab('ekstre');
    openModal('modal-cari-detay');
}

window.openStatModal = function(type) {
    window.currentStatType = type;
    window.pageStatDetail = 1;
    window.currentStatData = [];

    const title = document.getElementById('stat-detail-title');
    const kicker = document.getElementById('stat-detail-kicker');
    const thead = document.getElementById('stat-detail-thead');
    if (!title || !thead) return;

    const searchInput = document.getElementById('stat-detail-search');
    if (searchInput) searchInput.value = '';

    if (type === 'gelir') {
        if (kicker) kicker.textContent = 'Finansal hareketler';
        title.textContent = 'Toplam Gelir Detayları';
        thead.innerHTML = '<tr><th>Tarih</th><th>Firma</th><th>İşlem</th><th>Tutar</th></tr>';
        window.currentStatData = (db.islemler || []).filter(isActiveIncomeMovement).reverse();
    } else if (type === 'alacak') {
        if (kicker) kicker.textContent = 'Finansal dağılım';
        title.textContent = 'Kimlerden Alacaklıyız?';
        thead.innerHTML = '<tr><th>Firma / Cari</th><th>İletişim</th><th>Durum</th><th>Alacağımız</th><th>İşlem</th></tr>';
        window.currentStatData = (db.cariler || [])
            .filter(c => Number(c.bakiye) > 0)
            .sort((a, b) => Number(b.bakiye) - Number(a.bakiye));
    } else if (type === 'borc') {
        if (kicker) kicker.textContent = 'Finansal dağılım';
        title.textContent = 'Kimlere Borçluyuz?';
        thead.innerHTML = '<tr><th>Firma / Cari</th><th>İletişim</th><th>Durum</th><th>Borcumuz</th><th>İşlem</th></tr>';
        window.currentStatData = (db.cariler || [])
            .filter(c => Number(c.bakiye) < 0)
            .sort((a, b) => Math.abs(Number(b.bakiye)) - Math.abs(Number(a.bakiye)));
    } else if (type === 'teklif') {
        if (kicker) kicker.textContent = 'Operasyon dağılımı';
        title.textContent = 'Onaylanan ve Bekleyen İşler';
        thead.innerHTML = '<tr><th>Müşteri</th><th>İş Tanımı</th><th>Tutar</th><th>Durum</th></tr>';
        window.currentStatData = (db.isEmirleri || []).filter(o => o.durum !== 'Teslim Edildi').reverse();
    } else if (type === 'teslimat_hepsi') {
        if (kicker) kicker.textContent = 'Teslimat geçmişi';
        title.textContent = 'Tüm Teslim Edilen İşler';
        thead.innerHTML = '<tr><th>Müşteri</th><th>İş Tanımı</th><th>Tarih</th><th>Tutar</th></tr>';
        window.currentStatData = (db.isEmirleri || []).filter(o => o.durum === 'Teslim Edildi').reverse();
    }

    const isBalanceDetail = type === 'alacak' || type === 'borc';
    const summary = document.getElementById('stat-detail-summary');
    const searchWrap = document.getElementById('stat-detail-search-wrap');
    if (searchWrap) searchWrap.hidden = !isBalanceDetail;
    if (summary) {
        summary.hidden = !isBalanceDetail;
        summary.classList.toggle('is-payable', type === 'borc');
    }
    if (isBalanceDetail) {
        const count = window.currentStatData.length;
        const total = window.currentStatData.reduce((sum, cari) => sum + Math.abs(Number(cari.bakiye) || 0), 0);
        const summaryIcon = document.getElementById('stat-detail-summary-icon');
        const summaryLabel = document.getElementById('stat-detail-summary-label');
        const summaryCount = document.getElementById('stat-detail-summary-count');
        const summaryTotal = document.getElementById('stat-detail-summary-total');
        if (summaryIcon) summaryIcon.innerHTML = `<i class="fa-solid ${type === 'borc' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}" aria-hidden="true"></i>`;
        if (summaryLabel) summaryLabel.textContent = type === 'borc' ? 'Ödeme yapacağımız firmalar' : 'Tahsilat yapacağımız müşteriler';
        if (summaryCount) summaryCount.textContent = `${count} firma`;
        if (summaryTotal) summaryTotal.textContent = formatCurrency(total);
    }
    
    renderStatModal();
    openModal('modal-stat-detail');
}

window.renderStatModal = function() {
    const tbody = document.getElementById('stat-detail-tbody');
    const paginationContainer = document.getElementById('stat-detail-pagination-container');
    if (!tbody || !window.currentStatData) return;

    const isBalanceDetail = window.currentStatType === 'alacak' || window.currentStatType === 'borc';
    const search = isBalanceDetail
        ? String(document.getElementById('stat-detail-search')?.value || '').trim().toLocaleLowerCase('tr-TR')
        : '';
    const filteredData = search
        ? window.currentStatData.filter(cari => [cari.adi, codeSearchText(cari), cari.tel, cari.telefon]
            .some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(search)))
        : window.currentStatData;
    const itemsPerPage = getListPageSize('stat-detail');
    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    
    if (window.pageStatDetail > totalPages) window.pageStatDetail = totalPages;
    if (window.pageStatDetail < 1) window.pageStatDetail = 1;

    const startIndex = (window.pageStatDetail - 1) * itemsPerPage;
    const paginatedItems = filteredData.slice(startIndex, startIndex + itemsPerPage);

    // Update UI
    if (filteredData.length > itemsPerPage) {
        if(paginationContainer) paginationContainer.style.display = 'flex';
        const pageInfo = document.getElementById('stat-detail-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageStatDetail, totalPages, filteredData.length, itemsPerPage);

        const btnPrev = document.getElementById('btn-stat-detail-prev');
        const btnNext = document.getElementById('btn-stat-detail-next');
        if (btnPrev) btnPrev.disabled = window.pageStatDetail <= 1;
        if (btnNext) btnNext.disabled = window.pageStatDetail >= totalPages;
    } else {
        if(paginationContainer) paginationContainer.style.display = 'none';
    }

    if (window.currentStatType === 'gelir') {
        tbody.innerHTML = paginatedItems.map(i => `
            <tr><td>${escapeHTML(i.tarih || '-')}</td><td>${escapeHTML(i.firma || '-')}</td><td>${escapeHTML(i.tip || '-')}</td><td class="text-info">${formatCurrency(i.tutar)}</td></tr>
        `).join('') || renderTableEmptyState(4, 'Gelir kaydı bulunamadı.', 'Finansal hareketler oluştukça burada listelenecek.', 'fa-arrow-trend-up');
    } else if (isBalanceDetail) {
        const isPayable = window.currentStatType === 'borc';
        tbody.innerHTML = paginatedItems.map(c => `
            <tr class="stat-detail-account-row ${isPayable ? 'is-payable' : 'is-receivable'}">
                <td><strong>${escapeHTML(c.adi || '-')}</strong><span class="stat-detail-account-code">${escapeHTML(c.kodu || 'Cari kodu yok')}</span></td>
                <td>${c.tel || c.telefon
                    ? `<span class="stat-detail-contact"><i class="fa-solid fa-phone" aria-hidden="true"></i>${escapeHTML(c.tel || c.telefon)}</span>`
                    : '<span class="stat-detail-contact is-empty"><i class="fa-solid fa-phone-slash" aria-hidden="true"></i>Telefon yok</span>'}</td>
                <td><span class="status-pill ${isPayable ? 'error' : 'pending'}"><i class="fa-solid ${isPayable ? 'fa-calendar-day' : 'fa-clock'}" aria-hidden="true"></i>${isPayable ? 'Ödeme Bekliyor' : 'Tahsil Bekliyor'}</span></td>
                <td class="${isPayable ? 'text-alert' : 'text-success'} stat-detail-balance">${formatCurrency(Math.abs(Number(c.bakiye) || 0))}</td>
                <td><button type="button" class="btn btn-outline stat-detail-open-account" onclick="openAccountFromStat(${escapeJSStringForAttr(c.id)})"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Cariyi Aç</button></td>
            </tr>
        `).join('') || renderTableEmptyState(5,
            search ? 'Aramanızla eşleşen cari bulunamadı.' : (isPayable ? 'Ödenecek cari bakiyesi bulunamadı.' : 'Tahsil edilecek cari bakiyesi bulunamadı.'),
            search ? 'Farklı bir firma adı, cari kodu veya telefon deneyin.' : 'Cari bakiyeleri değiştikçe liste otomatik güncellenecek.',
            isPayable ? 'fa-building-circle-exclamation' : 'fa-wallet');
    } else if (window.currentStatType === 'teklif') {
        tbody.innerHTML = paginatedItems.map(o => `
            <tr><td>${escapeHTML(o.customerName || '-')}</td><td>${escapeHTML(o.description || '-')}</td><td>${formatCurrency(o.total)}</td><td><span class="badge warning">${escapeHTML(o.durum || 'Beklemede')}</span></td></tr>
        `).join('') || renderTableEmptyState(4, 'Bekleyen iş bulunamadı.', 'Onaylanan teklifler bu listede görünecek.', 'fa-list-check');
    } else if (window.currentStatType === 'teslimat_hepsi') {
        tbody.innerHTML = paginatedItems.map(o => `
            <tr><td>${escapeHTML(o.customerName || '-')}</td><td>${escapeHTML(o.description || '-')}</td><td>${escapeHTML(o.tarih || '-')}</td><td>${formatCurrency(o.total)}</td></tr>
        `).join('') || renderTableEmptyState(4, 'Teslim edilen iş bulunamadı.', 'Tamamlanan teslimatlar burada listelenecek.', 'fa-truck-fast');
    }
}

window.filterStatDetails = function() {
    window.pageStatDetail = 1;
    renderStatModal();
}

window.openAccountFromStat = function(id) {
    closeModal('modal-stat-detail');
    openCariDetay(id);
}

window.prevStatPage = function() {
    if (window.pageStatDetail > 1) {
        window.pageStatDetail--;
        renderStatModal();
    }
}

window.nextStatPage = function() {
    window.pageStatDetail++;
    renderStatModal();
}



let cariTabFilter = 'tuumu';

window.setCariTab = function(tab) {
    cariTabFilter = tab;
    window.pageAccounts = 1;
    // Update button styles
    ['tumumu', 'alacakli', 'borclu'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = t === tab ? 'btn btn-primary' : 'btn btn-outline';
        }
    });
    renderCariler();
};

window.navigateTo = function(page, tab) {
    const navItem = document.querySelector(`[data-target="${page}"]`);
    if (navItem) navItem.click();
    if (tab) {
        setTimeout(() => setCariTab(tab), 100);
    }
};

function getCariMovementOwner(islem) {
    if (!islem) return '';
    if(islem.sheetPurchase || islem.sheetPurchasePaymentFor) return 'Sac Alımı';
    if (islem.quickSaleId) return 'Hızlı Satış';
    if (islem.orderId && !isIncomeMovement(islem)) return 'İş Emri';
    if (islem.faturaId || getDBArray('faturalar').some(item => String(item.cariIslemId) === String(islem.id))) return 'Fatura';
    if (getDBArray('cekSenetler').some(item => String(item.cariIslemId) === String(islem.id))) return 'Çek / Senet';
    if (getDBArray('odemePlanlari').some(item => String(item.cariIslemId) === String(islem.id))) return 'Vade Planı';
    return '';
}

function canReverseCariMovement(islem) {
    if(islem?.sheetPurchase) return !islem.reversedBy;
    return !!islem && !islem.reversedBy && !islem.reversalOf && !getCariMovementOwner(islem);
}

window.reverseCariMovement = function(id) {
    const original = getDBArray('islemler').find(item => String(item.id) === String(id));
    if (!original) return alert('Cari hareketi bulunamadı.');
    if(original.sheetPurchase)return cancelSheetPurchase(original.id);
    if (original.reversedBy) return alert('Bu cari hareketi daha önce geri alınmış.');
    if (original.reversalOf) return alert('Ters kayıt yeniden geri alınamaz.');

    const owner = getCariMovementOwner(original);
    if (owner) return alert(`Bu hareket ${owner} kaydına bağlı. İptal veya silme işlemini ilgili modülden yapın.`);

    const cari = findCariByReference(original.cariId, original.firma);
    if (!cari) return alert('Cari bulunamadığı için hareket geri alınamadı.');
    confirmAction(`${original.tip || 'Cari işlemi'} geri alınsın mı?\n\nCari ve kasa/banka etkisi ters kayıtla düzeltilecek.`, () => {
        if (!getDBArray('islemler').includes(original) || !canReverseCariMovement(original) ||
            findCariByReference(original.cariId, original.firma) !== cari) {
            return alert('Bu işlem değişti veya daha önce geri alındı. Listeyi yenileyin.');
        }
        const originalDelta = roundMoney(Number(original.bakiyeDegisimi) || 0);
        const originalCash = original.kasaHareketId
            ? getDBArray('kasaHareketleri').find(item => String(item.id) === String(original.kasaHareketId))
            : null;
        if (original.kasaHareketId && (!originalCash || originalCash.reversedBy)) {
            return alert('Bağlı kasa/banka hareketi bulunamadı veya daha önce geri alındı. İşlem değiştirilmedi.');
        }
        const reversal = addCariMovement(cari, {
            tip: `İşlem Geri Alındı (${original.tip || 'Cari İşlem'})`,
            aciklama: `Hatalı işlem ters kayıtla geri alındı.${original.aciklama ? ` Önceki açıklama: ${original.aciklama}` : ''}`,
            tutar: original.tutar,
            bakiyeDegisimi: -originalDelta,
            isSuccess: false,
            isGelir: false,
            reversalOf: original.id
        });

        if (!reversal) return alert('Ters cari hareketi oluşturulamadı.');
        original.reversedBy = reversal.id;

        if (original.kasaHareketId) {
            const cashReversal = reverseCashMovement(original.kasaHareketId, `Cari işlemi geri alındı: ${original.tip || 'Cari İşlem'}`);
            if (!cashReversal) {
                db.islemler = getDBArray('islemler').filter(item => String(item.id) !== String(reversal.id));
                original.reversedBy = null;
                cari.bakiye = roundMoney((Number(cari.bakiye) || 0) + originalDelta);
                updateCariStatus(cari);
                return alert('Kasa/banka hareketi geri alınamadığı için cari işleminde değişiklik yapılmadı.');
            }
            reversal.kasaHareketId = cashReversal.id;
        }

        addAuditLog('Geri Alındı', 'Cari İşlem', original.id, `${cari.adi} / ${original.tip || 'Cari İşlem'} / ${formatCurrency(original.tutar || 0)}`);
        saveDB();
        openCariDetay(cari.id);
        const impacts = [{ label: 'Cari', value: -originalDelta }];
        if (originalCash) impacts.push({ label: 'Kasa', value: originalCash.tip === 'giris' ? -originalCash.tutar : originalCash.tutar });
        showImpactSummary('İşlem geri alındı', impacts, { message: 'Cari ve varsa kasa etkisi ters kayıtla düzeltildi.' });
    }, { title: 'İşlemi Geri Al', confirmLabel: 'Geri Al' });
};

window.updateIslemTipiInfo = function() {
    const tip = document.getElementById('input-islem-tipi')?.value;
    const infoEl = document.getElementById('islem-tipi-info');
    const faturaContainer = document.getElementById('fatura-no-container');
    const faturaOrderContainer = document.getElementById('islem-fatura-order-container');
    const kasaContainer = document.getElementById('islem-kasa-container');
    if (!infoEl) return;
    const buying=tip==='sac_alimi';document.getElementById('sheet-purchase-fields').hidden=!buying;
    // Corrections are booked on the day they are made so printed periods stay unchanged.
    const dateContainer=document.getElementById('islem-tarih-container');if(dateContainer)dateContainer.hidden=buying||!!document.getElementById('input-islem-edit-id')?.value;
    const amountInput=document.getElementById('input-islem-tutar');if(!buying&&amountInput.dataset.turkishMoney==='true'){const amount=parseSheetPurchaseDocumentTotal(amountInput.value);amountInput.value=Number.isFinite(amount)?String(amount):'';}amountInput.readOnly=false;amountInput.type=buying?'text':'number';amountInput.inputMode=buying?'decimal':'';amountInput.dataset.turkishMoney=buying?'true':'false';document.getElementById('sheet-purchase-amount-help').hidden=!buying;
    document.getElementById('input-islem-tutar-label').textContent=buying?'Kaydedilecek toplam alış tutarı (₺)':'Tutar (₺)';
    if(buying)updateSheetPurchaseSummary();
    const msgs = {
        'tahsilat': '🟢 Müşteri size ödeme yaptı. Müşterinin borcu azalacak.',
        'fatura_kes': '🟡 Teslim edilmiş iş seçerseniz tutar otomatik gelir ve cari borç ikinci kez artmaz. Serbest fatura seçerseniz yeni borç oluşturur.',
        'sac_alimi': 'Alınan sac stoğa girer; alış tutarı tedarikçiye borç olarak kaydedilir.',
        'mal_alimi': '🔴 Firmadan mal/hizmet aldınız. Siz o firmaya borçlandınız.',
        'odeme_yaptik': '🟢 Firmaya ödeme yaptınız. O firmaya olan borcunuz azalacak.'
    };
    infoEl.textContent = msgs[tip] || '';
    infoEl.style.color = (tip === 'mal_alimi' || tip === 'fatura_kes') ? 'var(--warning)' : 'var(--success)';
    // Fatura no alanını sadece fatura_kes için göster
    if (faturaContainer) {
        faturaContainer.style.display = (tip === 'fatura_kes') ? 'block' : 'none';
    }
    if (faturaOrderContainer) {
        faturaOrderContainer.style.display = (tip === 'fatura_kes') ? 'block' : 'none';
    }
    if (kasaContainer) {
        kasaContainer.style.display = (tip === 'tahsilat' || tip === 'odeme_yaptik') ? 'block' : 'none';
    }
    renderPaymentInvoiceOptions();
    updateTahsilatSummary();
};

function renderCariler() {
    const tbody = document.getElementById('accounts-tbody');
    if (!tbody) return;
    
    const cariler = getDBArray('cariler');
    const search = document.getElementById('cari-search')?.value.toLowerCase() || '';
    
    let filtered = cariler.filter(c => 
        c.adi.toLowerCase().includes(search) || 
        c.kodu.toLowerCase().includes(search)
    );

    // Tab filtresi
    if (cariTabFilter === 'alacakli') {
        filtered = filtered.filter(c => c.bakiye > 0); // Bize borçlular
    } else if (cariTabFilter === 'borclu') {
        filtered = filtered.filter(c => c.bakiye < 0); // Biz borçluyuz
    }

    filtered = applyListSort('accounts', filtered, {
        name: item => item.adi || '',
        contact: item => item.tel || item.telefon || '',
        balance: item => Number(item.bakiye) || 0,
        status: item => item.isPasif ? 'Pasif' : (Number(item.bakiye) > 0 ? 'Tahsil' : (Number(item.bakiye) < 0 ? 'Ödeme' : 'Kapalı'))
    });

    // Sayfalama (Pagination) - Cariler
    window.pageAccounts = window.pageAccounts || 1;
    const itemsPerPage = getListPageSize('accounts');
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    
    if (window.pageAccounts > totalPages) window.pageAccounts = totalPages;
    if (window.pageAccounts < 1) window.pageAccounts = 1;

    const startIndex = (window.pageAccounts - 1) * itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, startIndex + itemsPerPage);

    // Update pagination UI
    const pageInfo = document.getElementById('accounts-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pageAccounts, totalPages, filtered.length, itemsPerPage);

    const btnPrev = document.getElementById('btn-accounts-prev');
    const btnNext = document.getElementById('btn-accounts-next');
    
    if (btnPrev) btnPrev.disabled = window.pageAccounts <= 1;
    if (btnNext) btnNext.disabled = window.pageAccounts >= totalPages;

        tbody.innerHTML = paginatedItems.map(c => {
            const cariName = String(c.adi || 'İsimsiz Cari');
            const initials = cariName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map(part => part.charAt(0).toLocaleUpperCase('tr-TR'))
                .join('') || 'C';
            const phone = String(c.tel || c.telefon || '').trim();
            const hasPhone = !!phone && phone !== '-';
            const balanceClass = c.bakiye > 0 ? 'is-receivable' : (c.bakiye < 0 ? 'is-payable' : 'is-settled');
            const balanceLabel = c.bakiye > 0 ? 'Müşteriden alacağımız' : (c.bakiye < 0 ? 'Bizim ödeyeceğimiz' : 'Bakiye bulunmuyor');
            const balanceIcon = c.bakiye > 0 ? 'fa-arrow-down' : (c.bakiye < 0 ? 'fa-arrow-up' : 'fa-check');
            const statusHTML = c.isPasif
                ? '<span class="status-pill warning"><i class="fa-solid fa-pause" aria-hidden="true"></i> Pasif</span>'
                : `<span class="status-pill ${c.bakiye === 0 ? 'completed' : (c.bakiye > 0 ? 'pending' : 'error')}"><i class="fa-solid ${c.bakiye === 0 ? 'fa-check' : (c.bakiye > 0 ? 'fa-clock' : 'fa-calendar-day')}" aria-hidden="true"></i> ${c.bakiye === 0 ? 'Bakiye Yok' : (c.bakiye > 0 ? 'Tahsil Bekliyor' : 'Ödeme Bekliyor')}</span>`;
            return `
        <tr class="account-list-row ${balanceClass}${c.isPasif ? ' is-passive' : ''}">
            ${renderSelectionCell('accounts', c.id)}
            <td class="account-identity-cell">
                <button type="button" class="account-identity-button" onclick="openCariDetay(${c.id})">
                    <span class="account-avatar" aria-hidden="true">${escapeHTML(initials)}</span>
                    <span class="account-identity-copy">
                        <strong>${escapeHTML(cariName)}</strong>
                        <span><span class="account-code">${escapeHTML(c.kodu || '-')}</span>${c.isPasif ? '<span class="account-passive-note">Pasif kayıt</span>' : ''}</span>
                    </span>
                    <i class="fa-solid fa-chevron-right account-open-icon" aria-hidden="true"></i>
                </button>
            </td>
            <td class="account-contact-cell">
                ${hasPhone
                    ? `<span class="account-contact-value"><i class="fa-solid fa-phone" aria-hidden="true"></i>${escapeHTML(phone)}</span>`
                    : '<span class="account-contact-empty"><i class="fa-solid fa-phone-slash" aria-hidden="true"></i>Telefon eklenmemiş</span>'}
            </td>
            <td class="account-balance-cell ${balanceClass}">
                <strong>${formatCurrency(Math.abs(c.bakiye))}</strong>
                <span><i class="fa-solid ${balanceIcon}" aria-hidden="true"></i>${balanceLabel}</span>
            </td>
            <td class="account-status-cell">
                ${statusHTML}
            </td>
            <td class="account-actions-cell">
                <div class="account-row-actions" role="group" aria-label="Cari işlemleri">
                    <button class="btn table-action-button account-action-add" title="Tahsilat veya ödeme hareketi ekle" onclick="openIslemModal(${c.id}, ${escapeJSStringForAttr(c.adi)})">
                        <span class="account-action-icon" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
                        <span>İşlem Ekle</span>
                    </button>
                    <div class="account-action-secondary-group">
                        <button class="btn table-action-button account-action-edit" aria-label="Cari bilgilerini düzenle" title="Cari bilgilerini düzenle" onclick="editCari('${c.id}')">
                            <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i><span>Düzenle</span>
                        </button>
                        <button class="btn table-action-button account-action-delete" aria-label="Cari hesabını sil" title="Cari hesabını sil" onclick="deleteCari('${c.id}')">
                            <i class="fa-solid fa-trash-can" aria-hidden="true"></i><span>Sil</span>
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    `}).join('') || renderTableEmptyState(6, 'Bu filtrede cari kaydı bulunamadı.', 'Filtreyi temizleyin veya yeni bir cari ekleyin.', 'fa-users');
    updateReportSelectionUI('accounts');
    renderPaymentPlans();

    // Populate all customer dropdowns
    const aktifCariler = cariler.filter(c => !c.isPasif && c.systemRole !== 'retail');
    const options = '<option value="">Seçiniz...</option>' + 
        '<option value="internal" style="font-weight:bold; color:var(--primary);">--- Kendi İşletmem (Firma İçi Üretim) ---</option>' +
        aktifCariler.map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu)})</option>`).join('');
    
    ['quote-customer', 'input-stok-cari', 'input-duzenle-stok-cari', 'input-fire-cari', 'input-fatura-firma', 'input-ceksenet-cari', 'input-plan-cari', 'input-gider-cari'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = options;
            if (currentVal && cariler.some(c => c.id == currentVal)) {
                el.value = currentVal;
            }
        }
    });
}

window.prevAccountsPage = function() {
    if (window.pageAccounts > 1) {
        window.pageAccounts--;
        renderCariler();
    }
}

window.nextAccountsPage = function() {
    window.pageAccounts = (window.pageAccounts || 1) + 1;
    renderCariler();
}

window.openCariDetay = function(id) {
    const cari = db.cariler.find(c => c.id == id);
    if (!cari) return;

    renderCariPaymentOverview(cari.id);
    document.getElementById('ekstre-cari-adi').textContent = cari.adi;
    document.getElementById('ekstre-cari-kodu').textContent = cari.kodu;
    
    const bakiyeEl = document.getElementById('ekstre-bakiye-deger');
    bakiyeEl.textContent = formatCurrency(cari.bakiye);
    bakiyeEl.className = 'stat-value ' + (cari.bakiye < 0 ? 'text-error' : 'text-success');

    // Aggregate transactions
    let history = [];

    // 1. Finansal İşlemler (Tahsilat / Ödeme vb.)
    (db.islemler || []).filter(i => i.cariId != null ? i.cariId == id : i.firma === cari.adi).forEach(islem => {
        const bakiyeDegisimi = typeof islem.bakiyeDegisimi === 'number'
            ? islem.bakiyeDegisimi
            : (islem.isGelir ? -islem.tutar : islem.tutar);
        history.push({
            id: islem.id,
            tarih: islem.tarih,
            tarihObj: parseTRDate(islem.tarih),
            tip: islem.tip,
            aciklama: islem.aciklama || 'Finansal İşlem',
            tutar: bakiyeDegisimi,
            isGelir: islem.isGelir,
            ek: islem.ek || null,
            kaynak: islem.orderId ? 'satis' : 'finans',
            canReverse: canReverseCariMovement(islem),
            canEdit: canEditCariMovement(islem),
            reversed: !!islem.reversedBy,
            corrected: !!islem.correctedBy
        });
    });

    // 2. Stok Malzeme Girişleri
    (db.stoklar || []).filter(s => s.sahibiTipi === 'musteri' && s.cariId == id).forEach(stok => {
        history.push({
            tarih: stok.tarih || 'Tarihsiz',
            tarihObj: stok.tarih ? parseTRDate(stok.tarih) : new Date(0), // Push to top if no date
            tip: 'Malzeme Geldi',
            aciklama: `${stok.miktar} adet ${stok.cinsi} (${stok.ebat})`,
            tutar: 0,
            isGelir: null,
            kaynak: 'malzeme'
        });
    });

    // 3. Bekleyen çek/senet kayıtları (tahsil/ödeme olduysa zaten finansal işlem olarak görünür)
    (db.cekSenetler || []).filter(record => record.cariId == id && record.cariYansitildi !== true).forEach(record => {
        history.push({
            tarih: record.vadeTarihi || record.tarih || 'Tarihsiz',
            tarihObj: parseTRDate(record.vadeTarihi || record.tarih),
            tip: `${getCekSenetTypeLabel(record.tip)} - ${getCekSenetStatusLabel(record.durum)}`,
            aciklama: `${record.belgeNo || '-'}${record.banka ? ` / ${record.banka}` : ''}${record.aciklama ? ` - ${record.aciklama}` : ''}`,
            tutar: 0,
            isGelir: null,
            ek: record.ek || null,
            kaynak: 'ceksenet'
        });
    });

    // 4. Teklif / fiyat geçmişi
    (db.teklifler || []).filter(q => q.customerId == id).forEach(quote => {
        history.push({
            tarih: quote.tarih || 'Tarihsiz',
            tarihObj: parseTRDate(quote.tarih),
            tip: `Teklif - ${quote.durum || 'Beklemede'}`,
            aciklama: `${quote.teklifNo || 'Teklif'} / ${quote.description || quote.islemTipi || '-'} / KDV %${quote.taxRate ?? 20} / İskonto %${quote.discountPercent || 0}`,
            tutar: Number(quote.total) || 0,
            isGelir: null,
            kaynak: 'fiyat'
        });
    });

    // Sort by date (oldest to newest for building, then we might want newest to oldest for display)
    // Actually newest to oldest is better for reading history.
    history.sort((a, b) => b.tarihObj - a.tarihObj);

    // Save globally for pagination and filtering
    window.currentCariHistory = history;
    window.cariHistoryPage = 1;
    
    // Reset filter
    const filterEl = document.getElementById('ekstre-filter');
    if (filterEl) filterEl.value = 'all';

    renderCariHistory();
    openModal('modal-cari-ekstre');
}

window.renderCariHistory = function() {
    if (!window.currentCariHistory) return;

    const filter = document.getElementById('ekstre-filter') ? document.getElementById('ekstre-filter').value : 'all';
    
    let filteredHistory = window.currentCariHistory;
    if (filter === 'finans') {
        filteredHistory = filteredHistory.filter(h => h.kaynak === 'finans');
    } else if (filter === 'satis') {
        filteredHistory = filteredHistory.filter(h => h.kaynak === 'satis');
    } else if (filter === 'malzeme') {
        filteredHistory = filteredHistory.filter(h => h.kaynak === 'malzeme');
    } else if (filter === 'ceksenet') {
        filteredHistory = filteredHistory.filter(h => h.kaynak === 'ceksenet');
    } else if (filter === 'fiyat') {
        filteredHistory = filteredHistory.filter(h => h.kaynak === 'fiyat');
    }

    const itemsPerPage = getListPageSize('ekstre');
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
    
    if (window.cariHistoryPage > totalPages) window.cariHistoryPage = totalPages;
    if (window.cariHistoryPage < 1) window.cariHistoryPage = 1;

    const startIndex = (window.cariHistoryPage - 1) * itemsPerPage;
    const paginatedItems = filteredHistory.slice(startIndex, startIndex + itemsPerPage);

    const tbody = document.getElementById('ekstre-tbody');
    tbody.innerHTML = paginatedItems.map(h => `
        <tr>
            <td>${escapeHTML(h.tarih)}</td>
            <td><span class="badge ${h.tutar === 0 ? 'pending' : (h.tutar > 0 ? 'success' : 'warning')}">${escapeHTML(h.tip)}</span></td>
            <td>${escapeHTML(h.aciklama)}${renderAttachmentBadge(h)}</td>
            <td style="text-align:right; font-weight:600; color:${h.tutar === 0 ? 'var(--text-muted)' : (h.tutar > 0 ? 'var(--success)' : 'var(--alert)')}">
                ${h.tutar === 0 ? '-' : formatCurrency(Math.abs(h.tutar))} ${h.tutar > 0 ? '(+)' : (h.tutar < 0 ? '(-)' : '')}
            </td>
            <td style="text-align:right;">
                ${h.canReverse
                    ? `<div class="cari-history-actions">
                        ${h.canEdit ? `<button type="button" class="btn btn-outline cari-history-action cari-history-edit" onclick="openEditCariMovement(${escapeJSStringForAttr(h.id)})" aria-label="Cari hareketini düzelt" title="Düzelt"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzelt</button>` : ''}
                        <button type="button" class="btn btn-outline cari-history-action cari-history-undo" onclick="reverseCariMovement(${escapeJSStringForAttr(h.id)})" aria-label="Cari hareketini geri al" title="Geri Al"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Geri Al</button>
                    </div>`
                    : (h.corrected ? '<span class="badge info"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzeltildi</span>' : (h.reversed ? '<span class="badge warning">Geri Alındı</span>' : '-'))}
            </td>
        </tr>
    `).join('') || renderTableEmptyState(5, 'Geçmiş hareket bulunamadı.', 'Cari işlemleri kaydedildikçe ekstre burada oluşacak.', 'fa-clock-rotate-left');

    // Update pagination UI
    const pageInfo = document.getElementById('ekstre-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.cariHistoryPage, totalPages, filteredHistory.length, itemsPerPage);

    const btnPrev = document.getElementById('btn-ekstre-prev');
    const btnNext = document.getElementById('btn-ekstre-next');
    
    if (btnPrev) btnPrev.disabled = window.cariHistoryPage <= 1;
    if (btnNext) btnNext.disabled = window.cariHistoryPage >= totalPages;
}

window.filterCariHistory = function() {
    window.cariHistoryPage = 1;
    renderCariHistory();
}

window.prevCariPage = function() {
    if (window.cariHistoryPage > 1) {
        window.cariHistoryPage--;
        renderCariHistory();
    }
}

window.nextCariPage = function() {
    window.cariHistoryPage++;
    renderCariHistory();
}

// Helper for DD.MM.YYYY
function parseTRDate(dateStr) {
    if (!dateStr) return new Date(0);
    const text = String(dateStr).trim();
    const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (match) {
        const [, day, month, year, hour = '0', minute = '0'] = match;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    }
    return new Date(text);
}

function isActiveIncomeMovement(islem) {
    return !islem.reversedBy && !islem.reversalOf && isIncomeMovement(islem);
}

function isIncomeMovement(islem) {
    const tip = normalizeLookupText(islem?.tip || '');
    return islem?.isGelir === true || tip.includes('tahsilat') || tip.includes('gelen');
}

function getTodayBounds() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getCekSenetDueAlerts() {
    const { start, end } = getTodayBounds();
    const sevenDaysEnd = new Date(end);
    sevenDaysEnd.setDate(sevenDaysEnd.getDate() + 7);

    const pending = getDBArray('cekSenetler')
        .filter(record => record.durum === 'beklemede')
        .map(record => ({ ...record, dueDate: parseTRDate(record.vadeTarihi || record.tarih) }))
        .filter(record => record.dueDate instanceof Date && !Number.isNaN(record.dueDate.getTime()));

    return {
        overdue: pending.filter(record => record.dueDate < start),
        today: pending.filter(record => record.dueDate >= start && record.dueDate <= end),
        week: pending.filter(record => record.dueDate > end && record.dueDate <= sevenDaysEnd)
    };
}

function getPaymentPlanDueAlerts() {
    const { start, end } = getTodayBounds();
    const sevenDaysEnd = new Date(end);
    sevenDaysEnd.setDate(sevenDaysEnd.getDate() + 7);
    const pending = getDBArray('odemePlanlari')
        .filter(plan => plan.durum === 'beklemede')
        .map(plan => ({ ...plan, dueDate: parseTRDate(plan.vadeTarihi || plan.tarih) }))
        .filter(plan => plan.dueDate instanceof Date && !Number.isNaN(plan.dueDate.getTime()));
    return {
        overdue: pending.filter(plan => plan.dueDate < start),
        today: pending.filter(plan => plan.dueDate >= start && plan.dueDate <= end),
        week: pending.filter(plan => plan.dueDate > end && plan.dueDate <= sevenDaysEnd)
    };
}

function mergeDueAlerts(...alertGroups) {
    return {
        overdue: alertGroups.flatMap(group => group.overdue || []),
        today: alertGroups.flatMap(group => group.today || []),
        week: alertGroups.flatMap(group => group.week || [])
    };
}

function sumRecordsAmount(records) {
    return records.reduce((total, record) => total + (Number(record.tutar) || 0), 0);
}

function getCriticalStockItems() {
    return getDBArray('stoklar').filter(stok => {
        const threshold = Number(stok.kritikSeviye) || 0;
        if (threshold <= 0) return false;
        return getStockTrackQuantity(stok).value <= threshold;
    });
}

function getCriticalStockSummaryText(items) {
    if (!items.length) return 'Kritik stok yok';
    const first = items[0];
    const tracked = getStockTrackQuantity(first);
    return `${plainText(first.cinsi || first.kodu || 'Malzeme')} (${tracked.value}/${first.kritikSeviye} ${tracked.unit})`;
}

function getStockTrackQuantity(stok) {
    const plateAmount = Number(stok?.miktar) || 0;
    const kgAmount = Number(stok?.kg) || 0;
    const field = plateAmount > 0 || kgAmount <= 0 ? 'miktar' : 'kg';
    const physical = field === 'miktar' ? plateAmount : kgAmount;
    const reserved = getReservedStockQuantity(stok?.id, field);
    return {
        value: Math.max(0, roundMoney(physical - reserved)),
        physical,
        reserved,
        field,
        unit: field === 'miktar' ? 'adet' : 'kg'
    };
}

const ORDER_STATUS_TRANSITIONS = {
    'Beklemede': ['Üretimde', 'Teslim Edildi', 'İptal'],
    'Üretimde': ['Teslim Edildi', 'İptal'],
    'Teslim Edildi': ['İptal'],
    'İptal': []
};

function getOrderStockUsage(order) {
    if (!order || !order.stokId || String(order.stokId) === '0') return null;
    const field = order.islemTipi === 'hammadde' ? 'kg' : 'miktar';
    const quantity = roundMoney(field === 'kg' ? order.kgAmount : order.stokQty);
    if (quantity <= 0) return null;
    return { field, quantity, unit: field === 'kg' ? 'KG' : 'adet/plaka' };
}

function orderReservesStock(order) {
    const status = order?.durum || 'Beklemede';
    return order?.stokDusuldu !== true && (status === 'Beklemede' || status === 'Üretimde');
}

function isDimensionedSheet(stock) {
    return [stock?.en,stock?.boy,stock?.mm].every(value=>Number.isFinite(Number(value)) && Number(value)>0);
}
// A physical sheet has one count and one weight; both must move together.
function secondaryStockUsage(stock, field, quantity) {
    quantity=Number(quantity);
    if(!Number.isFinite(quantity)||quantity<=0)throw new Error('Geçerli stok miktarı girin.');
    const count=Number(stock.miktar)||0,kg=Number(stock.kg)||0;
    if(field==='miktar') {
        if((isDimensionedSheet(stock)||stock.originCutId)&&!Number.isSafeInteger(quantity))throw new Error('Plaka adedi tam sayı olmalıdır. Bir kısmını kesmek için ölçüyle kesimi kullanın.');
        return count>0&&kg>0 ? {field:'kg',quantity:roundMoney(kg*quantity/count)} : null;
    }
    if(field==='kg'&&isDimensionedSheet(stock)&&count>0&&kg>0) {
        const plates=Math.round(quantity*count/kg);
        if(plates<1||Math.abs(roundMoney(plates*kg/count)-quantity)>.001)throw new Error('Bu KG miktarı tam plaka adedine karşılık gelmiyor. Sacın bir kısmını kullanmak için Ölçüyle Kes / Kalan Parça işlemini seçin.');
        return {field:'miktar',quantity:plates};
    }
    return null;
}
function validateStockUsage(stock, field, quantity, excludeOrderId=null) {
    if(!stock||stock.isPasif||stock.cutVoided)throw new Error('Aktif stok kaydı bulunamadı.');
    if(!['miktar','kg'].includes(field)||!Number.isFinite(Number(quantity))||Number(quantity)<=0)throw new Error('Geçerli stok miktarı ve birimi girin.');
    const secondary=secondaryStockUsage(stock,field,quantity);
    for(const usage of [{field,quantity},secondary].filter(Boolean)) {
        if(usage.quantity>getAvailableStockQuantity(stock,usage.field,excludeOrderId))throw new Error('Kullanılabilir stok yetersiz. Diğer işlere ayrılan plaka ve KG miktarı birlikte korunur.');
    }
    return secondary;
}
// Plate/KG conversion depends on the card's count, weight and size, so an edit can turn a valid
// KG reservation into more plates than exist. Every waiting order must remain deliverable.
function getStockEditReservationError(stock, changes) {
    const orders = getDBArray('isEmirleri').filter(order => orderReservesStock(order) && String(order.stokId) === String(stock.id));
    if (!orders.length) return '';
    const previous = { miktar: stock.miktar, kg: stock.kg, en: stock.en, boy: stock.boy, mm: stock.mm };
    try {
        Object.assign(stock, changes);
        for (const field of ['miktar', 'kg']) {
            const reserved = getReservedStockQuantity(stock.id, field);
            if (reserved > (Number(stock[field]) || 0)) return `Aktif iş emirleri bu karttan ${reserved} ${field === 'kg' ? 'KG' : 'adet/plaka'} ayırıyor. Yeni değerlerle bu ayrım karşılanamıyor; önce iş emirlerini kontrol edin.`;
        }
        for (const order of orders) {
            const usage = getOrderStockUsage(order);
            if (!usage) continue;
            try { validateStockUsage(stock, usage.field, usage.quantity, order.id); }
            catch (error) { return `${order.orderNo || 'İş emri'} yeni stok değerleriyle teslim edilemez: ${error.message}`; }
        }
        return '';
    } finally {
        Object.assign(stock, previous);
    }
}

function getReservedStockQuantity(stokId, field = 'miktar', excludeOrderId = null) {
    if (stokId === undefined || stokId === null || String(stokId) === '0') return 0;
    const stock=getDBArray('stoklar').find(s=>String(s.id)===String(stokId));
    const perPlate=Number(stock?.miktar)>0&&Number(stock?.kg)>0 ? Number(stock.kg)/Number(stock.miktar) : 0;
    return roundMoney(getDBArray('isEmirleri').reduce((total, order) => {
        if (!orderReservesStock(order) || String(order.stokId) !== String(stokId)) return total;
        if (excludeOrderId !== null && String(order.id) === String(excludeOrderId)) return total;
        const usage = getOrderStockUsage(order);
        if(!usage)return total;
        if(usage.field===field)return total+usage.quantity;
        if(!perPlate)return total;
        const converted=field==='kg' ? usage.quantity*perPlate : usage.quantity/perPlate;
        return total+(field==='miktar'&&isDimensionedSheet(stock)?Math.ceil(converted-1e-8):converted);
    }, 0));
}

function getAvailableStockQuantity(stok, field = 'miktar', excludeOrderId = null) {
    if (!stok) return 0;
    const physical = Number(stok[field]) || 0;
    const reserved = getReservedStockQuantity(stok.id, field, excludeOrderId);
    return Math.max(0, roundMoney(physical - reserved));
}

function getQuoteReservationOrderId() {
    const quote = getDBArray('teklifler').find(item => item.id === activeQuoteId);
    if (!quote?.orderId) return null;

    const readNumber = id => Number(document.getElementById(id)?.value || 0);
    const formState = {
        islemTipi: document.getElementById('quote-type')?.value || 'lazer',
        customerId: document.getElementById('quote-customer')?.value || '',
        description: plainText(document.getElementById('quote-description')?.value || ''),
        minutes: readNumber('quote-minutes'),
        rate: readNumber('quote-rate'),
        kgAmount: readNumber('quote-kg-amount'),
        kgPrice: readNumber('quote-kg-price'),
        stokId: document.getElementById('quote-material')?.value || '0',
        stokQty: readNumber('quote-material-qty'),
        discountPercent: readNumber('quote-discount'),
        taxRate: readNumber('quote-tax-rate'),
        total: quote.total
    };
    return getQuoteFingerprint(formState) === getQuoteFingerprint(quote) ? quote.orderId : null;
}

window.updateQuoteMaterials = function(retainStockId = null) {
    const customerId = document.getElementById('quote-customer').value;
    const islemTipi = document.getElementById('quote-type')?.value || 'lazer';
    const stockField = islemTipi === 'hammadde' ? 'kg' : 'miktar';
    const stockUnit = stockField === 'kg' ? 'KG' : 'adet/plaka';
    const selectMaterial = document.getElementById('quote-material');
    if (!selectMaterial) return;
    const previousValue = selectMaterial.value;
    const savedQuote = getDBArray('teklifler').find(q => q.id === activeQuoteId);
    const retainedId = retainStockId ?? savedQuote?.stokId;
    const reservationOrderId = getQuoteReservationOrderId();
    const visible = stock => !stock.isPasif && !stock.cutVoided &&
        (getAvailableStockQuantity(stock, stockField, reservationOrderId) > 0 || String(stock.id) === String(retainedId));

    selectMaterial.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '0';
    defaultOption.textContent = 'Malzeme Müşteriden (Sıfır Maliyet)';
    selectMaterial.appendChild(defaultOption);
    
    // Add our materials
    db.stoklar.filter(s => visible(s) && (s.sahibiTipi === 'biz' || !s.sahibiTipi)).forEach(stok => {
        const option = document.createElement('option');
        option.value = stok.id;
        const available = getAvailableStockQuantity(stok, stockField);
        option.textContent = `[${stok.originCutId ? 'KALAN PARÇA' : 'BİZ'}] ${getStockDisplayCode(stok)} ${plainText(stok.cinsi)} (${plainText(stok.mm)}mm · ${plainText(stok.ebat || '')}) - Kullanılabilir: ${available} ${stockUnit} - ${formatCurrency(stok.maliyet)}/KG`;
        selectMaterial.appendChild(option);
    });

    // Add this customer's materials
    if (customerId) {
        db.stoklar.filter(s => visible(s) && s.sahibiTipi === 'musteri' && s.cariId == customerId).forEach(stok => {
            const option = document.createElement('option');
            option.value = stok.id;
            const available = getAvailableStockQuantity(stok, stockField);
            option.textContent = `[EMANET${stok.originCutId ? ' PARÇA' : ''}] ${getStockDisplayCode(stok)} ${plainText(stok.cinsi)} (${plainText(stok.mm)}mm · ${plainText(stok.ebat || '')}) - Kullanılabilir: ${available} ${stockUnit}`;
            selectMaterial.appendChild(option);
        });
    }

    if (Array.from(selectMaterial.options).some(option => option.value === previousValue)) {
        selectMaterial.value = previousValue;
    }
};

function renderStoklar() {
    try {
        const tbody = document.getElementById('inventory-tbody');
        if (!tbody) return;

        const filteredStoklar = applyListSort('inventory', getFilteredStoklarForReport().filter(s => !s.cutVoided), {
            code: item => item.kodu || '',
            material: item => item.cinsi || '',
            thickness: item => Number(item.mm) || 0,
            size: item => item.ebat || '',
            quantity: item => Number(item.miktar) || 0,
            weight: item => Number(item.kg) || 0,
            owner: item => item.sahibi || '',
            cost: item => Number(item.maliyet) || 0,
            totalCost: item => getStockTotalCost(item)
        });
        window.pageInventory = window.pageInventory || 1;
        const itemsPerPage = getListPageSize('inventory');
        const totalPages = Math.ceil(filteredStoklar.length / itemsPerPage) || 1;
        window.pageInventory = Math.min(Math.max(window.pageInventory, 1), totalPages);
        const startIndex = (window.pageInventory - 1) * itemsPerPage;
        const paginatedStoklar = filteredStoklar.slice(startIndex, startIndex + itemsPerPage);
        const pageInfo = document.getElementById('inventory-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageInventory, totalPages, filteredStoklar.length, itemsPerPage);
        const previousButton = document.getElementById('btn-inventory-prev');
        const nextButton = document.getElementById('btn-inventory-next');
        if (previousButton) previousButton.disabled = window.pageInventory <= 1;
        if (nextButton) nextButton.disabled = window.pageInventory >= totalPages;

        tbody.innerHTML = paginatedStoklar.map(stok => {
            const kritikSeviye = Number(stok.kritikSeviye) || 0;
            const trackedQuantity = getStockTrackQuantity(stok);
            const kritikMi = kritikSeviye > 0 && trackedQuantity.value <= kritikSeviye;
            const reservedPlates = getReservedStockQuantity(stok.id, 'miktar');
            const availablePlates = getAvailableStockQuantity(stok, 'miktar');
            const reservedKg = getReservedStockQuantity(stok.id, 'kg');
            const availableKg = getAvailableStockQuantity(stok, 'kg');
            return `
            <tr>
                ${renderSelectionCell('inventory', stok.id)}
                <td style="width:80px;"><span class="badge" style="background:rgba(69, 123, 157, 0.2); color:var(--secondary); border:1px solid var(--secondary);">${escapeHTML(stok.kodu || '-')}</span>${stok.partNo ? '<br><span class="dashboard-muted-text">Parça '+escapeHTML(stok.partNo)+'</span>' : ''}</td>
                <td><strong>${escapeHTML(stok.cinsi || '-')}</strong>${stok.originCutId ? '<br><span class="badge info">Kalan Parça</span>' : ''}</td>
                <td style="text-align:center;">${escapeHTML(stok.mm || '-')} mm</td>
                <td style="color:var(--text-muted);">${escapeHTML(stok.ebat || '-')}</td>
                <td style="text-align:center;">
                    <strong style="color:${kritikMi ? 'var(--alert)' : 'var(--text-main)'};">${stok.miktar || 0}</strong>
                    ${reservedPlates > 0 ? `<br><span class="dashboard-muted-text">Rezerve: ${reservedPlates} | Kullanılabilir: ${availablePlates}</span>` : ''}
                    ${kritikSeviye > 0 ? `<br><span class="dashboard-muted-text">Kritik: ${kritikSeviye} ${trackedQuantity.unit}</span>` : ''}
                </td>
                <td style="text-align:center;"><span style="color:var(--success); font-weight:600;">${stok.kg || 0} KG</span>${stok.weightBasis === 'estimate' ? '<small class="text-muted" style="display:block">Tahmini</small>' : ''}${reservedKg > 0 ? `<br><span class="dashboard-muted-text">Rezerve: ${reservedKg} KG | Kullanılabilir: ${availableKg} KG</span>` : ''}</td>
                <td style="text-align:center;"><span class="badge ${stok.sahibiTipi === 'musteri' ? 'info' : 'success'}">${escapeHTML(stok.sahibi || 'Biz')}</span></td>
                <td style="text-align:right; font-weight:600;">${stok.sahibiTipi === 'musteri' ? '-' : formatCurrency(stok.maliyet)}${stok.costReviewRequired ? '<br><small>KG fiyatını kontrol edin</small>' : ''}</td>
                <td style="text-align:right;">${stok.sahibiTipi === 'musteri' ? '-' : formatCurrency(getStockTotalCost(stok))}</td>
                <td style="text-align:right;"><div class="table-actions">
                    <button class="btn btn-outline table-action-button" aria-label="Sac kesimi ve kalan parça oluştur" title="Kesim / Kalan Parça" onclick="openSheetCut(${stok.id})"><i class="fa-solid fa-scissors" aria-hidden="true"></i> Kesim / Kalan</button>
                    ${stok.originCutId ? `<button type="button" class="btn btn-outline table-action-button" aria-label="Kesim geçmişini aç" title="Kesim Geçmişi" onclick="showSheetCutHistory(${stok.originCutId})"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Kesim Geçmişi</button>` : `<button class="btn btn-outline table-action-button" aria-label="Stok kaydını düzenle" title="Düzenle" onclick="openStokDuzenleModal(${stok.id})"><i class="fa-solid fa-pen" aria-hidden="true"></i> Düzenle</button>`}
                    <button class="btn btn-danger table-action-button" aria-label="Stok kaydını sil" title="Sil" onclick="deleteStok(${stok.id})"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `}).join('') || renderTableEmptyState(11, 'Stok kaydı bulunamadı.', 'Aramayı temizleyin veya yeni bir malzeme girişi yapın.', 'fa-boxes-stacked');
        updateReportSelectionUI('inventory');
        renderStockMovements();
    } catch(e) {
        console.error("renderStoklar error:", e);
    }
}

function renderStockMovements() {
    const tbody = document.getElementById('stock-movements-tbody');
    if (!tbody) return;
    const search = normalizeLookupText(document.getElementById('stock-movements-search')?.value || '');
    let movements = [...getDBArray('stokHareketleri')].reverse();
    if (search) {
        movements = movements.filter(item => [item.stokAdi, item.stokKodu, codeSearchText(getDBArray('stoklar').find(s=>String(s.id)===String(item.stokId))), item.tip, item.aciklama, item.ref, item.tarih]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    window.pageStockMovements = window.pageStockMovements || 1;
    const itemsPerPage = getListPageSize('stock-movements');
    const totalPages = Math.ceil(movements.length / itemsPerPage) || 1;
    window.pageStockMovements = Math.min(Math.max(window.pageStockMovements, 1), totalPages);
    const startIndex = (window.pageStockMovements - 1) * itemsPerPage;
    const paginatedMovements = movements.slice(startIndex, startIndex + itemsPerPage);
    const pageInfo = document.getElementById('stock-movements-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pageStockMovements, totalPages, movements.length, itemsPerPage);
    const previousButton = document.getElementById('btn-stock-movements-prev');
    const nextButton = document.getElementById('btn-stock-movements-next');
    if (previousButton) previousButton.disabled = window.pageStockMovements <= 1;
    if (nextButton) nextButton.disabled = window.pageStockMovements >= totalPages;
    tbody.innerHTML = paginatedMovements.map(movement => `
        <tr>
            <td>${escapeHTML(movement.tarih || '-')}</td>
            <td><strong>${escapeHTML(movement.stokAdi || '-')}</strong><br><span class="dashboard-muted-text">${escapeHTML(getStockDisplayCode(getDBArray('stoklar').find(s => String(s.id) === String(movement.stokId)) || {kodu:movement.stokKodu,originCutId:movement.stockPartNo,partNo:movement.stockPartNo}))}</span></td>
            <td><span class="badge ${Number(movement.miktar) < 0 ? 'alert' : 'success'}">${escapeHTML(movement.tip || '-')}</span></td>
            <td>${escapeHTML(movement.aciklama || movement.ref || '-')}</td>
            <td style="text-align:right; font-weight:700; color:${Number(movement.miktar) < 0 ? 'var(--alert)' : 'var(--success)'};">${Number(movement.miktar) > 0 ? '+' : ''}${escapeHTML(movement.miktar || 0)} ${escapeHTML(movement.alan || '')}</td>
            <td style="text-align:right;">${movement.onceki !== null ? `${escapeHTML(movement.onceki)} → ` : ''}<strong>${escapeHTML(movement.sonraki ?? '-')}</strong></td>
        </tr>
    `).join('') || renderTableEmptyState(6, 'Henüz stok hareketi yok.', 'Stok girişleri ve iş emri tüketimleri burada izlenecek.', 'fa-arrow-right-arrow-left');
}

let isStatsVisible = false;
let dashboardActivityTab = 'finance';

window.setDashboardActivityTab = function(tab) {
    const allowedTabs = ['finance', 'pending', 'delivered'];
    dashboardActivityTab = allowedTabs.includes(tab) ? tab : 'finance';

    allowedTabs.forEach(name => {
        const button = document.getElementById(`dashboard-tab-${name}`);
        const panel = document.getElementById(`dashboard-panel-${name}`);
        const isActive = name === dashboardActivityTab;
        if (button) {
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.tabIndex = isActive ? 0 : -1;
        }
        if (panel) {
            panel.hidden = !isActive;
            panel.classList.toggle('active', isActive);
        }
    });
};

window.handleDashboardActivityKey = function(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = ['finance', 'pending', 'delivered'];
    let index = tabs.indexOf(dashboardActivityTab);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else index = (index - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    setDashboardActivityTab(tabs[index]);
    document.getElementById(`dashboard-tab-${tabs[index]}`)?.focus();
};

window.toggleStats = function() {
    isStatsVisible = !isStatsVisible;
    const btn = document.getElementById('btn-toggle-stats');
    if (btn) {
        btn.innerHTML = isStatsVisible
            ? '<i class="fa-solid fa-eye" aria-hidden="true"></i> Gizle'
            : '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Göster';
        btn.setAttribute('aria-pressed', isStatsVisible ? 'true' : 'false');
        btn.setAttribute('aria-label', isStatsVisible ? 'Finansal rakamları gizle' : 'Finansal rakamları göster');
    }
    renderDashboard();
};

function renderDashboard() {
    renderBackupStatus();
    try {
        const dashboardDateLabel = document.getElementById('dashboard-date-label');
        let dashboardFormattedDate = '';
        if (dashboardDateLabel) {
            const formattedDate = new Intl.DateTimeFormat('tr-TR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date());
            dashboardFormattedDate = `${formattedDate.charAt(0).toLocaleUpperCase('tr-TR')}${formattedDate.slice(1)}`;
            dashboardDateLabel.textContent = `${dashboardFormattedDate} · Güncel finans ve operasyon görünümü`;
        }
        const chartPeriod = document.getElementById('dashboard-chart-period');
        if (chartPeriod) chartPeriod.textContent = `${new Date().getFullYear()} · Aylık`;

        const incomeTransactions = (db.islemler || []).filter(isActiveIncomeMovement);
        const toplamGelir = incomeTransactions.reduce((acc, curr) => acc + curr.tutar, 0);

        const bekleyenAlacak = (db.cariler || []).reduce((acc, curr) => acc + (curr.bakiye > 0 ? curr.bakiye : 0), 0);
        const toplamBorc = (db.cariler || []).reduce((acc, curr) => acc + (curr.bakiye < 0 ? Math.abs(curr.bakiye) : 0), 0);
        const onayliIslerCount = (db.isEmirleri || []).filter(o => o.durum === 'Onaylandı' || o.durum === 'Beklemede' || o.durum === 'Üretimde').length;

        const elIncome = document.getElementById('dash-stat-income');
        const elReceivables = document.getElementById('dash-stat-receivables');
        const elOrders = document.getElementById('dash-stat-orders');
        const elDebt = document.getElementById('dash-stat-debt');

        if (elIncome) elIncome.textContent = isStatsVisible ? formatCurrency(toplamGelir) : '***';
        if (elReceivables) elReceivables.textContent = isStatsVisible ? formatCurrency(bekleyenAlacak) : '***';
        if (elOrders) elOrders.textContent = isStatsVisible ? onayliIslerCount : '***';
        if (elDebt) elDebt.textContent = isStatsVisible ? formatCurrency(toplamBorc) : '***';

        const dueAlerts = mergeDueAlerts(getCekSenetDueAlerts(), getPaymentPlanDueAlerts());
        const criticalStocks = getCriticalStockItems();
        const dashboardAlertMap = [
            ['dash-due-overdue-count', dueAlerts.overdue.length],
            ['dash-due-overdue-amount', isStatsVisible ? formatCurrency(sumRecordsAmount(dueAlerts.overdue)) : '***'],
            ['dash-due-today-count', dueAlerts.today.length],
            ['dash-due-today-amount', isStatsVisible ? formatCurrency(sumRecordsAmount(dueAlerts.today)) : '***'],
            ['dash-due-week-count', dueAlerts.week.length],
            ['dash-due-week-amount', isStatsVisible ? formatCurrency(sumRecordsAmount(dueAlerts.week)) : '***'],
            ['dash-critical-stock-count', criticalStocks.length],
            ['dash-critical-stock-detail', getCriticalStockSummaryText(criticalStocks)]
        ];
        dashboardAlertMap.forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });

        const alertStates = [
            ['dashboard-alert-overdue', dueAlerts.overdue.length],
            ['dashboard-alert-today', dueAlerts.today.length],
            ['dashboard-alert-week', dueAlerts.week.length],
            ['dashboard-alert-stock', criticalStocks.length]
        ];
        const activeAlertCount = alertStates.reduce((count, [id, value]) => {
            const card = document.getElementById(id);
            if (card) card.hidden = value <= 0;
            return count + (value > 0 ? 1 : 0);
        }, 0);
        const clearState = document.getElementById('dashboard-alert-clear');
        if (clearState) clearState.hidden = activeAlertCount > 0;
        const attentionCount = document.getElementById('dashboard-attention-count');
        if (attentionCount) {
            attentionCount.textContent = activeAlertCount ? `${activeAlertCount} başlık` : 'Sorun yok';
            attentionCount.classList.toggle('has-alerts', activeAlertCount > 0);
        }
        if (dashboardDateLabel) {
            const alertSummary = activeAlertCount ? `${activeAlertCount} kritik başlık` : 'kritik başlık yok';
            dashboardDateLabel.textContent = `${dashboardFormattedDate} · ${onayliIslerCount} aktif iş · ${alertSummary}`;
        }
        const statusChip = document.getElementById('dashboard-status-chip');
        const statusText = document.getElementById('dashboard-status-text');
        if (statusChip) {
            statusChip.classList.toggle('has-alerts', activeAlertCount > 0);
            const statusIcon = statusChip.querySelector('i');
            if (statusIcon) statusIcon.className = activeAlertCount > 0
                ? 'fa-solid fa-circle-exclamation'
                : 'fa-solid fa-circle-check';
        }
        if (statusText) statusText.textContent = activeAlertCount ? `${activeAlertCount} öncelik var` : 'Akış dengede';

        updateDashboardChart();

        // Finansal İşlemler
        const tbody = document.getElementById('dashboard-tbody');
        if (tbody) {
            const recentTransactions = (db.islemler || []).slice(-5).reverse();
            tbody.innerHTML = recentTransactions.length ? recentTransactions.map(islem => {
                const isIncome = isIncomeMovement(islem);
                const badgeClass = isIncome ? 'success' : (String(islem.tip || '').includes('Fatura') ? 'warning' : 'info');
                const amountClass = isIncome ? 'text-info' : 'text-alert';
                return `
                <tr>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(islem.tarih || '-')}</span>
                        ${islem.faturaNo ? `<span class="dashboard-muted-text">${escapeHTML(islem.faturaNo)}</span>` : ''}
                    </td>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(islem.firma || '-')}</span>
                        ${islem.aciklama ? `<span class="dashboard-muted-text">${escapeHTML(islem.aciklama)}</span>` : ''}
                    </td>
                    <td><span class="badge ${badgeClass}">${escapeHTML(islem.tip || '-')}</span>${islem.movementNo ? '<br><small>'+escapeHTML(islem.movementNo)+'</small>' : ''}</td>
                    <td><span class="dashboard-amount ${amountClass}">${isStatsVisible ? formatCurrency(islem.tutar) : '***'}</span></td>
                </tr>
            `;
            }).join('') : `
                <tr>
                    <td colspan="4" class="dashboard-empty">
                        <i class="fa-solid fa-receipt"></i>
                        Henüz finansal işlem yok.
                    </td>
                </tr>
            `;
        }

        // Bekleyen İş Emirleri
        const pendingTbody = document.getElementById('dashboard-pending-tbody');
        if (pendingTbody) {
            const pendingOrders = (db.isEmirleri || []).filter(o => o.durum === 'Beklemede' || o.durum === 'Üretimde').slice(0, 5);
            pendingTbody.innerHTML = pendingOrders.length ? pendingOrders.map(o => `
                <tr>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(o.customerName || '-')}</span>
                        <span class="dashboard-muted-text">${escapeHTML(o.orderNo || 'İş emri')}</span>
                    </td>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(o.description || '-')}</span>
                        <span class="dashboard-muted-text">${isStatsVisible ? formatCurrency(o.total || 0) : '***'}</span>
                    </td>
                    <td><span class="badge warning">${escapeHTML(o.durum)}</span></td>
                </tr>
            `).join('') : `
                <tr>
                    <td colspan="3" class="dashboard-empty">
                        <i class="fa-solid fa-circle-check"></i>
                        Bekleyen iş yok.
                    </td>
                </tr>
            `;
        }

        // Son Teslim Edilenler
        const deliveredTbody = document.getElementById('dashboard-delivered-tbody');
        if (deliveredTbody) {
            const deliveredOrders = (db.isEmirleri || []).filter(o => o.durum === 'Teslim Edildi').slice(-5).reverse();
            deliveredTbody.innerHTML = deliveredOrders.length ? deliveredOrders.map(o => `
                <tr>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(o.customerName || '-')}</span>
                        <span class="dashboard-muted-text">${escapeHTML(o.orderNo || 'Teslim edilen iş')}</span>
                    </td>
                    <td>
                        <span class="dashboard-primary-text">${escapeHTML(o.description || '-')}</span>
                        <span class="dashboard-muted-text">${isStatsVisible ? formatCurrency(o.total || 0) : '***'}</span>
                    </td>
                    <td><span class="dashboard-primary-text">${escapeHTML(o.tarih || '-')}</span></td>
                </tr>
            `).join('') : `
                <tr>
                    <td colspan="3" class="dashboard-empty">
                        <i class="fa-solid fa-truck-fast"></i>
                        Teslimat yok.
                    </td>
                </tr>
            `;
        }
        setDashboardActivityTab(dashboardActivityTab);
    } catch (e) {
        console.error("Dashboard render error:", e);
    }
}

function renderHeader() {
    const firmaSpan = document.getElementById('header-firma-adi');
    const avatarImg = document.getElementById('header-avatar');
    if (firmaSpan && db.ayarlar) {
        firmaSpan.textContent = db.ayarlar.firmaAdi;
    }
    if (avatarImg && db.ayarlar) {
        avatarImg.src = APP_ICON_PATH;
        avatarImg.alt = db.ayarlar.firmaAdi || 'AK LAZER';
    }
}

let personnelTabFilter = 'active';

function getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthToReportDate(monthValue) {
    const match = String(monthValue || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    return `01.${match[2]}.${match[1]}`;
}

function formatMonthLabel(monthValue) {
    const match = String(monthValue || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return '-';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    return date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function getPersonelById(id) {
    return getDBArray('personeller').find(p => String(p.id) === String(id)) || null;
}

function getPersonelDisplayName(id) {
    return getPersonelById(id)?.ad || 'Personel';
}

function getPayrollInputs(prefix = 'input-puantaj') {
    return {
        personelId: document.getElementById(`${prefix}-personel`)?.value || '',
        donem: document.getElementById(`${prefix}-ay`)?.value || '',
        geldiGun: parseFloat(document.getElementById(`${prefix}-gun`)?.value || '0') || 0,
        izinGun: parseFloat(document.getElementById(`${prefix}-izin`)?.value || '0') || 0,
        eksikGun: parseFloat(document.getElementById(`${prefix}-eksik`)?.value || '0') || 0,
        mesaiSaat: parseFloat(document.getElementById(`${prefix}-mesai-saat`)?.value || '0') || 0,
        mesaiSaatUcreti: parseFloat(document.getElementById(`${prefix}-mesai-ucret`)?.value || '0') || 0,
        avans: parseFloat(document.getElementById(`${prefix}-avans`)?.value || '0') || 0,
        prim: parseFloat(document.getElementById(`${prefix}-prim`)?.value || '0') || 0
    };
}

function calculatePayroll(personel, data = {}) {
    const maas = roundMoney(personel?.maas || 0);
    const tip = personel?.maasTipi || 'aylik';
    const geldiGun = Number(data.geldiGun) || 0;
    const eksikGun = Number(data.eksikGun) || 0;
    const mesaiSaat = Number(data.mesaiSaat) || 0;
    const mesaiSaatUcreti = Number(data.mesaiSaatUcreti) || 0;
    const avans = Number(data.avans) || 0;
    const prim = Number(data.prim) || 0;

    let brut = maas;
    let kesinti = 0;
    if (tip === 'gunluk') {
        brut = roundMoney(maas * geldiGun);
    } else if (tip === 'saatlik') {
        brut = roundMoney(maas * geldiGun * 8);
    } else {
        const gunluk = maas / 30;
        kesinti = roundMoney(gunluk * eksikGun);
    }

    const mesai = roundMoney(mesaiSaat * mesaiSaatUcreti);
    const ekOdeme = roundMoney(mesai + prim);
    const net = roundMoney(Math.max(brut - kesinti - avans + ekOdeme, 0));
    return { brut: roundMoney(brut), kesinti, mesai, prim: roundMoney(prim), ekOdeme, avans: roundMoney(avans), net };
}

function getPayrollCalculationFromRecord(record) {
    const personel = getPersonelById(record.personelId);
    return calculatePayroll(personel, record);
}

function syncPayrollExpense(record, previousRecord = null) {
    if (!db.giderler) db.giderler = [];
    const existingIndex = record.giderId
        ? db.giderler.findIndex(g => String(g.id) === String(record.giderId))
        : -1;

    if (!record.odendi) {
        if (existingIndex >= 0) db.giderler.splice(existingIndex, 1);
        record.giderId = null;
    } else {
        const gider = {
            id: record.giderId || createRecordId(),
            tarih: record.odemeTarihi || new Date().toLocaleDateString('tr-TR'),
            kategori: 'Personel Maaşı',
            aciklama: `${getPersonelDisplayName(record.personelId)} - ${formatMonthLabel(record.donem)} maaş ödemesi`,
            tutar: roundMoney(record.netMaas || 0),
            kaynak: 'personel-maas',
            puantajId: record.id
        };

        if (existingIndex >= 0) db.giderler[existingIndex] = { ...db.giderler[existingIndex], ...gider };
        else db.giderler.push(gider);
        record.giderId = gider.id;
        record.odemeTarihi = gider.tarih;
    }

    const previousMovementId = previousRecord?.kasaHareketId || record.kasaHareketId || null;
    const paymentChanged = !!previousRecord && (
        previousRecord.odendi !== record.odendi ||
        roundMoney(previousRecord.netMaas || 0) !== roundMoney(record.netMaas || 0) ||
        String(previousRecord.kasaId || '') !== String(record.kasaId || '')
    );

    if (previousMovementId && (!record.odendi || paymentChanged)) {
        reverseCashMovement(previousMovementId, `${getPersonelDisplayName(record.personelId)} maaş kaydı güncellendi`);
        record.kasaHareketId = null;
    }

    if (record.odendi && !record.kasaHareketId) {
        const cashMovement = addCashMovement(record.kasaId, {
            tip: 'cikis',
            tutar: record.netMaas,
            aciklama: `${getPersonelDisplayName(record.personelId)} - ${formatMonthLabel(record.donem)} maaş ödemesi`,
            kaynak: 'personel-maas',
            refId: record.id
        });
        record.kasaHareketId = cashMovement?.id || null;
    }
}

function getPersonnelSearchText() {
    return normalizeLookupText(document.getElementById('personnel-search')?.value || '');
}

function getPersonnelRowsForUI() {
    const search = getPersonnelSearchText();
    let rows = [];

    if (personnelTabFilter === 'payroll') {
        rows = getFilteredPersonnelPayrollForReport()
            .map(record => ({ ...record, personel: getPersonelById(record.personelId) }))
            .filter(record => {
                const haystack = normalizeLookupText(`${record.personel?.ad || ''} ${record.personel?.gorev || ''} ${record.not || ''}`);
                return !search || haystack.includes(search);
            })
            .sort((a, b) => parseTRDate(monthToReportDate(b.donem)) - parseTRDate(monthToReportDate(a.donem)) || String(b.id).localeCompare(String(a.id)));
        return rows;
    }

    rows = getDBArray('personeller')
        .filter(p => personnelTabFilter !== 'active' || p.durum !== 'Ayrıldı')
        .filter(p => {
            const haystack = normalizeLookupText(`${p.ad || ''} ${p.gorev || ''} ${p.tel || ''}`);
            return !search || haystack.includes(search);
        })
        .sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'));
    return rows;
}

function getLatestPayrollForPersonel(personelId) {
    return getDBArray('personelPuantajlari')
        .filter(record => String(record.personelId) === String(personelId))
        .sort((a, b) => parseTRDate(monthToReportDate(b.donem)) - parseTRDate(monthToReportDate(a.donem)))[0] || null;
}

function getPersonnelReportRows() {
    const rows = applyListSort('personnel', getPersonnelRowsForUI(), {
        period: item => parseTRDate(monthToReportDate(item.donem || getLatestPayrollForPersonel(item.id)?.donem || '')),
        person: item => item.personel?.ad || item.ad || getPersonelDisplayName(item.personelId) || '',
        attendance: item => (Number(item.geldiGun) || 0) - (Number(item.eksikGun) || 0),
        salary: item => Number(item.netMaas ?? item.maas) || 0,
        status: item => Object.hasOwn(item, 'odendi') ? (item.odendi ? 'Ödendi' : 'Bekliyor') : (item.durum || ''),
        phone: item => item.tel || '',
        role: item => item.personel?.gorev || item.gorev || ''
    });
    if (personnelTabFilter === 'payroll') {
        return rows.map(record => ({
            id: `payroll-${record.id}`,
            sourceId: record.id,
            kind: 'payroll',
            values: [
                formatMonthLabel(record.donem),
                record.personel?.ad || getPersonelDisplayName(record.personelId),
                record.geldiGun || 0,
                record.izinGun || 0,
                record.eksikGun || 0,
                formatCurrency(record.netMaas || 0),
                record.odendi ? 'Ödendi' : 'Bekliyor'
            ]
        }));
    }

    return rows.map(personel => ({
        id: `person-${personel.id}`,
        sourceId: personel.id,
        kind: 'person',
        values: [
            personel.ad || '-',
            personel.tel || '-',
            personel.gorev || '-',
            personel.maasTipi === 'gunluk' ? 'Günlük' : (personel.maasTipi === 'saatlik' ? 'Saatlik' : 'Aylık'),
            formatCurrency(personel.maas || 0),
            personel.durum || 'Aktif'
        ]
    }));
}

function updatePayrollPreview() {
    const data = getPayrollInputs();
    const personel = getPersonelById(data.personelId);
    const calc = calculatePayroll(personel, data);
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCurrency(value);
    };
    set('payroll-preview-base', calc.brut);
    set('payroll-preview-deduction', calc.kesinti + calc.avans);
    set('payroll-preview-extra', calc.ekOdeme);
    set('payroll-preview-net', calc.net);
}
window.updatePayrollPreview = updatePayrollPreview;

function populatePayrollPersonelOptions(selectedId = '') {
    const select = document.getElementById('input-puantaj-personel');
    if (!select) return;
    const active = getDBArray('personeller').filter(p => p.durum !== 'Ayrıldı');
    select.innerHTML = active.length
        ? active.map(p => `<option value="${p.id}">${escapeHTML(p.ad || '-')} ${p.gorev ? `- ${escapeHTML(p.gorev)}` : ''}</option>`).join('')
        : '<option value="">Önce personel ekleyin</option>';
    if (selectedId) select.value = String(selectedId);
}

window.setPersonnelTab = function(tab) {
    personnelTabFilter = tab || 'active';
    ['active', 'all', 'payroll'].forEach(name => {
        const btn = document.getElementById(`personnel-tab-${name}`);
        if (btn) btn.className = name === personnelTabFilter ? 'btn btn-primary account-tab-btn' : 'btn btn-outline account-tab-btn';
    });
    window.pagePersonnel = 1;
    renderPersonnel();
};

window.openPersonnelModal = function(id = '') {
    const personel = id ? getPersonelById(id) : null;
    document.getElementById('modal-personel-title').textContent = personel ? 'Personel Düzenle' : 'Personel Ekle';
    document.getElementById('input-personel-id').value = personel?.id || '';
    document.getElementById('input-personel-ad').value = personel?.ad || '';
    document.getElementById('input-personel-tel').value = personel?.tel || '';
    document.getElementById('input-personel-gorev').value = personel?.gorev || '';
    document.getElementById('input-personel-maas-tipi').value = personel?.maasTipi || 'aylik';
    document.getElementById('input-personel-maas').value = personel?.maas || '';
    document.getElementById('input-personel-giris').value = personel?.girisTarihiInput || '';
    document.getElementById('input-personel-durum').value = personel?.durum || 'Aktif';
    document.getElementById('input-personel-bolum').value = personel?.bolum || '';
    document.getElementById('input-personel-tc').value = personel?.tcKimlikNo || '';
    document.getElementById('input-personel-sgk').value = personel?.sgkSicilNo || '';
    document.getElementById('input-personel-ucret-tarih').value = personel?.ucretGecerlilikTarihiInput || '';
    document.getElementById('input-personel-cikis').value = personel?.cikisTarihiInput || '';
    document.getElementById('input-personel-cikis-nedeni').value = personel?.cikisNedeni || '';
    openModal('modal-personel');
    refreshDateInputDisplay();
};

window.savePersonel = function() {
    const unlock = beginModalSubmit('modal-personel');
    if (!unlock) return;
    try {
    const id = document.getElementById('input-personel-id')?.value || '';
    const ad = plainText(document.getElementById('input-personel-ad')?.value || '');
    const tel = plainText(document.getElementById('input-personel-tel')?.value || '');
    const gorev = plainText(document.getElementById('input-personel-gorev')?.value || '');
    const maasTipi = document.getElementById('input-personel-maas-tipi')?.value || 'aylik';
    const maas = roundMoney(parseFloat(document.getElementById('input-personel-maas')?.value || '0') || 0);
    const girisTarihiInput = document.getElementById('input-personel-giris')?.value || '';
    const durum = document.getElementById('input-personel-durum')?.value || 'Aktif';
    const bolum = plainText(document.getElementById('input-personel-bolum')?.value || '');
    const tcKimlikNo = plainText(document.getElementById('input-personel-tc')?.value || '');
    const sgkSicilNo = plainText(document.getElementById('input-personel-sgk')?.value || '');
    const ucretGecerlilikTarihiInput = document.getElementById('input-personel-ucret-tarih')?.value || '';
    const cikisTarihiInput = document.getElementById('input-personel-cikis')?.value || '';
    const cikisNedeni = plainText(document.getElementById('input-personel-cikis-nedeni')?.value || '');

    if (!validateModalFields('modal-personel', [
        { id: 'input-personel-ad', test: value => !!plainText(value), message: 'Personel adı zorunludur.' },
        { id: 'input-personel-maas', test: value => Number(value) > 0, message: 'Sıfırdan büyük maaş veya ücret girin.' },
        { id: 'input-personel-tc', test: value => !plainText(value) || /^\d{11}$/.test(plainText(value)), message: 'T.C. kimlik numarası 11 rakam olmalıdır.' }
    ])) return;

    const payload = {
        ad, tel: tel || '-', gorev: gorev || '-',
        maasTipi, maas, durum,
        girisTarihiInput,
        girisTarihi: girisTarihiInput ? formatDateInputDisplay(girisTarihiInput) : '',
        bolum, tcKimlikNo, sgkSicilNo, cikisNedeni,
        ucretGecerlilikTarihiInput,
        ucretGecerlilikTarihi: ucretGecerlilikTarihiInput ? formatDateInputDisplay(ucretGecerlilikTarihiInput) : '',
        cikisTarihiInput,
        cikisTarihi: cikisTarihiInput ? formatDateInputDisplay(cikisTarihiInput) : ''
    };

    let savedPersonel;
    if (id) {
        const personel = getPersonelById(id);
        if (personel) {
            Object.assign(personel, payload);
            savedPersonel = personel;
            addAuditLog('Güncellendi', 'Personel', personel.id, `${personel.kodu || '-'} / ${personel.ad} / ${personel.durum}`);
        }
    } else {
        savedPersonel = {
            id: createRecordId(),
            kodu: `P-${String(getDBArray('personeller').length + 1).padStart(3, '0')}`,
            ...payload
        };
        db.personeller.push(savedPersonel);
        addAuditLog('Oluşturuldu', 'Personel', savedPersonel.id, `${savedPersonel.kodu} / ${savedPersonel.ad}`);
    }

    saveDB();
    closeModal('modal-personel');
    renderPersonnel();
    } finally {
        unlock();
    }
};

window.deletePersonel = function(id) {
    const hasPayroll = getDBArray('personelPuantajlari').some(record => String(record.personelId) === String(id));
    const personel = getPersonelById(id);
    if (!personel) return alert('Personel kaydı bulunamadı.');
    if (hasPayroll) {
        confirmAction('Bu personelin maaş kayıtları var. Geçmişi korumak için durumu “Ayrıldı” yapılsın mı?', () => {
            personel.durum = 'Ayrıldı';
            addAuditLog('Durum Değişti', 'Personel', personel.id, `${personel.ad} / Aktif -> Ayrıldı`);
            saveDB();
            renderPersonnel();
            showToast({ type: 'success', title: 'Personel güncellendi', message: `${personel.ad} “Ayrıldı” durumuna alındı.` });
        }, { title: 'Personel Durumunu Değiştir', confirmLabel: 'Ayrıldı Yap', danger: false });
    } else {
        confirmAction('Bu personel kaydı silinsin mi?', () => {
            db.personeller = getDBArray('personeller').filter(p => String(p.id) !== String(id));
            addAuditLog('Silindi', 'Personel', personel.id, `${personel.kodu || '-'} / ${personel.ad}`);
            saveDB();
            renderPersonnel();
            showToast({ type: 'success', title: 'Personel silindi', message: `${personel.ad} kaydı kaldırıldı.` });
        }, { title: 'Personel Kaydını Sil', confirmLabel: 'Personeli Sil' });
    }
};

window.openPayrollModal = function(recordId = '', personelId = '') {
    if (!getDBArray('personeller').length) return alert('Önce personel ekleyin.');
    const record = recordId ? getDBArray('personelPuantajlari').find(r => String(r.id) === String(recordId)) : null;
    populatePayrollPersonelOptions(record?.personelId || personelId);
    document.getElementById('modal-puantaj-title').textContent = record ? 'Puantaj / Maaş Düzenle' : 'Puantaj / Maaş Kaydı';
    document.getElementById('input-puantaj-id').value = record?.id || '';
    document.getElementById('input-puantaj-ay').value = record?.donem || getCurrentMonthValue();
    document.getElementById('input-puantaj-gun').value = record?.geldiGun ?? 26;
    document.getElementById('input-puantaj-izin').value = record?.izinGun ?? 0;
    document.getElementById('input-puantaj-eksik').value = record?.eksikGun ?? 0;
    document.getElementById('input-puantaj-mesai-saat').value = record?.mesaiSaat ?? 0;
    document.getElementById('input-puantaj-mesai-ucret').value = record?.mesaiSaatUcreti ?? 0;
    document.getElementById('input-puantaj-avans').value = record?.avans ?? 0;
    document.getElementById('input-puantaj-prim').value = record?.prim ?? 0;
    document.getElementById('input-puantaj-not').value = record?.not || '';
    document.getElementById('input-puantaj-odendi').checked = !!record?.odendi;
    populateKasaOptions(record?.kasaId || '');
    const kasaEl = document.getElementById('input-puantaj-kasa');
    if (kasaEl) kasaEl.value = record?.kasaId || '';
    togglePayrollPaymentAccount();
    updatePayrollPreview();
    openModal('modal-puantaj');
};

window.togglePayrollPaymentAccount = function() {
    const checked = !!document.getElementById('input-puantaj-odendi')?.checked;
    const container = document.getElementById('puantaj-kasa-container');
    if (container) container.style.display = checked ? 'block' : 'none';
};

window.savePuantaj = function() {
    const unlock = beginModalSubmit('modal-puantaj');
    if (!unlock) return;
    try {
    const id = document.getElementById('input-puantaj-id')?.value || '';
    const data = getPayrollInputs();
    const personel = getPersonelById(data.personelId);
    if (!validateModalFields('modal-puantaj', [
        { id: 'input-puantaj-personel', test: value => !!getPersonelById(value), message: 'Personel seçin.' },
        { id: 'input-puantaj-ay', test: value => /^\d{4}-\d{2}$/.test(value), message: 'Dönem ayını seçin.' }
    ])) return;
    if (!personel) return;
    const numericFields = [
        ['input-puantaj-gun', data.geldiGun],
        ['input-puantaj-izin', data.izinGun],
        ['input-puantaj-eksik', data.eksikGun],
        ['input-puantaj-mesai-saat', data.mesaiSaat],
        ['input-puantaj-mesai-ucret', data.mesaiSaatUcreti],
        ['input-puantaj-avans', data.avans],
        ['input-puantaj-prim', data.prim]
    ];
    const invalidNumeric = numericFields.find(([, value]) => !Number.isFinite(value) || value < 0);
    if (invalidNumeric) {
        setFieldError(invalidNumeric[0], 'Bu alan negatif olamaz. Sıfır veya daha büyük bir değer girin.');
        document.getElementById(invalidNumeric[0])?.focus();
        return;
    }
    const [year, month] = data.donem.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    if (!Number.isFinite(daysInMonth) || data.geldiGun + data.izinGun + data.eksikGun > daysInMonth) {
        setFieldError('input-puantaj-gun', `Gün toplamı bu ayın ${daysInMonth || 31} gününü aşamaz.`);
        setFieldError('input-puantaj-izin', 'Geldiği, izinli ve raporlu günleri birlikte azaltın.');
        setFieldError('input-puantaj-eksik', 'Dönem gün sayısı aşıldı.');
        document.getElementById('input-puantaj-gun')?.focus();
        return;
    }
    const odendi = !!document.getElementById('input-puantaj-odendi')?.checked;
    const kasaId = document.getElementById('input-puantaj-kasa')?.value || '';
    if (odendi && !getDBArray('kasaHesaplari').some(kasa => kasa.id == kasaId)) {
        setFieldError('input-puantaj-kasa', 'Maaş ödendi olarak kaydedilecekse kasa/banka hesabı seçin.');
        document.getElementById('input-puantaj-kasa')?.focus();
        return;
    }

    const calc = calculatePayroll(personel, data);
    const payload = {
        personelId: personel.id,
        donem: data.donem,
        tarih: monthToReportDate(data.donem),
        geldiGun: data.geldiGun,
        izinGun: data.izinGun,
        eksikGun: data.eksikGun,
        mesaiSaat: data.mesaiSaat,
        mesaiSaatUcreti: data.mesaiSaatUcreti,
        avans: data.avans,
        prim: data.prim,
        brutMaas: calc.brut,
        kesinti: calc.kesinti,
        ekOdeme: calc.ekOdeme,
        netMaas: calc.net,
        odendi,
        kasaId: odendi ? kasaId : null,
        not: plainText(document.getElementById('input-puantaj-not')?.value || '')
    };

    let record;
    let previousRecord = null;
    if (id) {
        record = getDBArray('personelPuantajlari').find(r => String(r.id) === String(id));
        if (!record) return alert('Puantaj kaydı bulunamadı.');
        previousRecord = { ...record };
        Object.assign(record, payload);
    } else {
        const existing = getDBArray('personelPuantajlari').find(r => String(r.personelId) === String(personel.id) && r.donem === data.donem);
        if (existing) {
            setFieldError('input-puantaj-ay', 'Bu personelin seçilen dönemde kaydı var. Mevcut kaydı düzenleyin.');
            document.getElementById('input-puantaj-ay')?.focus();
            return;
        }
        record = { id: createRecordId(), ...payload };
        db.personelPuantajlari.push(record);
    }

    syncPayrollExpense(record, previousRecord);
    addAuditLog(id ? 'Güncellendi' : 'Oluşturuldu', 'Puantaj / Maaş', record.id, `${personel.ad} / ${formatMonthLabel(record.donem)} / ${formatCurrency(record.netMaas)}`);
    saveDB();
    closeModal('modal-puantaj');
    renderPersonnel();
    renderExpenses();
    const previousPaidAmount = previousRecord?.odendi ? roundMoney(previousRecord.netMaas || 0) : 0;
    const currentPaidAmount = record.odendi ? roundMoney(record.netMaas || 0) : 0;
    const paymentDelta = roundMoney(currentPaidAmount - previousPaidAmount);
    if (record.odendi || previousRecord?.odendi) {
        showImpactSummary(id ? 'Maaş kaydı güncellendi' : 'Maaş ödemesi kaydedildi', [
            { label: 'Kasa', value: -paymentDelta },
            { label: 'Gider', value: paymentDelta }
        ], { message: `${personel.ad} / ${formatMonthLabel(record.donem)} / ${formatCurrency(record.netMaas)}` });
    } else {
        showToast({ type: 'success', title: 'Puantaj kaydedildi', message: `${personel.ad} için ödeme bekleyen maaş kaydı oluşturuldu.` });
    }
    } finally {
        unlock();
    }
};

window.deletePuantaj = function(id) {
    const record = getDBArray('personelPuantajlari').find(r => String(r.id) === String(id));
    if (!record) return alert('Puantaj / maaş kaydı bulunamadı.');
    confirmAction('Bu puantaj / maaş kaydı silinsin mi? Ödenmişse gider ve kasa etkisi ters kayıtla düzeltilecek.', () => {
        if (record.giderId) {
            db.giderler = getDBArray('giderler').filter(g => String(g.id) !== String(record.giderId));
        }
        if (record.kasaHareketId) reverseCashMovement(record.kasaHareketId, `${getPersonelDisplayName(record.personelId)} maaş kaydı silindi`);
        addAuditLog('Silindi', 'Puantaj / Maaş', record.id, `${getPersonelDisplayName(record.personelId)} / ${formatMonthLabel(record.donem)}`);
        db.personelPuantajlari = getDBArray('personelPuantajlari').filter(r => String(r.id) !== String(id));
        saveDB();
        renderPersonnel();
        renderExpenses();
        const impacts = record.odendi ? [{ label: 'Kasa', value: record.netMaas }, { label: 'Gider', value: -record.netMaas }] : [];
        showImpactSummary('Maaş kaydı silindi', impacts, { message: record.odendi ? 'Ödeme ve gider etkileri ters kayıtla düzeltildi.' : 'Bekleyen maaş kaydı kaldırıldı.' });
    }, { title: 'Maaş Kaydını Sil', confirmLabel: 'Kaydı Sil' });
};

function renderPersonnelStats() {
    const activeCount = getDBArray('personeller').filter(p => p.durum !== 'Ayrıldı').length;
    const currentMonth = getCurrentMonthValue();
    const monthRecords = getDBArray('personelPuantajlari').filter(r => r.donem === currentMonth);
    const workDays = monthRecords.reduce((sum, r) => sum + (Number(r.geldiGun) || 0), 0);
    const totalPayroll = monthRecords.reduce((sum, r) => sum + roundMoney(r.netMaas || 0), 0);
    const pending = monthRecords.filter(r => !r.odendi).reduce((sum, r) => sum + roundMoney(r.netMaas || 0), 0);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('personnel-stat-active', String(activeCount));
    setText('personnel-stat-workdays', String(workDays));
    setText('personnel-stat-payroll', formatCurrency(totalPayroll));
    setText('personnel-stat-pending', formatCurrency(pending));
}

function renderPersonnel() {
    const tbody = document.getElementById('personnel-tbody');
    const thead = document.getElementById('personnel-table-head');
    if (!tbody || !thead) return;

    renderPersonnelStats();
    const isPayroll = personnelTabFilter === 'payroll';
    const title = document.getElementById('personnel-list-title');
    const subtitle = document.getElementById('personnel-list-subtitle');
    if (title) title.textContent = isPayroll ? 'Maaş / Puantaj Kayıtları' : 'Personel Listesi';
    if (subtitle) subtitle.textContent = isPayroll
        ? 'Seçilen tarih aralığındaki maaş, izin, eksik gün ve ödeme kayıtları.'
        : 'Personel bilgileri ve son maaş/puantaj durumları.';

    const rows = applyListSort('personnel', getPersonnelRowsForUI(), {
        period: item => parseTRDate(monthToReportDate(item.donem || getLatestPayrollForPersonel(item.id)?.donem || '')),
        person: item => item.personel?.ad || item.ad || getPersonelDisplayName(item.personelId) || '',
        attendance: item => (Number(item.geldiGun) || 0) - (Number(item.eksikGun) || 0),
        salary: item => Number(item.netMaas ?? item.maas) || 0,
        status: item => Object.hasOwn(item, 'odendi') ? (item.odendi ? 'Ödendi' : 'Bekliyor') : (item.durum || ''),
        phone: item => item.tel || '',
        role: item => item.personel?.gorev || item.gorev || ''
    });
    window.pagePersonnel = window.pagePersonnel || 1;
    const itemsPerPage = getListPageSize('personnel');
    const totalPages = Math.ceil(rows.length / itemsPerPage) || 1;
    if (window.pagePersonnel > totalPages) window.pagePersonnel = totalPages;
    if (window.pagePersonnel < 1) window.pagePersonnel = 1;
    const paginated = rows.slice((window.pagePersonnel - 1) * itemsPerPage, window.pagePersonnel * itemsPerPage);

    const pageInfo = document.getElementById('personnel-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pagePersonnel, totalPages, rows.length, itemsPerPage);
    const prev = document.getElementById('btn-personnel-prev');
    const next = document.getElementById('btn-personnel-next');
    if (prev) prev.disabled = window.pagePersonnel <= 1;
    if (next) next.disabled = window.pagePersonnel >= totalPages;

    if (isPayroll) {
        thead.innerHTML = `
            <tr>
                <th class="selection-cell"><input type="checkbox" data-select-all="personnel" onchange="toggleVisibleReportSelection('personnel', this.checked)"></th>
                <th>Dönem</th>
                <th>Personel</th>
                <th>Gün / İzin / Eksik</th>
                <th>Net Maaş</th>
                <th>Durum</th>
                <th>İşlem</th>
            </tr>
        `;
        tbody.innerHTML = paginated.map(record => `
            <tr>
                ${renderSelectionCell('personnel', `payroll-${record.id}`)}
                <td><strong>${escapeHTML(formatMonthLabel(record.donem))}</strong><br><span class="dashboard-muted-text">${escapeHTML(record.tarih || '-')}</span></td>
                <td>${escapeHTML(record.personel?.ad || getPersonelDisplayName(record.personelId))}<br><span class="dashboard-muted-text">${escapeHTML(record.personel?.gorev || '-')}</span></td>
                <td>${record.geldiGun || 0} geldi / ${record.izinGun || 0} izin / ${record.eksikGun || 0} eksik</td>
                <td class="text-info" style="font-weight:700;">${formatCurrency(record.netMaas || 0)}</td>
                <td><span class="status-pill ${record.odendi ? 'completed' : 'pending'}">${record.odendi ? 'Ödendi' : 'Bekliyor'}</span></td>
                <td style="text-align:right;"><div class="table-actions">
                    <button class="btn btn-outline table-action-button" aria-label="Puantaj kaydını düzenle" title="Düzenle" onclick="openPayrollModal('${record.id}')"><i class="fa-solid fa-pen" aria-hidden="true"></i> Düzenle</button>
                    <button class="btn btn-danger table-action-button" aria-label="Puantaj kaydını sil" title="Sil" onclick="deletePuantaj('${record.id}')"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `).join('') || renderTableEmptyState(7, 'Puantaj veya maaş kaydı bulunamadı.', 'Yeni bir puantaj kaydı ekleyin ya da tarih filtresini değiştirin.', 'fa-calendar-check');
    } else {
        thead.innerHTML = `
            <tr>
                <th class="selection-cell"><input type="checkbox" data-select-all="personnel" onchange="toggleVisibleReportSelection('personnel', this.checked)"></th>
                <th>Personel</th>
                <th>Telefon</th>
                <th>Görev</th>
                <th>Maaş</th>
                <th>Son Puantaj</th>
                <th>İşlem</th>
            </tr>
        `;
        tbody.innerHTML = paginated.map(personel => {
            const latest = getLatestPayrollForPersonel(personel.id);
            return `
                <tr>
                    ${renderSelectionCell('personnel', `person-${personel.id}`)}
                    <td><strong>${escapeHTML(personel.ad || '-')}</strong><br><span class="dashboard-muted-text">${escapeHTML(personel.kodu || '')} ${personel.durum === 'Ayrıldı' ? ' / Ayrıldı' : ''}</span></td>
                    <td>${escapeHTML(personel.tel || '-')}</td>
                    <td>${escapeHTML(personel.gorev || '-')}<br><span class="dashboard-muted-text">${escapeHTML(personel.bolum || 'Bölüm belirtilmemiş')}</span></td>
                    <td>${escapeHTML(personel.maasTipi === 'gunluk' ? 'Günlük' : (personel.maasTipi === 'saatlik' ? 'Saatlik' : 'Aylık'))}<br><strong>${formatCurrency(personel.maas || 0)}</strong></td>
                    <td>${latest ? `${escapeHTML(formatMonthLabel(latest.donem))}<br><span class="dashboard-muted-text">${formatCurrency(latest.netMaas || 0)} / ${latest.odendi ? 'Ödendi' : 'Bekliyor'}</span>` : '<span class="dashboard-muted-text">Henüz kayıt yok</span>'}</td>
                    <td style="text-align:right;"><div class="table-actions">
                        <button class="btn btn-outline table-action-button" aria-label="Puantaj kaydı ekle" title="Puantaj ekle" onclick="openPayrollModal('', '${personel.id}')"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Puantaj</button>
                        <button class="btn btn-outline table-action-button" aria-label="Personel kaydını düzenle" title="Düzenle" onclick="openPersonnelModal('${personel.id}')"><i class="fa-solid fa-pen" aria-hidden="true"></i> Düzenle</button>
                        <button class="btn btn-danger table-action-button" aria-label="Personel kaydını sil" title="Sil" onclick="deletePersonel('${personel.id}')"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                    </div></td>
                </tr>
            `;
        }).join('') || renderTableEmptyState(7, 'Personel kaydı bulunamadı.', 'Aramayı temizleyin veya yeni bir personel ekleyin.', 'fa-user-plus');
    }
    updateReportSelectionUI('personnel');
    populatePayrollPersonelOptions(document.getElementById('input-puantaj-personel')?.value || '');
    enhanceSortableTableHeaders('personnel');
}

window.prevPersonnelPage = function() {
    if (window.pagePersonnel > 1) {
        window.pagePersonnel--;
        renderPersonnel();
    }
};

window.nextPersonnelPage = function() {
    window.pagePersonnel = (window.pagePersonnel || 1) + 1;
    renderPersonnel();
};

function printPayrollStatement(rowId) {
    const recordId = String(rowId).replace('payroll-', '');
    const record = getDBArray('personelPuantajlari').find(r => String(r.id) === String(recordId));
    if (!record) return alert('Yazdırılacak maaş kaydı bulunamadı.');
    const personel = getPersonelById(record.personelId);
    const calc = getPayrollCalculationFromRecord(record);
    const contentHTML = `
        ${getPrintBrandHTML('Personel Maaş Bordrosu', getPrintMetaHTML([
            ['Dönem', formatMonthLabel(record.donem)],
            ['Düzenleme', new Date().toLocaleDateString('tr-TR')],
            ['Durum', record.odendi ? 'Ödendi' : 'Bekliyor']
        ]))}
        <div class="document-intro-grid">
            <div class="document-card">
                <div class="document-card-label">Personel</div>
                <div class="document-card-value">${escapeHTML(personel?.ad || '-')}</div>
                <div class="document-card-detail">${escapeHTML(personel?.gorev || '-')}</div>
            </div>
            <div class="document-card">
                <div class="document-card-label">Ücret Bilgisi</div>
                <div class="document-card-value">${escapeHTML(personel?.maasTipi === 'gunluk' ? 'Günlük' : (personel?.maasTipi === 'saatlik' ? 'Saatlik' : 'Aylık'))}</div>
                <div class="document-card-detail">Baz ücret: ${escapeHTML(formatCurrency(personel?.maas || 0))}</div>
            </div>
        </div>
        <div class="section-heading"><h2>Puantaj Bilgileri</h2></div>
        <table>
            <thead><tr><th>Geldiği Gün</th><th>İzin</th><th>Eksik</th><th>Fazla Mesai</th></tr></thead>
            <tbody><tr><td>${record.geldiGun || 0}</td><td>${record.izinGun || 0}</td><td>${record.eksikGun || 0}</td><td>${record.mesaiSaat || 0} saat</td></tr></tbody>
        </table>
        <div class="document-footer-grid">
            ${record.not ? `<div class="document-note"><span class="document-note-title">Not</span>${escapeHTML(record.not)}</div>` : ''}
            <table class="totals-panel" aria-label="Bordro tutar özeti">
                <tbody>
                    <tr><td>Brüt Maaş</td><td>${escapeHTML(formatCurrency(calc.brut))}</td></tr>
                    ${calc.kesinti ? `<tr><td>Eksik Gün Kesintisi</td><td>-${escapeHTML(formatCurrency(calc.kesinti))}</td></tr>` : ''}
                    ${calc.avans ? `<tr><td>Avans / Kesinti</td><td>-${escapeHTML(formatCurrency(calc.avans))}</td></tr>` : ''}
                    ${calc.ekOdeme ? `<tr><td>Fazla Mesai + Prim</td><td>${escapeHTML(formatCurrency(calc.ekOdeme))}</td></tr>` : ''}
                    <tr class="total-row"><td>Net Ödenecek</td><td>${escapeHTML(formatCurrency(calc.net))}</td></tr>
                </tbody>
            </table>
        </div>
        <div class="signature-grid" aria-label="Bordro imza alanları">
            <div class="signature-box">Personel<br>Ad Soyad / İmza</div>
            <div class="signature-box">İşveren Yetkilisi<br>Ad Soyad / İmza</div>
        </div>
    `;
    openPrintPreview('Personel Maaş Bordrosu', contentHTML, `
        table:not(.totals-panel) { table-layout: fixed; }
        table:not(.totals-panel) th, table:not(.totals-panel) td { text-align: center; }
    `);
}

function renderExpenses() {
    try {
        const tbody = document.getElementById('expenses-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const giderler = getFilteredExpensesForReport();
        const reversedGiderler = applyListSort('expenses', [...giderler].reverse(), {
            date: item => parseTRDate(item.tarih || ''),
            category: item => item.kategori || '',
            description: item => item.aciklama || '',
            amount: item => Number(item.tutar) || 0
        });

        // Sayfalama (Pagination) - Giderler
        window.pageExpenses = window.pageExpenses || 1;
        const itemsPerPage = getListPageSize('expenses');
        const totalPages = Math.ceil(reversedGiderler.length / itemsPerPage) || 1;
        
        if (window.pageExpenses > totalPages) window.pageExpenses = totalPages;
        if (window.pageExpenses < 1) window.pageExpenses = 1;

        const startIndex = (window.pageExpenses - 1) * itemsPerPage;
        const paginatedItems = reversedGiderler.slice(startIndex, startIndex + itemsPerPage);

        // Update pagination UI
        const pageInfo = document.getElementById('expenses-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageExpenses, totalPages, reversedGiderler.length, itemsPerPage);

        const btnPrev = document.getElementById('btn-expenses-prev');
        const btnNext = document.getElementById('btn-expenses-next');
        
        if (btnPrev) btnPrev.disabled = window.pageExpenses <= 1;
        if (btnNext) btnNext.disabled = window.pageExpenses >= totalPages;

        if (paginatedItems.length === 0) {
            tbody.innerHTML = renderTableEmptyState(6, 'Henüz gider kaydı yok.', 'Yeni bir gider eklediğinizde burada listelenecek.', 'fa-receipt');
        } else {
            paginatedItems.forEach(g => {
                const katBadge = getCategoryBadge(g.kategori);
                tbody.innerHTML += `<tr>
                    ${renderSelectionCell('expenses', g.id)}
                    <td>${escapeHTML(g.tarih || '-')}</td>
                    <td>${katBadge}</td>
                    <td>${escapeHTML(g.aciklama || '-')}${g.belgeNo ? `<br><span class="dashboard-muted-text">${escapeHTML(g.belgeNo)}</span>` : ''}${renderAttachmentBadge(g)}</td>
                    <td class="text-alert">${formatCurrency(g.tutar)}</td>
                    <td><div class="table-actions destructive-actions">
                        ${g.kaynak === 'personel-maas' ? '' : `<button class="btn btn-outline table-action-button" aria-label="Gider kaydını düzenle" title="Düzenle" onclick="openGiderModal(${g.id})"><i class="fa-solid fa-pen" aria-hidden="true"></i> Düzenle</button>`}
                        <button class="btn btn-danger table-action-button" aria-label="Gider kaydını sil" title="Sil" onclick="deleteGider(${g.id})"><i class="fa-solid fa-trash" aria-hidden="true"></i> Sil</button>
                    </div></td>
                </tr>`;
            });
        }
        updateReportSelectionUI('expenses');
    } catch (e) {
        console.error("renderExpenses error:", e);
    }

    try {
        const giderler = getFilteredExpensesForReport();

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        const ayGider = giderler.filter(g => {
            if(!g.tarih) return false;
            const parts = g.tarih.split('.');
            if (parts.length < 3) return false;
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        }).reduce((acc, g) => acc + (g.tutar || 0), 0);

        const personelGider = giderler.filter(g => g.kategori === 'Personel').reduce((acc, g) => acc + (g.tutar || 0), 0);
        const toplamGider = giderler.reduce((acc, g) => acc + (g.tutar || 0), 0);

        const statMonth = document.getElementById('expense-stat-month');
        const statPersonel = document.getElementById('expense-stat-personel');
        const statTotal = document.getElementById('expense-stat-total');
        if (statMonth) statMonth.textContent = formatCurrency(ayGider);
        if (statPersonel) statPersonel.textContent = formatCurrency(personelGider);
        if (statTotal) statTotal.textContent = formatCurrency(toplamGider);
    } catch(e) {
        console.error("renderExpenses error:", e);
    }
}

function getCategoryBadge(kategori) {
    const icons = {
        'Personel': 'fa-user',
        'Elektrik': 'fa-bolt',
        'Su': 'fa-droplet',
        'Doğalgaz': 'fa-fire',
        'Kira': 'fa-building',
        'Muhasebe': 'fa-calculator',
        'Yakıt': 'fa-gas-pump',
        'Bakım': 'fa-wrench',
        'Vergi': 'fa-file-invoice',
        'Diğer': 'fa-tag'
    };
    const icon = icons[kategori] || 'fa-tag';
    return `<span class="badge warning"><i class="fa-solid ${icon}"></i> ${escapeHTML(kategori)}</span>`;
}

function calculateExpenseTax(amount, type, rate) {
    const value = Math.max(0, roundMoney(amount || 0));
    const taxRate = type === 'yok' ? 0 : Math.max(0, Math.min(100, Number(rate) || 0));
    if (type === 'haric') {
        const tax = roundMoney(value * taxRate / 100);
        return { matrah: value, kdvTutari: tax, toplam: roundMoney(value + tax), kdvOrani: taxRate };
    }
    if (type === 'dahil' && taxRate > 0) {
        const matrah = roundMoney(value / (1 + taxRate / 100));
        return { matrah, kdvTutari: roundMoney(value - matrah), toplam: value, kdvOrani: taxRate };
    }
    return { matrah: value, kdvTutari: 0, toplam: value, kdvOrani: 0 };
}

window.updateExpenseTaxPreview = function() {
    const amount = Number(document.getElementById('input-gider-tutar')?.value || 0);
    const type = document.getElementById('input-gider-kdv-tipi')?.value || 'dahil';
    const rate = Number(document.getElementById('input-gider-kdv-orani')?.value || 0);
    const result = calculateExpenseTax(amount, type, rate);
    const values = [['gider-preview-matrah', result.matrah], ['gider-preview-kdv', result.kdvTutari], ['gider-preview-total', result.toplam]];
    values.forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = formatCurrency(value); });
    return result;
};

window.saveGider = function() {
    const unlock = beginModalSubmit('modal-gider');
    if (!unlock) return;
    try {
        const id = document.getElementById('input-gider-id')?.value || '';
        const existing = id ? getDBArray('giderler').find(item => String(item.id) === String(id)) : null;
        if (existing?.kaynak === 'personel-maas') return alert('Maaş gideri Personel bölümünden düzenlenmelidir.');
        const kategori = plainText(document.getElementById('input-gider-kategori').value);
        const aciklama = plainText(document.getElementById('input-gider-aciklama').value);
        const belgeTutari = Number(document.getElementById('input-gider-tutar').value);
        const kasaId = document.getElementById('input-gider-kasa')?.value || '';
        const tarihInput = document.getElementById('input-gider-tarih')?.value || '';
        const cariId = document.getElementById('input-gider-cari')?.value || '';
        const belgeNo = plainText(document.getElementById('input-gider-belge-no')?.value || '');
        const kdvTipi = document.getElementById('input-gider-kdv-tipi')?.value || 'dahil';
        const tax = updateExpenseTaxPreview();

        if (!validateModalFields('modal-gider', [
            { id: 'input-gider-tarih', test: value => !!value, message: 'İşlem tarihini seçin.' },
            { id: 'input-gider-kategori', test: value => !!plainText(value), message: 'Kategori zorunludur; uygun değilse “Diğer” yazın.' },
            { id: 'input-gider-tutar', test: value => Number(value) > 0, message: 'Sıfırdan büyük geçerli bir tutar girin.' },
            { id: 'input-gider-kasa', test: value => getDBArray('kasaHesaplari').some(kasa => kasa.id == value), message: 'Ödeme yapılan kasa veya bankayı seçin.' }
        ])) return;
        if (!Number.isFinite(belgeTutari) || tax.toplam <= 0) return;
        const selectedFile = document.getElementById('input-gider-ek')?.files?.[0];
        if (selectedFile && selectedFile.size > MAX_ATTACHMENT_SIZE) return setFieldError('input-gider-ek', 'Dosya en fazla 10 MB olabilir.');
        const newAttachment = getAttachmentFromInputs('input-gider-ek', 'input-gider-ek-not');
        const ek = existing?.ek && !selectedFile
            ? { ...existing.ek, note: plainText(document.getElementById('input-gider-ek-not')?.value || existing.ek.note || '') }
            : (newAttachment || existing?.ek || null);
        const oldAmount = roundMoney(existing?.tutar || 0);

        const gider = existing || { id: createRecordId() };
        if (existing?.kasaHareketId) reverseCashMovement(existing.kasaHareketId, `Gider güncellendi: ${existing.aciklama || existing.kategori || ''}`);
        Object.assign(gider, {
            tarih: toTRDateFromInput(tarihInput),
            kategori,
            aciklama,
            belgeNo,
            belgeTutari: roundMoney(belgeTutari),
            kdvTipi,
            kdvOrani: tax.kdvOrani,
            matrah: tax.matrah,
            kdvTutari: tax.kdvTutari,
            tutar: tax.toplam,
            kasaId,
            cariId: cariId || null,
            cariAdi: cariId ? (findCariByReference(cariId)?.adi || '') : '',
            ek
        });
        const cashMovement = addCashMovement(kasaId, {
            tip: 'cikis', tutar: gider.tutar,
            aciklama: `${kategori} - ${aciklama || belgeNo || 'Gider ödemesi'}`,
            kaynak: 'gider', refId: gider.id,
            tarih: `${gider.tarih} 00:00`
        });
        gider.kasaHareketId = cashMovement?.id || null;
        if (!existing) db.giderler.push(gider);
        scheduleAttachmentArchive(ek, 'Giderler', gider.cariAdi || kategori);
        addAuditLog(existing ? 'Güncellendi' : 'Oluşturuldu', 'Gider', gider.id, `${kategori} / ${formatCurrency(gider.tutar)}`);
        saveDB();
        closeModal('modal-gider');
        renderExpenses();
        resetAttachmentInputs('input-gider-ek', 'input-gider-ek-not');
        showImpactSummary(existing ? 'Gider güncellendi' : 'Gider kaydedildi', [
            { label: 'Kasa', value: oldAmount - gider.tutar },
            { label: 'Gider', value: gider.tutar - oldAmount }
        ], { message: `${kategori}${aciklama ? ` / ${aciklama}` : ''}` });
    } catch(e) {
        alert('Gider kaydedilirken hata oluştu: ' + e.message);
    } finally {
        unlock();
    }
}

window.openGiderModal = function(id = '') {
    const gider = id ? getDBArray('giderler').find(item => String(item.id) === String(id)) : null;
    if (gider?.kaynak === 'personel-maas') return alert('Maaş gideri Personel bölümünden düzenlenmelidir.');
    populateKasaOptions(gider?.kasaId || '');
    const cariSelect = document.getElementById('input-gider-cari');
    if (cariSelect) {
        cariSelect.innerHTML = '<option value="">Cari bağlantısı yok</option>' + getDBArray('cariler').filter(c => !c.isPasif && c.systemRole !== 'retail').map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu || '-')})</option>`).join('');
    }
    const set = (idValue, value) => { const el = document.getElementById(idValue); if (el) el.value = value ?? ''; };
    set('input-gider-id', gider?.id || '');
    set('input-gider-tarih', gider?.tarih ? toDateInputValue(parseTRDate(gider.tarih)) : toDateInputValue(new Date()));
    set('input-gider-belge-no', gider?.belgeNo || '');
    set('input-gider-kategori', gider?.kategori || '');
    set('input-gider-tutar', gider?.belgeTutari ?? gider?.tutar ?? '');
    set('input-gider-aciklama', gider?.aciklama || '');
    set('input-gider-kasa', gider?.kasaId || '');
    set('input-gider-cari', gider?.cariId || '');
    set('input-gider-kdv-tipi', gider?.kdvTipi || 'dahil');
    set('input-gider-kdv-orani', gider?.kdvOrani ?? 20);
    resetAttachmentInputs('input-gider-ek', 'input-gider-ek-not');
    set('input-gider-ek-not', gider?.ek?.note || '');
    const title = document.querySelector('#modal-gider h3');
    if (title) title.textContent = gider ? 'Gider Düzenle' : 'Gider Ekle';
    const label = document.getElementById('gider-submit-label');
    if (label) label.textContent = gider ? 'Gideri Güncelle' : 'Gideri Kaydet';
    updateExpenseTaxPreview();
    refreshDateInputDisplay();
    openModal('modal-gider');
};

window.prevExpensesPage = function() {
    if (window.pageExpenses > 1) {
        window.pageExpenses--;
        renderExpenses();
    }
}

window.nextExpensesPage = function() {
    window.pageExpenses = (window.pageExpenses || 1) + 1;
    renderExpenses();
}

window.deleteGider = function(id) {
    const gider = getDBArray('giderler').find(item => item.id === id);
    if (!gider) return alert('Gider kaydı bulunamadı.');
    if (gider.kaynak === 'personel-maas') return alert('Maaş gideri Personel > Maaş / Puantaj bölümünden düzenlenmeli veya silinmelidir.');
    confirmAction('Bu gider kaydı silinsin mi? Kasa/banka çıkışı ters kayıtla geri alınacak.', () => {
        if (!getDBArray('giderler').includes(gider)) return alert('Bu gider daha önce kaldırıldı.');
        if (gider.kasaHareketId && !reverseCashMovement(gider.kasaHareketId, `Gider silindi: ${gider.aciklama || gider.kategori || ''}`)) {
            return alert('Kasa/banka hareketi geri alınamadığı için gider silinmedi.');
        }
        addAuditLog('Silindi', 'Gider', gider.id, `${gider.kategori || ''} / ${formatCurrency(gider.tutar)}`);
        db.giderler = db.giderler.filter(g => g.id !== id);
        saveDB();
        renderExpenses();
        showImpactSummary('Gider silindi', [
            { label: 'Gider', value: -gider.tutar },
            { label: 'Kasa', value: gider.tutar }
        ], { message: 'Gider ve bağlı kasa hareketi düzeltildi.' });
    }, { title: 'Gider Kaydını Sil', confirmLabel: 'Gideri Sil' });
}

let activeQuoteId = null;
let activeQuoteFingerprint = '';

function getQuoteFingerprint(quoteData) {
    return JSON.stringify([
        quoteData.islemTipi,
        String(quoteData.customerId || ''),
        quoteData.description || '',
        Number(quoteData.minutes || 0),
        Number(quoteData.rate || 0),
        Number(quoteData.kgAmount || 0),
        Number(quoteData.kgPrice || 0),
        String(quoteData.stokId || '0'),
        Number(quoteData.stokQty || 0),
        Number(quoteData.discountPercent || 0),
        Number(quoteData.taxRate ?? 20),
        Number(quoteData.total || 0)
    ]);
}

function findMatchingPendingQuote(fingerprint) {
    return [...getDBArray('teklifler')].reverse().find(quote =>
        !quote.orderId &&
        quote.durum !== 'Onaylandı' &&
        getQuoteFingerprint(quote) === fingerprint
    ) || null;
}

function createQuoteRecord(quoteData) {
    return {
        id: createRecordId(),
        teklifNo: generateSerialNo('teklif'),
        tarih: new Date().toLocaleDateString('tr-TR'),
        durum: 'Beklemede',
        ...quoteData
    };
}

function convertQuoteToOrder(quote) {
    if (!quote) return null;
    if (quote.orderId) {
        alert('Bu teklif daha önce iş emrine dönüştürülmüş.');
        return null;
    }

    const stockUsage = getOrderStockUsage({ ...quote, durum: 'Beklemede' });
    if (stockUsage) {
        const stock = getDBArray('stoklar').find(item => String(item.id) === String(quote.stokId));
        if (!stock) {
            alert('Teklifte seçilen stok kaydı bulunamadı. İş emri oluşturulmadı.');
            return null;
        }
        try { validateStockUsage(stock,stockUsage.field,stockUsage.quantity); } catch(error){alert(error.message);return null;}
        const available = getAvailableStockQuantity(stock, stockUsage.field);
        if (stockUsage.quantity > available) {
            const physical = Number(stock[stockUsage.field]) || 0;
            const reserved = getReservedStockQuantity(stock.id, stockUsage.field);
            alert(`İş emri oluşturulamadı: ${stock.cinsi || 'Malzeme'} için ${stockUsage.quantity} ${stockUsage.unit} gerekiyor. Fiziki stok ${physical}, rezerve ${reserved}, kullanılabilir ${available} ${stockUsage.unit}.`);
            return null;
        }
    }

    const orderNo = generateSerialNo('isEmri');
    const order = {
        ...quote,
        id: createRecordId(),
        orderNo,
        tarih: new Date().toLocaleDateString('tr-TR'),
        quoteId: quote.id,
        durum: 'Beklemede',
        stokRezerveMiktar: stockUsage?.quantity || 0,
        stokRezerveAlan: stockUsage?.field || '',
        stokRezervasyonTarihi: stockUsage ? new Date().toLocaleString('tr-TR') : '',
        statusHistory: [{ status: 'Beklemede', date: new Date().toLocaleString('tr-TR') }]
    };
    delete order.teklifNo;
    applyOrderProfitability(order, {}, 'Tahmini');
    db.isEmirleri.push(order);

    quote.durum = 'Onaylandı';
    quote.orderId = order.id;
    quote.orderNo = orderNo;
    quote.onayTarihi = new Date().toLocaleString('tr-TR');
    return order;
}

window.saveQuote = function() {
    const quoteData = getQuoteData();
    if (!quoteData) return;

    const fingerprint = getQuoteFingerprint(quoteData);
    const activeQuote = getDBArray('teklifler').find(quote => quote.id === activeQuoteId && activeQuoteFingerprint === fingerprint)
        || findMatchingPendingQuote(fingerprint);
    if (activeQuote) {
        activeQuoteId = activeQuote.id;
        activeQuoteFingerprint = fingerprint;
        alert(`Bu teklif zaten kaydedildi: ${activeQuote.teklifNo}`);
        return activeQuote;
    }

    const quote = createQuoteRecord(quoteData);
    db.teklifler.push(quote);
    activeQuoteId = quote.id;
    activeQuoteFingerprint = fingerprint;
    addAuditLog('Oluşturuldu', 'Teklif', quote.id, `${quote.teklifNo} / ${formatCurrency(quote.total)}`);
    saveDB();
    alert(`Teklif kaydedildi: ${quote.teklifNo}`);
    return quote;
}

window.approveQuoteAsOrder = function() {
    const quoteData = getQuoteData();
    if (!quoteData) return;

    const fingerprint = getQuoteFingerprint(quoteData);
    let quote = getDBArray('teklifler').find(item => item.id === activeQuoteId && activeQuoteFingerprint === fingerprint)
        || findMatchingPendingQuote(fingerprint);
    if (!quote) {
        quote = createQuoteRecord(quoteData);
        db.teklifler.push(quote);
        addAuditLog('Oluşturuldu', 'Teklif', quote.id, `${quote.teklifNo} / otomatik kayıt`);
    }

    const order = convertQuoteToOrder(quote);
    if (!order) return;

    activeQuoteId = quote.id;
    activeQuoteFingerprint = fingerprint;
    addAuditLog('Onaylandı', 'Teklif', quote.id, `${quote.teklifNo} -> ${order.orderNo}`);
    addAuditLog('Oluşturuldu', 'İş Emri', order.id, `${order.orderNo} / ${quote.teklifNo}`);
    saveDB();
    alert(`Teklif otomatik kaydedildi: ${quote.teklifNo}\nİş Emri Oluşturuldu: ${order.orderNo}`);
}

window.approveSavedQuoteAsOrder = function(id) {
    const quote = getDBArray('teklifler').find(q => q.id === id);
    if (!quote) return alert('Teklif bulunamadı.');
    const order = convertQuoteToOrder(quote);
    if (!order) return;

    activeQuoteId = quote.id;
    activeQuoteFingerprint = getQuoteFingerprint(quote);
    addAuditLog('Onaylandı', 'Teklif', quote.id, `${quote.teklifNo} -> ${order.orderNo}`);
    addAuditLog('Oluşturuldu', 'İş Emri', order.id, `${order.orderNo} / ${quote.teklifNo}`);
    saveDB();
    closeModal('modal-quote-detail');
    alert(`İş emri oluşturuldu: ${order.orderNo}`);
};

window.setQuoteStatus = function(id, status) {
    const quote = getDBArray('teklifler').find(q => q.id === id);
    if (!quote) return;
    quote.durum = status;
    quote.durumTarihi = new Date().toLocaleString('tr-TR');
    saveDB();
    closeModal('modal-quote-detail');
};

function getQuoteData() {
    const islemTipi = document.getElementById('quote-type') ? document.getElementById('quote-type').value : 'lazer';
    const customerId = document.getElementById('quote-customer').value;
    const description = plainText(document.getElementById('quote-description').value);
    const readNumber = (id, fallback = 0) => {
        const raw = document.getElementById(id)?.value;
        if (raw === undefined || raw === null || plainText(raw) === '') return fallback;
        return Number(raw);
    };
    const minutes = readNumber('quote-minutes');
    const rate = readNumber('quote-rate');
    const kgAmount = readNumber('quote-kg-amount');
    const kgPrice = readNumber('quote-kg-price');
    
    const materialSelect = document.getElementById('quote-material');
    const stokId = materialSelect ? materialSelect.value : "0";
    const stokQty = readNumber('quote-material-qty');
    const discountPercent = readNumber('quote-discount');
    const taxRate = readNumber('quote-tax-rate', 20);

    if (!customerId) {
        alert("Lütfen müşteri seçin!");
        return null;
    }

    const cari = customerId === 'internal' ? null : db.cariler.find(c => c.id == customerId);
    if (customerId !== 'internal' && !cari) {
        alert('Seçilen cari bulunamadı. Cari listesini yenileyip tekrar deneyin.');
        return null;
    }

    const numericValues = [minutes, rate, kgAmount, kgPrice, stokQty, discountPercent, taxRate];
    if (!numericValues.every(Number.isFinite)) {
        alert('Teklif alanlarına geçerli sayılar girin.');
        return null;
    }
    if ([minutes, rate, kgAmount, kgPrice, stokQty].some(value => value < 0)) {
        alert('Süre, miktar ve birim fiyatlar negatif olamaz.');
        return null;
    }
    if (discountPercent < 0 || discountPercent > 100) {
        alert('İskonto oranı %0 ile %100 arasında olmalıdır.');
        return null;
    }
    if (taxRate < 0 || taxRate > 100) {
        alert('KDV oranı %0 ile %100 arasında olmalıdır.');
        return null;
    }

    const stok = db.stoklar.find(s => s.id == stokId);
    if (stokId !== '0' && !stok) {
        alert('Seçilen stok kaydı bulunamadı. Malzeme listesini yenileyip tekrar deneyin.');
        return null;
    }
    
    // Stok miktarı kontrolü
    if (stok) {
        const requiredQty = (islemTipi === 'hammadde') ? kgAmount : stokQty;
        const stockField = islemTipi === 'hammadde' ? 'kg' : 'miktar';
        const excludeOrderId = getQuoteReservationOrderId();
        try { if(requiredQty>0)validateStockUsage(stok,stockField,requiredQty,excludeOrderId); } catch(error){alert(error.message);return null;}
        const availableQty = getAvailableStockQuantity(stok, stockField, excludeOrderId);
        const physicalQty = Number(stok[stockField]) || 0;
        const reservedQty = getReservedStockQuantity(stok.id, stockField, excludeOrderId);
        const unitLabel = islemTipi === 'hammadde' ? 'KG' : 'adet/plaka';
        if (requiredQty > availableQty) {
            alert(`Yetersiz Stok! Fiziki: ${physicalQty}, rezerve: ${reservedQty}, kullanılabilir: ${availableQty} ${unitLabel}. Lütfen miktarı düşürün.`);
            return null;
        }
    }

    if (stok && stok.sahibiTipi!=='musteri' && Number(stok.maliyet)>0 && stokQty>0 && islemTipi!=='hammadde' && !getStockPlateWeight(stok)) { alert('Malzeme bedeli için stok kartındaki toplam KG ve plaka adedini tamamlayın.');return null; }
    const materialCostPerUnit = getStockPlateCost(stok);
    const amounts = calculateQuoteAmounts({
        islemTipi,
        minutes,
        rate,
        kgAmount,
        kgPrice,
        materialCostPerUnit,
        stokQty,
        discountPercent,
        taxRate
    });
    const {
        operationCost,
        materialCost,
        subTotalBeforeDiscount,
        discountAmount,
        subTotal,
        tax,
        total
    } = amounts;
    if (subTotalBeforeDiscount <= 0) {
        alert('Teklif toplamı sıfırdan büyük olmalıdır. Süre, miktar veya birim fiyatı kontrol edin.');
        return null;
    }
    if (total <= 0) {
        alert('İskonto sonrası teklif toplamı sıfırdan büyük olmalıdır.');
        return null;
    }

    const customerName = customerId === 'internal'
        ? "Kendi İşletmem (Firma İçi Üretim)"
        : cari.adi;

    return {
        islemTipi,
        customerId,
        customerName: customerName,
        description,
        minutes,
        rate,
        kgAmount,
        kgPrice,
        stokId,
        stokQty,
        operationCost,
        materialCost,
        subTotalBeforeDiscount,
        subTotal,
        tax,
        discountPercent,
        discountAmount,
        taxRate,
        total
    };
}

function printQuoteDocument(quoteData) {
    if (!quoteData) return;

    const quoteCari = findCariByReference(quoteData.customerId, quoteData.customerName);
    const tipLabel = getQuoteOperationMeta(quoteData.islemTipi).label;
    const taxRate = quoteData.taxRate ?? 20;
    const subTotal = quoteData.subTotal ?? Math.max(0, (quoteData.total || 0) - (quoteData.tax || 0));
    const documentDate = quoteData.tarih || new Date().toLocaleDateString('tr-TR');
    const description = quoteData.description || (quoteData.islemTipi === 'hammadde' ? `${quoteData.kgAmount || 0} KG hammadde satışı` : tipLabel);
    const operationDetail = quoteData.islemTipi === 'lazer'
        ? `${quoteData.minutes || 0} dakika × ${formatCurrency(quoteData.rate || 0)}`
        : `${quoteData.kgAmount || 0} KG × ${formatCurrency(quoteData.kgPrice || 0)}`;
    const lineItems = [];

    if (roundMoney(quoteData.operationCost || 0) > 0) {
        lineItems.push({
            title: tipLabel,
            description,
            detail: operationDetail,
            amount: roundMoney(quoteData.operationCost || 0)
        });
    }
    if (roundMoney(quoteData.materialCost || 0) > 0) {
        lineItems.push({
            title: quoteData.islemTipi === 'hammadde' ? 'Hammadde' : 'Malzeme Bedeli',
            description: quoteData.islemTipi === 'hammadde' ? description : 'İş kapsamında kullanılan malzeme',
            detail: quoteData.islemTipi === 'hammadde'
                ? operationDetail
                : `${quoteData.stokQty || 0} adet / plaka`,
            amount: roundMoney(quoteData.materialCost || 0)
        });
    }
    if (!lineItems.length) {
        lineItems.push({ title: tipLabel, description, detail: operationDetail, amount: roundMoney(quoteData.subTotalBeforeDiscount || subTotal || 0) });
    }

    const contentHTML = `
        ${getPrintBrandHTML('Fiyat Teklifi', getPrintMetaHTML([
            ...(quoteData.teklifNo ? [['Teklif No', quoteData.teklifNo]] : []),
            ['Tarih', documentDate]
        ]))}
        ${getPrintPartyHTML('Teklif Verilen', quoteData.customerName || quoteCari?.adi, quoteCari)}
        <div class="section-heading">
            <h2>Teklif Kalemleri</h2>
            <span>${lineItems.length} kalem</span>
        </div>
        <table class="quote-lines">
            <thead>
                <tr>
                    <th>No</th>
                    <th>Açıklama</th>
                    <th>Miktar / Birim Fiyat</th>
                    <th class="text-right">Tutar</th>
                </tr>
            </thead>
            <tbody>
                ${lineItems.map((item, index) => `
                    <tr>
                        <td class="quote-line-index">${String(index + 1).padStart(2, '0')}</td>
                        <td><strong>${escapeHTML(item.title)}</strong><div class="quote-line-description">${escapeHTML(item.description)}</div></td>
                        <td class="quote-line-calculation">${escapeHTML(item.detail)}</td>
                        <td class="number-cell"><strong>${escapeHTML(formatCurrency(item.amount))}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="document-footer-grid quote-footer">
            <div class="document-note">
                <span class="document-note-title">Teklif Koşulu</span>
                Verilen fiyatlar teklif tarihinden itibaren 15 gün geçerlidir.
            </div>
            ${getPrintTotalsHTML({ ...quoteData, subTotal, taxRate }, 'Teklif tutar özeti')}
        </div>
    `;

    openPrintPreview('Fiyat Teklifi', contentHTML, `
        .quote-intro { display: block; }
        .quote-lines { table-layout: fixed; }
        .quote-lines th:nth-child(1) { width: 7%; }
        .quote-lines th:nth-child(2) { width: 43%; }
        .quote-lines th:nth-child(3) { width: 30%; }
        .quote-lines th:nth-child(4) { width: 20%; }
        .quote-lines td { padding-top: 11px; padding-bottom: 11px; font-size: 10.5px; }
        .quote-line-index { color: var(--accent); font-size: 9px !important; font-weight: 700; }
        .quote-line-description { margin-top: 3px; color: var(--ink-soft); font-size: 9px; line-height: 1.45; }
        .quote-line-calculation { color: var(--ink-soft); }
        .quote-footer { margin-top: 24px; }
        .quote-footer .totals-panel .total-row td { padding-top: 11px; padding-bottom: 11px; }
        .quote-footer .totals-panel .total-row td:last-child { font-size: 17px; }
        .bank-details { margin-top: 34px; }
    `, {
        paymentFooter: true,
        share: {
            phone: quoteCari?.tel || quoteCari?.telefon || '',
            customerName: quoteData.customerName || quoteCari?.adi || '',
            documentNo: quoteData.teklifNo || ''
        }
    });
}

window.printCurrentQuote = function() {
    const quoteData = getQuoteData();
    if (!quoteData) return;
    printQuoteDocument(quoteData);
};

window.printQuoteById = function(id) {
    const quote = db.teklifler.find(q => q.id === id);
    if (!quote) return alert('Yazdırılacak teklif bulunamadı.');
    printQuoteDocument(quote);
};

window.loadQuote = function(id) {
    const quote = db.teklifler.find(q => q.id === id);
    if (!quote) return;

    document.getElementById('quote-type').value = quote.islemTipi || 'lazer';
    updateQuoteTypeUI();
    document.getElementById('quote-customer').value = quote.customerId;
    document.getElementById('quote-description').value = quote.description || '';
    document.getElementById('quote-minutes').value = quote.minutes || 0;
    document.getElementById('quote-rate').value = quote.rate || 120;
    document.getElementById('quote-kg-amount').value = quote.kgAmount || 0;
    document.getElementById('quote-kg-price').value = quote.kgPrice || 50;
    
    // Keep the saved material selectable even when this order consumed it.
    updateQuoteMaterials(quote.stokId);
    document.getElementById('quote-material').value = quote.stokId || "0";
    document.getElementById('quote-material-qty').value = quote.stokQty || 1;
    document.getElementById('quote-discount').value = quote.discountPercent ?? 0;
    document.getElementById('quote-tax-rate').value = quote.taxRate ?? 20;

    activeQuoteId = quote.id;
    activeQuoteFingerprint = getQuoteFingerprint(quote);
    
    // Auto calculate to update the UI
    document.getElementById('btn-calculate').click();
    
    // Switch to Quotation view if not already
    const quoteNavItem = Array.from(document.querySelectorAll('.nav-item')).find(n => n.getAttribute('data-target') === 'quotation');
    if (quoteNavItem) quoteNavItem.click();
}

function renderQuoteHistory() {
    const list = document.getElementById('quote-history-list');
    if (!list) return;
    
    const quotes = [...getFilteredQuotesForReport()].reverse();
    window.pageQuoteHistory = window.pageQuoteHistory || 1;
    const itemsPerPage = getListPageSize('quotes');
    const totalPages = Math.ceil(quotes.length / itemsPerPage) || 1;
    window.pageQuoteHistory = Math.min(Math.max(window.pageQuoteHistory, 1), totalPages);
    const startIndex = (window.pageQuoteHistory - 1) * itemsPerPage;
    const paginatedQuotes = quotes.slice(startIndex, startIndex + itemsPerPage);
    const pageInfo = document.getElementById('quotes-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pageQuoteHistory, totalPages, quotes.length, itemsPerPage);
    const previousButton = document.getElementById('btn-quotes-prev');
    const nextButton = document.getElementById('btn-quotes-next');
    if (previousButton) previousButton.disabled = window.pageQuoteHistory <= 1;
    if (nextButton) nextButton.disabled = window.pageQuoteHistory >= totalPages;

    if (quotes.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Henüz kaydedilen teklif yok.</p>';
        return;
    }
    
    list.innerHTML = paginatedQuotes.map(q => {
        const operationMeta = getQuoteOperationMeta(q.islemTipi);
        const tipLabel = operationMeta.shortLabel;
        return `
        <div class="glass-panel quote-history-item" style="padding:12px; margin-bottom:8px; font-size:13px; cursor:pointer;" onclick="showQuoteDetail(${q.id})">
            <div class="flex-between">
                <strong>${escapeHTML(q.teklifNo || 'Teklif')} - ${escapeHTML(q.customerName)}</strong>
                <span>${escapeHTML(q.tarih)}</span>
            </div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top:2px;">
                <span class="badge ${operationMeta.badgeClass}" style="font-size:10px; margin-right:4px;">${tipLabel}</span>
                ${escapeHTML(q.description || 'İş Tanımı Yok')}
            </div>
            <div class="flex-between" style="margin-top:4px;">
                <span class="text-primary" style="font-weight:bold;">${formatCurrency(q.total)}</span>
                <span>
                    <span class="badge ${q.durum === 'Onaylandı' ? 'success' : (q.durum === 'Reddedildi' ? 'alert' : 'warning')}" style="font-size:10px;">${escapeHTML(q.durum || 'Beklemede')}</span>
                    ${q.discountPercent > 0 ? `<span class="badge warning" style="font-size:10px;">%${q.discountPercent} İndirim</span>` : ''}
                </span>
            </div>
        </div>
    `}).join('');
}

window.showQuoteDetail = function(id) {
    const q = (db.teklifler || []).find(t => t.id === id);
    if (!q) return;

    const tipLabel = getQuoteOperationMeta(q.islemTipi).label;
    const statusClass = q.durum === 'Onaylandı' ? 'success' : (q.durum === 'Reddedildi' ? 'alert' : 'warning');
    const detailItems = [
        { label: 'İşlem türü', value: tipLabel },
        { label: 'Malzeme bedeli', value: formatCurrency(q.materialCost || 0) },
        { label: 'KDV oranı', value: `%${q.taxRate ?? 20}` }
    ];

    if (q.islemTipi === 'lazer') {
        detailItems.splice(1, 0,
            { label: 'Kesim süresi', value: `${q.minutes || 0} dakika` },
            { label: 'Dakika ücreti', value: formatCurrency(q.rate || 0) }
        );
    } else {
        detailItems.splice(1, 0,
            { label: 'Ağırlık', value: `${q.kgAmount || 0} KG` },
            { label: 'KG birim fiyatı', value: formatCurrency(q.kgPrice || 0) }
        );
    }

    if (q.stokId && q.stokId !== "0") {
        const stok = db.stoklar.find(s => s.id == q.stokId);
        if (stok) {
            detailItems.push({
                label: 'Malzeme',
                value: `${escapeHTML(stok.cinsi)} (${escapeHTML(stok.mm)} mm) · ${escapeHTML(q.stokQty || 0)} adet/plaka`
            });
        }
    }

    if (q.discountPercent > 0) {
        detailItems.push({ label: 'İndirim', value: `%${q.discountPercent} · ${formatCurrency(q.discountAmount || 0)}` });
    }

    const detailCards = detailItems.map(item => `
        <div class="quote-detail-fact">
            <span>${escapeHTML(item.label)}</span>
            <strong>${item.value}</strong>
        </div>
    `).join('');
    const orderAction = q.orderNo
        ? `<button class="btn btn-outline quote-detail-primary-action" type="button" disabled><i class="fa-solid fa-circle-check"></i><span>İş emri oluşturuldu<small>${escapeHTML(q.orderNo)}</small></span></button>`
        : `<button class="btn btn-primary quote-detail-primary-action" type="button" onclick="approveSavedQuoteAsOrder(${q.id})"><i class="fa-solid fa-check"></i><span>İş Emrine Çevir<small>Onayla ve üretime aktar</small></span></button>`;

    const html = `
        <div class="modal-content glass-panel quote-detail-modal">
            <div class="quote-detail-header">
                <div>
                    <span class="quote-detail-kicker">Teklif detayı</span>
                    <h3>${escapeHTML(q.customerName || 'Müşteri belirtilmedi')}</h3>
                    <div class="quote-detail-meta">
                        <span><i class="fa-solid fa-hashtag"></i>${escapeHTML(q.teklifNo || '-')}</span>
                        <span><i class="fa-regular fa-calendar"></i>${escapeHTML(q.tarih || '-')}</span>
                    </div>
                </div>
                <div class="quote-detail-header-actions">
                    <span class="badge ${statusClass}">${escapeHTML(q.durum || 'Beklemede')}</span>
                    <button class="btn-close" type="button" aria-label="Teklif detayını kapat" onclick="closeModal('modal-quote-detail')"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            ${q.description ? `<div class="quote-detail-description"><span>İş açıklaması</span><p>${escapeHTML(q.description)}</p></div>` : ''}
            <div class="quote-detail-facts">${detailCards}</div>
            <div class="quote-detail-total">
                <span>Genel toplam<small>KDV dahil teklif tutarı</small></span>
                <strong>${formatCurrency(q.total)}</strong>
            </div>
            <div class="quote-detail-actions">
                ${orderAction}
                <button class="btn btn-outline" type="button" onclick="loadQuote(${q.id}); closeModal('modal-quote-detail');"><i class="fa-solid fa-pen"></i> Forma Yükle</button>
                <button class="btn btn-outline" type="button" onclick="printQuoteById(${q.id})"><i class="fa-solid fa-print"></i> Yazdır</button>
            </div>
            <div class="quote-detail-status-actions" aria-label="Teklif durumu işlemleri">
                <span>Durumu güncelle</span>
                <button class="btn btn-outline" type="button" onclick="setQuoteStatus(${q.id}, 'Revize Edildi')"><i class="fa-solid fa-rotate"></i> Revize</button>
                <button class="btn btn-danger" type="button" onclick="setQuoteStatus(${q.id}, 'Reddedildi')"><i class="fa-solid fa-ban"></i> Reddet</button>
            </div>
        </div>`;
    
    let modal = document.getElementById('modal-quote-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-quote-detail';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    openModal('modal-quote-detail');
    modal.onclick = function(e) { if (e.target === modal) closeModal('modal-quote-detail'); };
}

function renderOrders() {
    try {
        const tbody = document.getElementById('orders-tbody');
        if (!tbody) return;
        
        updateNotifications(); // Update bell badge
        
        const orders = getFilteredOrdersForReport();
        const reversedOrders = applyListSort('orders', [...orders].reverse(), {
            number: item => item.orderNo || '',
            customer: item => item.customerName || '',
            description: item => item.description || item.islemTipi || '',
            amount: item => Number(item.total) || 0,
            status: item => item.durum || ''
        });

        // Sayfalama (Pagination) - İş Emirleri
        window.pageOrders = window.pageOrders || 1;
        const itemsPerPage = getListPageSize('orders');
        const totalPages = Math.ceil(reversedOrders.length / itemsPerPage) || 1;
        
        if (window.pageOrders > totalPages) window.pageOrders = totalPages;
        if (window.pageOrders < 1) window.pageOrders = 1;

        const startIndex = (window.pageOrders - 1) * itemsPerPage;
        const paginatedItems = reversedOrders.slice(startIndex, startIndex + itemsPerPage);

        // Update pagination UI
        const pageInfo = document.getElementById('orders-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageOrders, totalPages, reversedOrders.length, itemsPerPage);

        const btnPrev = document.getElementById('btn-orders-prev');
        const btnNext = document.getElementById('btn-orders-next');
        
        if (btnPrev) btnPrev.disabled = window.pageOrders <= 1;
        if (btnNext) btnNext.disabled = window.pageOrders >= totalPages;

        tbody.innerHTML = paginatedItems.length ? paginatedItems.map(o => {
            const operationMeta = getQuoteOperationMeta(o.islemTipi);
            return `
            <tr>
                ${renderSelectionCell('orders', o.id)}
                <td style="width:100px;"><button type="button" class="order-code-button" onclick="openOrderHistory(${o.id})" title="İş emri detayını aç">${escapeHTML(o.orderNo || '-')}</button></td>
                <td><strong>${escapeHTML(o.customerName || '-')}</strong></td>
                <td style="color:var(--text-muted); font-size:13px;">
                    <span class="badge ${operationMeta.badgeClass}" style="margin-right:6px; font-size:10px;">${operationMeta.shortLabel}</span>
                    ${o.islemTipi === 'hammadde' ? `${escapeHTML(o.kgAmount || 0)} KG Satış` : escapeHTML(o.description || '-')}
                </td>
                <td style="text-align:right; font-weight:600; color:var(--success);">${formatCurrency(o.total)}</td>
                <td style="text-align:center;"><span class="badge ${o.durum === 'Teslim Edildi' ? 'success' : 'warning'}">${escapeHTML(o.durum || 'Beklemede')}</span></td>
                <td style="text-align:right;">
                    <div class="order-action-stack">
                        <button class="btn btn-outline order-row-action-button" aria-label="Bağlı kayıtları aç" title="Bağlı teklif, cari, stok, fatura ve ödemeleri aç" onclick="openOrderHistory(${o.id})"><i class="fa-solid fa-link" aria-hidden="true"></i><span>Bağlantılar</span></button>
                        <button class="btn btn-outline order-row-action-button" aria-label="Kârlılık detayını aç" title="İş emri kârlılık detayını aç" onclick="openOrderProfitability(${o.id})"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><span>Kârlılık</span></button>
                        ${o.durum !== 'İptal' && sheetCutOrderUsage(o)?.field === 'miktar' ? `<button type="button" class="btn btn-outline order-row-action-button" onclick="openOrderSheetCut(${o.id})"><i class="fa-solid fa-scissors" aria-hidden="true"></i> Kesim / Kalan Parça</button>` : ''}
                        <button class="btn btn-outline order-row-action-button" aria-label="İş emri durumunu değiştir" title="İş emri durumunu değiştir" onclick="openOrderStatusModal(${o.id})"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i><span>Durumu Değiştir</span></button>
                    </div>
                </td>
            </tr>
        `;
        }).join('') : renderTableEmptyState(7, 'Henüz iş emri kaydı yok.', 'Onaylanan teklifler iş emri olarak burada görünecek.', 'fa-clipboard-list');
        updateReportSelectionUI('orders');
    } catch(e) {
        console.error("renderOrders error:", e);
    }
}

window.prevOrdersPage = function() {
    if (window.pageOrders > 1) {
        window.pageOrders--;
        renderOrders();
    }
}

window.nextOrdersPage = function() {
    window.pageOrders = (window.pageOrders || 1) + 1;
    renderOrders();
}

function formatProfitPercent(value) {
    const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `%${safeValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderProfitability() {
    const tbody = document.getElementById('profitability-tbody');
    if (!tbody) return;

    const rows = getFilteredProfitabilityOrders();
    const summary = rows.reduce((totals, order) => {
        const result = getOrderProfitability(order);
        totals.revenue += result.profitNetRevenue;
        totals.cost += result.costTotal;
        totals.profit += result.grossProfit;
        if (getProfitabilityStatus(order) !== 'Kesin') totals.incomplete += 1;
        return totals;
    }, { revenue: 0, cost: 0, profit: 0, incomplete: 0 });
    summary.revenue = roundMoney(summary.revenue);
    summary.cost = roundMoney(summary.cost);
    summary.profit = roundMoney(summary.profit);
    summary.margin = summary.revenue > 0 ? roundMoney((summary.profit / summary.revenue) * 100) : 0;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('profit-stat-revenue', formatCurrency(summary.revenue));
    setText('profit-stat-cost', formatCurrency(summary.cost));
    setText('profit-stat-profit', formatCurrency(summary.profit));
    setText('profit-stat-margin', formatProfitPercent(summary.margin));
    setText('profit-stat-incomplete', String(summary.incomplete));
    const profitCard = document.getElementById('profit-stat-profit-card');
    if (profitCard) {
        profitCard.classList.toggle('profit-negative', summary.profit < 0);
        profitCard.classList.toggle('profit-positive', summary.profit >= 0);
    }

    const reversedRows = applyListSort('profitability', [...rows].reverse(), {
        number: item => item.orderNo || '',
        date: item => parseTRDate(getReportDateValue('profitability', item) || ''),
        customer: item => item.customerName || '',
        revenue: item => getOrderProfitability(item).profitNetRevenue,
        cost: item => getOrderProfitability(item).costTotal,
        profit: item => getOrderProfitability(item).grossProfit,
        margin: item => getOrderProfitability(item).profitMargin,
        status: item => getProfitabilityStatus(item)
    });
    window.pageProfitability = window.pageProfitability || 1;
    const itemsPerPage = getListPageSize('profitability');
    const totalPages = Math.ceil(reversedRows.length / itemsPerPage) || 1;
    window.pageProfitability = Math.min(Math.max(window.pageProfitability, 1), totalPages);
    const startIndex = (window.pageProfitability - 1) * itemsPerPage;
    const paginatedRows = reversedRows.slice(startIndex, startIndex + itemsPerPage);

    setText('profitability-page-info', formatListPagination(window.pageProfitability, totalPages, reversedRows.length, itemsPerPage));
    const prevButton = document.getElementById('btn-profitability-prev');
    const nextButton = document.getElementById('btn-profitability-next');
    if (prevButton) prevButton.disabled = window.pageProfitability <= 1;
    if (nextButton) nextButton.disabled = window.pageProfitability >= totalPages;

    tbody.innerHTML = paginatedRows.length ? paginatedRows.map(order => {
        const result = getOrderProfitability(order);
        const profitClass = result.grossProfit < 0 ? 'profit-value-negative' : 'profit-value-positive';
        const description = order.islemTipi === 'hammadde'
            ? `${order.kgAmount || 0} KG hammadde satışı`
            : (order.description || '-');
        return `
            <tr>
                ${renderSelectionCell('profitability', order.id)}
                <td><strong>${escapeHTML(order.orderNo || '-')}</strong><small class="profitability-row-sub">${escapeHTML(order.durum || 'Beklemede')}</small></td>
                <td>${escapeHTML(getReportDateValue('profitability', order) || '-')}</td>
                <td><strong>${escapeHTML(order.customerName || '-')}</strong><small class="profitability-row-sub">${escapeHTML(description)}</small></td>
                <td class="profitability-number">${formatCurrency(result.profitNetRevenue)}</td>
                <td class="profitability-number">${formatCurrency(result.costTotal)}</td>
                <td class="profitability-number ${profitClass}">${formatCurrency(result.grossProfit)}</td>
                <td class="profitability-number ${profitClass}">${formatProfitPercent(result.profitMargin)}</td>
                <td>${getProfitabilityStatusBadge(order)}</td>
                <td><button class="btn btn-outline table-action-button profitability-detail-btn" aria-label="Kârlılık detayını aç" title="Kârlılık detayını aç" onclick="openOrderProfitability(${order.id})"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Detay</button></td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="10" class="profitability-empty"><i class="fa-solid fa-chart-line"></i><strong>Bu kapsamda iş emri bulunamadı.</strong><span>Tarih veya rapor kapsamını değiştirin.</span></td></tr>';
    updateReportSelectionUI('profitability');
}

window.renderProfitability = renderProfitability;

window.prevProfitabilityPage = function() {
    if ((window.pageProfitability || 1) > 1) {
        window.pageProfitability--;
        renderProfitability();
    }
};

window.nextProfitabilityPage = function() {
    window.pageProfitability = (window.pageProfitability || 1) + 1;
    renderProfitability();
};

function getProfitabilityFormValues() {
    const read = id => Number(document.getElementById(id)?.value || 0);
    return {
        costMaterial: read('input-profit-cost-material'),
        costMachineMinutes: read('input-profit-machine-minutes'),
        costMachineRate: read('input-profit-machine-rate'),
        costLaborHours: read('input-profit-labor-hours'),
        costLaborRate: read('input-profit-labor-rate'),
        costExternal: read('input-profit-external'),
        costShipping: read('input-profit-shipping'),
        costOther: read('input-profit-other'),
        costScrapRecovery: read('input-profit-scrap')
    };
}

window.openOrderProfitability = function(id) {
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(id));
    if (!order) return alert('İş emri bulunamadı.');
    const result = getOrderProfitability(order);
    const setValue = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element) element.value = value;
    };

    setValue('input-profitability-order-id', order.id);
    setValue('input-profit-cost-material', result.costMaterial);
    setValue('input-profit-machine-minutes', result.costMachineMinutes);
    setValue('input-profit-machine-rate', result.costMachineRate);
    setValue('input-profit-labor-hours', result.costLaborHours);
    setValue('input-profit-labor-rate', result.costLaborRate);
    setValue('input-profit-external', result.costExternal);
    setValue('input-profit-shipping', result.costShipping);
    setValue('input-profit-other', result.costOther);
    setValue('input-profit-scrap', result.costScrapRecovery);

    const title = document.getElementById('profitability-modal-order-no');
    const customer = document.getElementById('profitability-modal-customer');
    const revenue = document.getElementById('profitability-modal-revenue');
    const status = document.getElementById('profitability-modal-status');
    if (title) title.textContent = `${order.orderNo || 'İş Emri'} Kârlılığı`;
    if (customer) customer.textContent = `${order.customerName || '-'} / ${order.description || (order.islemTipi === 'hammadde' ? 'Hammadde satışı' : '-')}`;
    if (revenue) revenue.textContent = formatCurrency(result.profitNetRevenue);
    if (status) {
        status.textContent = getProfitabilityStatus(order);
        status.dataset.status = getProfitabilityStatus(order);
    }

    const stock = getDBArray('stoklar').find(item => String(item.id) === String(order.stokId));
    const materialHelp = document.getElementById('profitability-material-help');
    if (materialHelp) {
        materialHelp.textContent = stock?.sahibiTipi === 'musteri'
            ? 'Müşteri malzemesi olduğu için otomatik maliyet sıfırdır.'
            : (stock ? `${stock.cinsi || 'Stok'} birim maliyetinden başlangıç değeri oluşturuldu.` : 'Bağlı stok bulunmadığı için maliyeti manuel girin.');
    }
    window.updateProfitabilityPreview();
    openModal('modal-order-profitability');
};

window.updateProfitabilityPreview = function() {
    const orderId = document.getElementById('input-profitability-order-id')?.value;
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(orderId));
    if (!order) return;
    const result = calculateOrderProfitability(order, getProfitabilityFormValues());
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('profit-preview-machine', formatCurrency(result.costMachine));
    setText('profit-preview-labor', formatCurrency(result.costLabor));
    setText('profit-preview-total-cost', formatCurrency(result.costTotal));
    setText('profit-preview-gross-profit', formatCurrency(result.grossProfit));
    setText('profit-preview-margin', formatProfitPercent(result.profitMargin));
    ['profit-preview-gross-profit', 'profit-preview-margin'].forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.classList.toggle('profit-value-negative', result.grossProfit < 0);
        element.classList.toggle('profit-value-positive', result.grossProfit >= 0);
    });
};

window.saveOrderProfitability = function() {
    const orderId = document.getElementById('input-profitability-order-id')?.value;
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(orderId));
    if (!order) return alert('İş emri bulunamadı.');
    const values = getProfitabilityFormValues();
    const numericValues = Object.values(values);
    if (!numericValues.every(Number.isFinite) || numericValues.some(value => value < 0)) {
        return alert('Maliyet alanlarına sıfır veya pozitif geçerli sayılar girin.');
    }

    const grossCost = roundMoney(
        values.costMaterial +
        (values.costMachineMinutes * values.costMachineRate) +
        (values.costLaborHours * values.costLaborRate) +
        values.costExternal + values.costShipping + values.costOther
    );
    if (values.costScrapRecovery > grossCost) {
        return alert('Fire geri kazanım değeri toplam maliyetten büyük olamaz.');
    }

    applyOrderProfitability(order, values, 'Kesin');
    order.costUpdatedAt = new Date().toLocaleString('tr-TR');
    order.costConfirmedAt = order.costUpdatedAt;
    addAuditLog('Kesinleştirildi', 'İş Emri Maliyeti', order.id, `${order.orderNo || '-'} / Maliyet: ${formatCurrency(order.costTotal)} / Kâr: ${formatCurrency(order.grossProfit)}`);
    saveDB();
    closeModal('modal-order-profitability');
    renderOrders();
    renderProfitability();
    alert(`${order.orderNo || 'İş emri'} maliyeti kesinleştirildi.`);
};

window.openOrderStatusModal = function(id) {
    const order = db.isEmirleri.find(o => o.id === id);
    if (!order) return;
    document.getElementById('input-order-id').value = id;
    const currentStatus = order.durum || 'Beklemede';
    const statusSelect = document.getElementById('input-order-status');
    const allowedStatuses = [currentStatus, ...(ORDER_STATUS_TRANSITIONS[currentStatus] || [])];
    statusSelect.innerHTML = allowedStatuses.map(status => `<option value="${escapeHTML(status)}">${escapeHTML(status)}</option>`).join('');
    statusSelect.value = currentStatus;
    openModal('modal-order-status');
}

function getOrderLinkedRecords(order) {
    const quote = getDBArray('teklifler').find(item =>
        String(item.id) === String(order.quoteId) || String(item.orderId) === String(order.id)
    ) || null;
    const cari = findCariByReference(order.customerId, order.customerName);
    const stock = order.stokId && String(order.stokId) !== '0'
        ? getDBArray('stoklar').find(item => String(item.id) === String(order.stokId)) || null
        : null;
    const invoice = getDBArray('faturalar').find(item => String(item.orderId) === String(order.id)) || null;
    const payments = getDBArray('islemler').filter(item =>
        String(item.orderId) === String(order.id) && isIncomeMovement(item) && !item.reversedBy
    );
    return { quote, cari, stock, invoice, payments };
}

function navigateToLinkedModule(moduleName, afterNavigate) {
    closeModal('modal-order-history');
    window.location.hash = moduleName;
    switchView(moduleName);
    setTimeout(() => afterNavigate?.(), 80);
}

window.openOrderCollection = function(orderId) {
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(orderId));
    const cari = order ? findCariByReference(order.customerId, order.customerName) : null;
    if (!order || !cari) return alert('İş emri veya bağlı cari bulunamadı.');
    const paidTotal = getOrderLinkedRecords(order).payments.reduce((total, item) => total + (Number(item.tutar) || 0), 0);
    const remaining = roundMoney(Math.max((Number(order.total) || 0) - paidTotal, 0));

    navigateToLinkedModule('accounts', () => {
        openIslemModal(cari.id, cari.adi);
        document.getElementById('input-islem-tipi').value = 'tahsilat';
        document.getElementById('input-islem-payment-order-id').value = order.id;
        document.getElementById('input-islem-aciklama').value = `${order.orderNo || 'İş emri'} tahsilatı`;
        document.getElementById('input-islem-tutar').value = remaining > 0 ? remaining : '';
        updateIslemTipiInfo();
        updateTahsilatSummary();
    });
};

window.openOrderInvoice = function(orderId) {
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(orderId));
    if (!order) return alert('İş emri bulunamadı.');
    const linkedInvoice = getDBArray('faturalar').find(item => String(item.orderId) === String(order.id));
    if (linkedInvoice) {
        navigateToLinkedModule('invoices', () => showFaturaDetail(linkedInvoice.id));
        return;
    }
    if (order.durum !== 'Teslim Edildi') return alert('Fatura oluşturmak için iş emrinin teslim edilmiş olması gerekir.');

    navigateToLinkedModule('invoices', () => {
        invoiceTabFilter = 'kesilen';
        renderCariler();
        renderInvoices();
        openFaturaModal();
        const firmSelect = document.getElementById('input-fatura-firma');
        if (firmSelect) firmSelect.value = String(order.customerId);
        populateInvoiceOrderOptions();
        const orderSelect = document.getElementById('input-fatura-order');
        if (orderSelect) orderSelect.value = String(order.id);
        applyInvoiceOrderSelection();
    });
};

window.openOrderLinkedRecord = function(orderId, type) {
    const order = getDBArray('isEmirleri').find(item => String(item.id) === String(orderId));
    if (!order) return alert('İş emri bulunamadı.');
    const linked = getOrderLinkedRecords(order);
    if (type === 'quote' && linked.quote) return navigateToLinkedModule('quotation', () => showQuoteDetail(linked.quote.id));
    if (type === 'cari' && linked.cari) return navigateToLinkedModule('accounts', () => openCariDetay(linked.cari.id));
    if (type === 'stock' && linked.stock) return navigateToLinkedModule('inventory', () => openStokDuzenleModal(linked.stock.id));
    if (type === 'invoice') return openOrderInvoice(order.id);
    if (type === 'payment') {
        if (!linked.payments.length) return openOrderCollection(order.id);
        return navigateToLinkedModule('accounts', () => {
            openCariDetay(linked.cari?.id || order.customerId);
            showToast({ type: 'info', title: `${order.orderNo || 'İş emri'} tahsilatları`, message: `${linked.payments.length} bağlı tahsilat cari ekstresinde gösteriliyor.` });
        });
    }
    alert('Bu iş emrinde seçilen türde bağlı kayıt bulunmuyor.');
};

function renderOrderLinkedRecords(order) {
    const container = document.getElementById('history-linked-records');
    if (!container) return;
    const linked = getOrderLinkedRecords(order);
    const paidTotal = linked.payments.reduce((total, item) => total + (Number(item.tutar) || 0), 0);
    const cards = [
        { type: 'quote', icon: 'fa-file-invoice-dollar', label: 'Teklif', value: linked.quote?.teklifNo || 'Bağlı teklif yok', enabled: !!linked.quote },
        { type: 'cari', icon: 'fa-user-tie', label: 'Cari', value: linked.cari?.adi || order.customerName || 'Cari bulunamadı', enabled: !!linked.cari },
        { type: 'stock', icon: 'fa-boxes-stacked', label: 'Stok', value: linked.stock ? `${getStockDisplayCode(linked.stock)} ${linked.stock.cinsi || ''}`.trim() : 'Müşteri malzemesi', enabled: !!linked.stock },
        { type: 'invoice', icon: 'fa-file-invoice', label: 'Fatura', value: linked.invoice?.faturaNo || (order.durum === 'Teslim Edildi' ? 'Fatura oluştur' : 'Teslimat bekleniyor'), enabled: !!linked.invoice || order.durum === 'Teslim Edildi', action: !linked.invoice },
        { type: 'payment', icon: 'fa-money-bill-transfer', label: 'Ödeme', value: linked.payments.length ? `${formatCurrency(paidTotal)} tahsil edildi` : 'Tahsilat ekle', enabled: !!linked.cari, action: !linked.payments.length }
    ];

    container.replaceChildren();
    cards.forEach(card => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `order-linked-card${card.action ? ' is-action' : ''}`;
        button.disabled = !card.enabled;
        button.setAttribute('aria-label', `${card.label}: ${card.value}`);
        const label = document.createElement('span');
        const icon = document.createElement('i');
        icon.className = `fa-solid ${card.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        label.append(icon, document.createTextNode(card.label));
        const value = document.createElement('strong');
        value.textContent = card.value;
        button.append(label, value);
        if (card.enabled) button.addEventListener('click', () => openOrderLinkedRecord(order.id, card.type));
        container.appendChild(button);
    });
}

window.openOrderHistory = function(id) {
    const order = db.isEmirleri.find(o => o.id === id);
    if (!order) return;

    document.getElementById('history-order-no').textContent = order.orderNo;
    document.getElementById('history-customer-name').textContent = order.customerName || 'Bilinmeyen Müşteri';
    renderOrderLinkedRecords(order);

    const matInfoContainer = document.getElementById('history-material-info');
    const matDetailsText = document.getElementById('history-material-details');
    
    let infoText = '';
    
    if (isKgPricedOperation(order.islemTipi)) {
        infoText += `<span style="display:inline-block; margin-bottom:6px; color:var(--success);">İşlem Hacmi: <strong>${order.kgAmount || 0} KG</strong> (Birim: ${formatCurrency(order.kgPrice || 0)})</span><br>`;
    }
    
    if (order.stokId && order.stokId !== "0") {
        const stok = db.stoklar.find(s => s.id == order.stokId);
        if (stok) {
            const stockUsage = order.islemTipi === 'hammadde'
                ? `${order.kgAmount || 0} KG`
                : `${order.stokQty || 0} Adet/Plaka`;
            infoText += `<span style="color:var(--primary);">${escapeHTML(stok.cinsi || '-')} (${escapeHTML(stok.mm || '-')}mm)</span> &nbsp;&mdash;&nbsp; Ebat: ${escapeHTML(stok.ebat || '-')} &nbsp;&mdash;&nbsp; Düşülecek Stok: <strong style="color:var(--warning);">${escapeHTML(stockUsage)}</strong> ${stok.sahibiTipi === 'musteri' ? '<span class="badge" style="background:rgba(233,196,106,0.2); color:var(--warning);">Emanet</span>' : ''}`;
        }
    }
    
    if (infoText !== '') {
        matDetailsText.innerHTML = infoText;
        matInfoContainer.style.display = 'block';
    } else {
        matInfoContainer.style.display = 'none';
    }

    let historyHTML = '';
    
    if (order.statusHistory && order.statusHistory.length > 0) {
        historyHTML = order.statusHistory.map(h => `
            <tr>
                <td style="color:var(--text-muted);">${escapeHTML(h.date || '-')}</td>
                <td><span class="badge ${h.status === 'Beklemede' ? 'warning' : (h.status === 'Üretimde' ? 'primary' : (h.status === 'Teslim Edildi' ? 'success' : 'alert'))}">${escapeHTML(h.status || '-')}</span></td>
            </tr>
        `).join('');
    } else {
        // Fallback for old orders without history tracking
        historyHTML = `
            <tr>
                <td style="color:var(--text-muted);">${escapeHTML(order.tarih || '-')}</td>
                <td><span class="badge warning">Oluşturuldu (Beklemede)</span></td>
            </tr>
            <tr>
                <td style="color:var(--text-muted);">${new Date().toLocaleDateString('tr-TR')}</td>
                <td><span class="badge ${order.durum === 'Beklemede' ? 'warning' : (order.durum === 'Üretimde' ? 'primary' : (order.durum === 'Teslim Edildi' ? 'success' : 'alert'))}">${escapeHTML(order.durum || 'Beklemede')} (Güncel)</span></td>
            </tr>
        `;
    }

    document.getElementById('history-tbody').innerHTML = historyHTML;
    openModal('modal-order-history');
}

window.updateOrderStatus = function() {
    const id = parseInt(document.getElementById('input-order-id').value);
    const newStatus = document.getElementById('input-order-status').value;
    const order = db.isEmirleri.find(o => o.id === id);
    if (!order) return alert('İş emri bulunamadı.');

    const oldStatus = order.durum || 'Beklemede';
    if (oldStatus === newStatus) {
        closeModal('modal-order-status');
        return;
    }
    const allowedTransitions = ORDER_STATUS_TRANSITIONS[oldStatus] || [];
    if (!allowedTransitions.includes(newStatus)) return alert(`${oldStatus} durumundan ${newStatus} durumuna geçilemez.`);

    const tutar = roundMoney(order.total);
    const isInternalOrder = order.customerId === 'internal';
    const movingToDelivered = newStatus === 'Teslim Edildi' && oldStatus !== 'Teslim Edildi';
    const cancellingOrder = newStatus === 'İptal';

    if (cancellingOrder && getActiveSheetCutForOrder(order.id)) return alert('Bu işin kalan parçaları kayıtlı. Önce Kesim Geçmişi bölümünden kesimi geri alın.');
    if (cancellingOrder) {
        const linkedInvoice = getDBArray('faturalar').find(fatura => String(fatura.orderId) === String(order.id));
        if (linkedInvoice) return alert(`Bu iş emrine ${linkedInvoice.faturaNo || 'bir fatura'} bağlı. İş emrini iptal etmeden önce bağlı faturayı Faturalar bölümünden silin veya iptal edin.`);
    }

    let stok = null;
    let deductQty = 0;
    let deductField = 'miktar';
    if (movingToDelivered && !order.stokDusuldu && order.stokId && order.stokId !== '0') {
        stok = db.stoklar.find(s => s.id == order.stokId);
        if (stok) {
            deductQty = order.islemTipi === 'hammadde' ? (order.kgAmount || 0) : (order.stokQty || 0);
            deductField = order.islemTipi === 'hammadde' ? 'kg' : 'miktar';
            if (stok.originCutId && (deductField !== 'miktar' || !Number.isInteger(deductQty))) return alert('Kalan parçalar tam adetle kullanılır. Bölmek için Kesim / Kalan Parça işlemini kullanın.');
            const availableQty = getAvailableStockQuantity(stok, deductField, order.id);
            const physicalQty = Number(stok[deductField]) || 0;
            const reservedForOthers = getReservedStockQuantity(stok.id, deductField, order.id);
            const unitLabel = order.islemTipi === 'hammadde' ? 'KG' : 'adet/plaka';
            if (deductQty > availableQty) {
                return alert(`Stok yetersiz: Bu iş için ${deductQty} ${unitLabel} gerekiyor. Fiziki stok ${physicalQty}, diğer işlere rezerve ${reservedForOthers}, kullanılabilir ${availableQty} ${unitLabel}.`);
            }
        }
    }

    const completeStatusUpdate = reflectToCari => {
        if (quickSaleSaving || sheetCutSaving || !getDBArray('isEmirleri').includes(order) || (order.durum || 'Beklemede') !== oldStatus) return alert('Kayıt değişti. İş emrini yeniden açın.');
        if (cancellingOrder && getActiveSheetCutForOrder(order.id)) return alert('Önce Kesim Geçmişi bölümünden kesimi geri alın.');
        let secondary=null;
        if(movingToDelivered&&!order.stokDusuldu&&order.stokId&&String(order.stokId)!=='0'&&Number(order.islemTipi==='hammadde'?order.kgAmount:order.stokQty)!==0) {
            stok=db.stoklar.find(s=>String(s.id)===String(order.stokId));
            try { secondary=validateStockUsage(stok,deductField,deductQty,order.id); }
            catch(error){return alert(error.message);}
        }
        if(cancellingOrder&&order.stokDusuldu&&!db.stoklar.some(s=>String(s.id)===String(order.stokId)))return alert('Stok kaydı eksik; iptal işlemi uygulanmadı.');
        let cariYansitilacak = null;
        if (movingToDelivered && !order.bakiyeCariyeYansitildi && reflectToCari && !isInternalOrder) {
            cariYansitilacak = findCariByReference(order.customerId, order.customerName);
            if (!cariYansitilacak) return alert(`Cari bulunamadı: ${order.customerName || 'Bilinmeyen müşteri'}\n\nİş emri durumu değiştirilmedi.`);
        }

        let cariIptalEdilecek = null;
        if (cancellingOrder && order.bakiyeCariyeYansitildi === true && !isInternalOrder) {
            cariIptalEdilecek = findCariByReference(order.customerId, order.customerName);
            if (!cariIptalEdilecek) return alert(`Cari bulunamadı: ${order.customerName || 'Bilinmeyen müşteri'}\n\nİş emri iptal edilmedi; cari etkisi geri alınamadı.`);
        }

        const impacts = [];
        order.durum = newStatus;
        if (!order.statusHistory) order.statusHistory = [{ status: oldStatus, date: `${order.tarih} 00:00` }];
        order.statusHistory.push({
            status: newStatus,
            date: `${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
        });

        if (movingToDelivered) {
            applyOrderProfitability(order, {}, getProfitabilityStatus(order));
            order.teslimTarihi = new Date().toLocaleDateString('tr-TR');
            order.stokRezervasyonKapatmaTarihi = new Date().toLocaleString('tr-TR');
        }

        if (cariYansitilacak) {
            const hareket = addCariMovement(cariYansitilacak, {
                tip: `İş Emri Borçlandırma (${order.orderNo})`, aciklama: `Durum: ${newStatus}`,
                tutar, bakiyeDegisimi: tutar, orderId: order.id, orderNo: order.orderNo,
                isSuccess: false, isGelir: false
            });
            order.bakiyeCariyeYansitildi = true;
            order.cariIslemId = hareket?.id || null;
            order.cariYansimaTarihi = new Date().toLocaleString('tr-TR');
            impacts.push({ label: 'Cari', value: tutar });
        }

        if (movingToDelivered && stok && !order.stokDusuldu && deductQty>0) {
            const oncekiStok = Number(stok[deductField]) || 0;
            order.stockTrackingVersion=2;
            if(secondary) {
                const movementId=changeSheetStock(stok,secondary.field,-secondary.quantity,'İş Emri Teslim',order.orderNo);
                if(secondary.field==='kg'){order.stokDusulenKg=secondary.quantity;order.stockKgMovementId=movementId;}
                else{order.stokDusulenPlaka=secondary.quantity;order.stockPlateMovementId=movementId;}
            }
            stok[deductField] = roundMoney(oncekiStok - deductQty);
            order.stokDusuldu = true;
            order.stokDusulenMiktar = deductQty;
            order.stokDusulenAlan = deductField;
            addStokMovement(stok, {
                tip: 'İş Emri Teslim', alan: deductField, miktar: -deductQty,
                onceki: oncekiStok, sonraki: stok[deductField],
                aciklama: `${order.orderNo || 'İş emri'} teslim edildi`, ref: order.orderNo || ''
            });
            impacts.push({ label: 'Stok', value: -deductQty, unit: deductField === 'kg' ? 'KG' : 'adet' });
        }

        if (cancellingOrder && order.bakiyeCariyeYansitildi === true && cariIptalEdilecek) {
            addCariMovement(cariIptalEdilecek, {
                tip: `İş Emri İptal (${order.orderNo})`, aciklama: 'İş emri iptal edildi, borç geri alındı',
                tutar, bakiyeDegisimi: -tutar, orderId: order.id, orderNo: order.orderNo,
                isSuccess: false, isGelir: false
            });
            order.bakiyeCariyeYansitildi = false;
            order.cariIslemId = null;
            impacts.push({ label: 'Cari', value: -tutar });
        }

        if (cancellingOrder && order.stokDusuldu === true && order.stokId && order.stokId !== '0') {
            const restoreStok = db.stoklar.find(s => s.id == order.stokId);
            if (restoreStok) {
                if (Number(order.stokDusulenKg) > 0) order.stockKgReversalId=changeSheetStock(restoreStok,'kg',order.stokDusulenKg,'İş Emri İptal',order.orderNo);
                if (Number(order.stokDusulenPlaka) > 0) order.stockPlateReversalId=changeSheetStock(restoreStok,'miktar',order.stokDusulenPlaka,'İş Emri İptal',order.orderNo);
                order.stokDusulenPlaka=0;
                order.stokDusulenKg = 0;
                const restoreField = order.stokDusulenAlan || (order.islemTipi === 'hammadde' ? 'kg' : 'miktar');
                const oncekiStok = Number(restoreStok[restoreField]) || 0;
                const restoreQty = order.stokDusulenMiktar || 0;
                restoreStok[restoreField] = roundMoney(oncekiStok + restoreQty);
                addStokMovement(restoreStok, {
                    tip: 'İş Emri İptal', alan: restoreField, miktar: restoreQty,
                    onceki: oncekiStok, sonraki: restoreStok[restoreField],
                    aciklama: `${order.orderNo || 'İş emri'} iptal edildi, stok geri alındı`, ref: order.orderNo || ''
                });
                impacts.push({ label: 'Stok', value: restoreQty, unit: restoreField === 'kg' ? 'KG' : 'adet' });
            }
            order.stokDusuldu = false;
            order.stokDusulenMiktar = 0;
            order.stokDusulenAlan = '';
        }
        if (cancellingOrder) order.stokRezervasyonKapatmaTarihi = new Date().toLocaleString('tr-TR');

        addAuditLog('Durum Değişti', 'İş Emri', order.id, `${order.orderNo || '-'} / ${oldStatus} -> ${newStatus}`);
        saveDB();
        renderStoklar();
        closeModal('modal-order-status');
        showImpactSummary(`${order.orderNo || 'İş emri'}: ${newStatus}`, impacts, {
            message: impacts.length ? 'İş emri ve bağlı kayıtlar güncellendi.' : 'İş emri durumu güncellendi; cari, kasa veya stok etkisi oluşmadı.',
            actions: [{ label: 'Bağlı kayıtları aç', onClick: () => openOrderHistory(order.id) }]
        });
    };

    if (movingToDelivered && !order.bakiyeCariyeYansitildi && !isInternalOrder) {
        confirmAction(`Müşterinin (${order.customerName}) cari hesabına ${formatCurrency(order.total)} borç eklensin mi?`,
            () => completeStatusUpdate(true), {
                title: 'Teslimatın Cari Etkisi',
                confirmLabel: 'Cariye Yansıt',
                cancelLabel: 'Yansıtmadan Teslim Et',
                danger: false,
                onCancel: () => completeStatusUpdate(false)
            });
        return;
    }
    completeStatusUpdate(false);
}

let dashboardChart = null;
function updateDashboardChart() {
    const ctx = document.getElementById('dashboard-chart');
    if (!ctx) return;

    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const currentMonth = new Date().getMonth();
    const labels = months.slice(0, currentMonth + 1);

    const incomeData = new Array(labels.length).fill(0);
    const expenseData = new Array(labels.length).fill(0);

    // Fill actual data from transactions
    getDBArray('islemler').forEach(i => {
        if (!i.tarih) return;
        const date = parseTRDate(i.tarih);
        const m = date.getMonth();
        if (!isNaN(m) && m <= currentMonth && date.getFullYear() === new Date().getFullYear() && isActiveIncomeMovement(i)) {
            incomeData[m] += Number(i.tutar) || 0;
        }
    });

    const giderler = getDBArray('giderler');
    giderler.forEach(g => {
        if (!g.tarih) return;
        const date = parseTRDate(g.tarih);
        const m = date.getMonth();
        if (!isNaN(m) && m <= currentMonth && date.getFullYear() === new Date().getFullYear()) {
            expenseData[m] += Number(g.tutar) || 0;
        }
    });

    const chartIncomeTotal = incomeData.reduce((sum, value) => sum + value, 0);
    const chartExpenseTotal = expenseData.reduce((sum, value) => sum + value, 0);
    const chartNetTotal = chartIncomeTotal - chartExpenseTotal;

    const incomeEl = document.getElementById('chart-income-total');
    const expenseEl = document.getElementById('chart-expense-total');
    const netEl = document.getElementById('chart-net-total');
    if (incomeEl) incomeEl.textContent = isStatsVisible ? formatCurrency(chartIncomeTotal) : '***';
    if (expenseEl) expenseEl.textContent = isStatsVisible ? formatCurrency(chartExpenseTotal) : '***';
    if (netEl) {
        netEl.textContent = isStatsVisible ? formatCurrency(chartNetTotal) : '***';
        netEl.style.color = chartNetTotal < 0 ? 'var(--alert)' : 'var(--secondary)';
    }

    const hasChartData = incomeData.some(value => value !== 0) || expenseData.some(value => value !== 0);
    const privacyState = document.getElementById('dashboard-chart-privacy');
    const emptyState = document.getElementById('dashboard-chart-empty');
    const chartA11y = document.getElementById('dashboard-chart-a11y');
    if (privacyState) privacyState.hidden = isStatsVisible;
    if (emptyState) emptyState.hidden = !isStatsVisible || hasChartData;
    ctx.setAttribute('aria-hidden', !isStatsVisible || !hasChartData ? 'true' : 'false');
    if (chartA11y) {
        chartA11y.textContent = !isStatsVisible
            ? 'Finansal rakamlar gizli.'
            : hasChartData
                ? `${new Date().getFullYear()} yılı aylık özeti. Toplam gelir ${formatCurrency(chartIncomeTotal)}, toplam gider ${formatCurrency(chartExpenseTotal)}, net ${formatCurrency(chartNetTotal)}.`
                : 'Bu yıl için henüz gelir veya gider kaydı bulunmuyor.';
    }

    if (dashboardChart) dashboardChart.destroy();

    try {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded yet');
            return;
        }
        const chartContext = ctx.getContext('2d');
        const chartHeight = ctx.parentElement?.clientHeight || 250;
        const incomeGradient = chartContext.createLinearGradient(0, 0, 0, chartHeight);
        incomeGradient.addColorStop(0, 'rgba(19, 116, 93, 0.28)');
        incomeGradient.addColorStop(1, 'rgba(19, 116, 93, 0.015)');
        const expenseGradient = chartContext.createLinearGradient(0, 0, 0, chartHeight);
        expenseGradient.addColorStop(0, 'rgba(191, 53, 69, 0.18)');
        expenseGradient.addColorStop(1, 'rgba(191, 53, 69, 0.01)');
        const chartTheme = getComputedStyle(document.documentElement);
        const chartLabel = chartTheme.getPropertyValue('--text-muted').trim();
        const chartGrid = chartTheme.getPropertyValue('--border').trim();
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        dashboardChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Gelir',
                        data: incomeData,
                        backgroundColor: incomeGradient,
                        borderColor: 'rgba(19, 116, 93, 1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.34,
                        pointRadius: 3,
                        pointHoverRadius: 7,
                        pointBackgroundColor: chartTheme.getPropertyValue('--bg-panel').trim(),
                        pointBorderColor: 'rgba(19, 116, 93, 1)',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Gider',
                        data: expenseData,
                        backgroundColor: expenseGradient,
                        borderColor: 'rgba(191, 53, 69, 1)',
                        borderWidth: 2.25,
                        borderDash: [7, 5],
                        fill: true,
                        tension: 0.34,
                        pointRadius: 3,
                        pointStyle: 'rectRot',
                        pointHoverRadius: 7,
                        pointBackgroundColor: chartTheme.getPropertyValue('--bg-panel').trim(),
                        pointBorderColor: 'rgba(191, 53, 69, 1)',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: { duration: reduceMotion ? 0 : 280 },
                scales: {
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: chartLabel, font: { size: 12, weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: chartGrid, drawBorder: false },
                        border: { display: false },
                        ticks: {
                            color: chartLabel,
                            callback: value => Number(value).toLocaleString('tr-TR')
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: chartLabel,
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxWidth: 28,
                            boxHeight: 8,
                            padding: 18
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(12,14,20,0.94)',
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        callbacks: {
                            label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Chart Rendering Error:", err);
    }
}

function populateKasaOptions(selectedId = '') {
    const optionMap = {
        'input-islem-kasa': 'Kasa/banka seçin...',
        'input-kasa-hareket-hesap': 'Hesap seçin...',
        'input-gider-kasa': 'Kasa/banka seçin...',
        'input-plan-kasa': 'Ödeme sırasında seçilecek',
        'input-puantaj-kasa': 'Kasa/banka seçin...',
        'input-ceksenet-kasa': 'Durum kapatılırken seçilecek',
        'input-settlement-kasa': 'Kasa/banka seçin...'
    };
    Object.entries(optionMap).forEach(([id, placeholder]) => {
        const el = document.getElementById(id);
        if (el) {
            const current = selectedId || el.value;
            const accountOptions = getDBArray('kasaHesaplari')
                .filter(kasa => isCashAccountActive(kasa) || String(kasa.id) === String(current))
                .map(kasa => `<option value="${kasa.id}">${escapeHTML(kasa.ad)} (${escapeHTML(kasa.kodu || '-')}) - ${formatCurrency(kasa.bakiye || 0)}${isCashAccountActive(kasa) ? '' : ' · Pasif'}</option>`)
                .join('');
            el.innerHTML = `<option value="">${placeholder}</option>` + accountOptions;
            if (current) el.value = current;
        }
    });
}

function renderCashBank() {
    const accountBody = document.getElementById('cash-accounts-tbody');
    const movementBody = document.getElementById('cash-movements-tbody');
    if (!accountBody && !movementBody) return;

    const accounts = getDBArray('kasaHesaplari');
    const totalCash = accounts.filter(a => a.tip === 'nakit').reduce((sum, a) => sum + (Number(a.bakiye) || 0), 0);
    const totalBank = accounts.filter(a => a.tip === 'banka').reduce((sum, a) => sum + (Number(a.bakiye) || 0), 0);
    const total = totalCash + totalBank;
    const statMap = [
        ['cash-stat-total', total],
        ['cash-stat-cash', totalCash],
        ['cash-stat-bank', totalBank]
    ];
    statMap.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCurrency(value);
    });

    if (accountBody) {
        const orderedAccounts = [...accounts].sort((a, b) => Number(a.isPasif === true) - Number(b.isPasif === true));
        accountBody.innerHTML = orderedAccounts.map(account => {
            const usage = getCashAccountUsage(account.id);
            const canDelete = (Number(account.bakiye) || 0) === 0 && usage.movements.length === 0 && usage.references.length === 0;
            return `
            <tr class="cash-account-row ${isCashAccountActive(account) ? '' : 'is-passive'}">
                <td><span class="badge">${escapeHTML(account.kodu || '-')}</span></td>
                <td><strong>${escapeHTML(account.ad || '-')}</strong></td>
                <td><span class="badge ${account.tip === 'banka' ? 'primary' : 'success'}">${account.tip === 'banka' ? 'Banka' : 'Nakit'}</span></td>
                <td style="text-align:right; font-weight:700; color:${(Number(account.bakiye) || 0) < 0 ? 'var(--alert)' : 'var(--success)'};">${formatCurrency(account.bakiye || 0)}</td>
                <td><span class="badge ${isCashAccountActive(account) ? 'success' : 'neutral'}">${isCashAccountActive(account) ? 'Aktif' : 'Pasif'}</span></td>
                <td style="text-align:right;"><div class="table-actions account-row-actions">
                    <button class="btn btn-outline table-action-button" onclick="openKasaHesapModal('${account.id}')" aria-label="${escapeHTML(account.ad || 'Hesap')} hesabını düzenle" title="Düzenle"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzenle</button>
                    <button class="btn btn-outline table-action-button" onclick="toggleKasaHesapStatus('${account.id}')" aria-label="${escapeHTML(account.ad || 'Hesap')} hesabını ${isCashAccountActive(account) ? 'pasife al' : 'aktifleştir'}" title="${isCashAccountActive(account) ? 'Pasife Al' : 'Aktifleştir'}"><i class="fa-solid ${isCashAccountActive(account) ? 'fa-box-archive' : 'fa-rotate-left'}" aria-hidden="true"></i> ${isCashAccountActive(account) ? 'Pasife Al' : 'Aktifleştir'}</button>
                    ${canDelete ? `<button class="btn btn-danger table-action-button" onclick="deleteKasaHesap('${account.id}')" aria-label="${escapeHTML(account.ad || 'Hesap')} hesabını sil" title="Sil"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>` : ''}
                </div></td>
            </tr>
        `}).join('') || renderTableEmptyState(6, 'Kasa veya banka hesabı yok.', 'İlk hesabı ekleyerek finans hareketlerini takip etmeye başlayın.', 'fa-building-columns');
    }

    if (movementBody) {
        const search = normalizeLookupText(document.getElementById('cash-movements-search')?.value || '');
        let movements = [...getDBArray('kasaHareketleri')].reverse();
        if (search) {
            movements = movements.filter(item => [item.kasaAdi, item.aciklama, item.kaynak, item.tarih, item.tip]
                .some(value => normalizeLookupText(value).includes(search)));
        }
        window.pageCashMovements = window.pageCashMovements || 1;
        const itemsPerPage = getListPageSize('cash-movements');
        const totalPages = Math.ceil(movements.length / itemsPerPage) || 1;
        window.pageCashMovements = Math.min(Math.max(window.pageCashMovements, 1), totalPages);
        const startIndex = (window.pageCashMovements - 1) * itemsPerPage;
        const paginatedMovements = movements.slice(startIndex, startIndex + itemsPerPage);
        const pageInfo = document.getElementById('cash-movements-page-info');
        if (pageInfo) pageInfo.textContent = formatListPagination(window.pageCashMovements, totalPages, movements.length, itemsPerPage);
        const previousButton = document.getElementById('btn-cash-movements-prev');
        const nextButton = document.getElementById('btn-cash-movements-next');
        if (previousButton) previousButton.disabled = window.pageCashMovements <= 1;
        if (nextButton) nextButton.disabled = window.pageCashMovements >= totalPages;
        movementBody.innerHTML = paginatedMovements.map(record => {
            const isReversal = String(record.kaynak || '').endsWith('-ters-kayit');
            const canUndo = record.kaynak === 'manuel' && !record.reversedBy && !isReversal;
            const statusLabel = record.reversedBy ? 'Geri Alındı' : (isReversal ? 'Ters Kayıt' : (record.kaynak === 'manuel' ? 'Manuel' : 'Bağlı Kayıt'));
            const statusClass = record.reversedBy ? 'neutral' : (isReversal ? 'warning' : (record.kaynak === 'manuel' ? 'info' : 'success'));
            return `
            <tr>
                <td>${escapeHTML(record.tarih || '-')}</td>
                <td>${escapeHTML(record.kasaAdi || '-')}</td>
                <td><span class="badge ${record.tip === 'giris' ? 'success' : 'alert'}">${record.tip === 'giris' ? 'Giriş' : 'Çıkış'}</span></td>
                <td>${escapeHTML(record.aciklama || record.kaynak || '-')}</td>
                <td style="text-align:right; font-weight:700; color:${record.tip === 'giris' ? 'var(--success)' : 'var(--alert)'};">${record.tip === 'giris' ? '+' : '-'}${formatCurrency(record.tutar || 0)}</td>
                <td><span class="badge ${statusClass}">${statusLabel}</span></td>
                <td style="text-align:right;"><div class="table-actions">
                    ${canUndo ? `<button class="btn btn-outline table-action-button cash-undo-button" onclick="undoManualCashMovement('${record.id}')" aria-label="Manuel kasa hareketini geri al" title="Geri Al"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Geri Al</button>` : '<span class="cash-movement-locked" title="Bağlı kayıt kendi modülünden düzeltilir"><i class="fa-solid fa-lock" aria-hidden="true"></i></span>'}
                </div></td>
            </tr>
        `}).join('') || renderTableEmptyState(7, 'Henüz kasa hareketi yok.', 'Tahsilat ve ödeme hareketleri burada görünecek.', 'fa-money-bill-transfer');
    }
    populateKasaOptions();
}

let pendingSettlementAction = null;

function ensureSettlementModal() {
    if (document.getElementById('modal-settlement')) return;
    const modal = document.createElement('div');
    modal.id = 'modal-settlement';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content glass-panel" style="max-width:520px;">
            <div class="flex-between mb-4">
                <h3 id="settlement-title">Ödeme / Tahsilat</h3>
                <button class="btn-close" onclick="closeSettlementModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p id="settlement-message" class="muted-copy" style="margin-bottom:18px;"></p>
            <div class="form-group">
                <label>Kasa / Banka *</label>
                <select id="input-settlement-kasa" class="form-control"></select>
            </div>
            <button class="btn btn-primary w-100 mt-4" onclick="confirmSettlement()">İşlemi Tamamla</button>
        </div>`;
    document.body.appendChild(modal);
}

function openSettlementModal({ title, message, defaultKasaId = '', onConfirm }) {
    ensureSettlementModal();
    pendingSettlementAction = typeof onConfirm === 'function' ? onConfirm : null;
    document.getElementById('settlement-title').textContent = title || 'Ödeme / Tahsilat';
    document.getElementById('settlement-message').textContent = message || 'İşlemin yansıtılacağı hesabı seçin.';
    populateKasaOptions(defaultKasaId);
    const select = document.getElementById('input-settlement-kasa');
    if (select && defaultKasaId) select.value = String(defaultKasaId);
    openModal('modal-settlement');
}

window.closeSettlementModal = function() {
    pendingSettlementAction = null;
    closeModal('modal-settlement');
};

window.confirmSettlement = function() {
    const kasaId = document.getElementById('input-settlement-kasa')?.value || '';
    if (!kasaId) return alert('Kasa/banka hesabı seçin.');
    const account = getDBArray('kasaHesaplari').find(item => String(item.id) === String(kasaId));
    if (!isCashAccountActive(account)) return alert('Pasif hesapla yeni tahsilat veya ödeme yapılamaz. Aktif bir hesap seçin.');
    const action = pendingSettlementAction;
    if (!action) return closeSettlementModal();
    pendingSettlementAction = null;
    action(kasaId);
    closeModal('modal-settlement');
};

function renderPaymentPlans() {
    const tbody = document.getElementById('payment-plans-tbody');
    if (!tbody) return;
    const search = normalizeLookupText(document.getElementById('payment-plans-search')?.value || '');
    let records = [...getDBArray('odemePlanlari')].sort((a, b) => parseTRDate(a.vadeTarihi) - parseTRDate(b.vadeTarihi));
    if (search) {
        records = records.filter(item => [item.firma, item.planNo, item.aciklama, item.vadeTarihi, item.durum, item.tip]
            .some(value => normalizeLookupText(value).includes(search)));
    }
    window.pagePaymentPlans = window.pagePaymentPlans || 1;
    const itemsPerPage = getListPageSize('payment-plans');
    const totalPages = Math.ceil(records.length / itemsPerPage) || 1;
    window.pagePaymentPlans = Math.min(Math.max(window.pagePaymentPlans, 1), totalPages);
    const startIndex = (window.pagePaymentPlans - 1) * itemsPerPage;
    const paginatedRecords = records.slice(startIndex, startIndex + itemsPerPage);
    const pageInfo = document.getElementById('payment-plans-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pagePaymentPlans, totalPages, records.length, itemsPerPage);
    const previousButton = document.getElementById('btn-payment-plans-prev');
    const nextButton = document.getElementById('btn-payment-plans-next');
    if (previousButton) previousButton.disabled = window.pagePaymentPlans <= 1;
    if (nextButton) nextButton.disabled = window.pagePaymentPlans >= totalPages;
    tbody.innerHTML = paginatedRecords.map(plan => {
        const due = parseTRDate(plan.vadeTarihi);
        const isOverdue = plan.durum === 'beklemede' && due < getTodayBounds().start;
        return `
            <tr>
                <td>${escapeHTML(plan.vadeTarihi || '-')}</td>
                <td><strong>${escapeHTML(plan.firma || '-')}</strong><br><span class="dashboard-muted-text">${escapeHTML(plan.planNo || '-')}</span></td>
                <td><span class="badge ${plan.tip === 'tahsilat' ? 'success' : 'alert'}">${plan.tip === 'tahsilat' ? 'Tahsilat' : 'Ödeme'}</span></td>
                <td>${escapeHTML(plan.aciklama || '-')}</td>
                <td style="text-align:right; font-weight:700;">${formatCurrency(plan.tutar || 0)}</td>
                <td><span class="badge ${plan.durum === 'odendi' ? 'success' : (isOverdue ? 'alert' : 'warning')}">${plan.durum === 'odendi' ? 'Ödendi' : (isOverdue ? 'Gecikti' : 'Bekliyor')}</span></td>
                <td style="text-align:right;"><div class="table-actions">
                    ${plan.durum === 'beklemede' ? `<button class="btn btn-outline table-action-button" onclick="openPaymentPlanModal('', '${plan.id}')"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzenle</button><button class="btn btn-outline table-action-button" onclick="openPaymentPlanSettlement('${plan.id}')"><i class="fa-solid fa-check" aria-hidden="true"></i> Ödendi İşle</button>` : `<button class="btn btn-outline table-action-button" onclick="undoPaymentPlanSettlement('${plan.id}')"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Ödemeyi Geri Al</button>`}
                    <button class="btn btn-danger table-action-button" onclick="deletePaymentPlan('${plan.id}')"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `;
    }).join('') || renderTableEmptyState(7, 'Vade planı bulunamadı.', 'Yaklaşan tahsilat ve ödemeler için bir vade kaydı ekleyin.', 'fa-calendar-day');
}

function ensurePaymentPlanModal() {
    if (document.getElementById('modal-payment-plan')) return;
    const modal = document.createElement('div');
    modal.id = 'modal-payment-plan';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-panel" style="max-width:560px;">
            <input type="hidden" id="input-plan-id">
            <div class="flex-between mb-4">
                <h3 id="modal-plan-title">Vade Planı Ekle</h3>
                <button class="btn-close" onclick="closeModal('modal-payment-plan')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="form-group"><label>Cari</label><select id="input-plan-cari" class="form-control"></select></div>
            <div class="form-row">
                <div class="form-group"><label>Tip</label><select id="input-plan-tip" class="form-control"><option value="tahsilat">Müşteriden Tahsilat</option><option value="odeme">Firmaya Ödeme</option></select></div>
                <div class="form-group"><label>Vade Tarihi</label><input id="input-plan-vade" type="date" class="form-control account-date-input"></div>
            </div>
            <div class="form-group"><label>Açıklama</label><input id="input-plan-aciklama" class="form-control" placeholder="Örn: Kalan ödeme sözü"></div>
            <div class="form-group"><label>Tutar</label><input id="input-plan-tutar" type="number" class="form-control" placeholder="0"></div>
            <div class="form-group"><label>Tercih Edilen Kasa / Banka</label><select id="input-plan-kasa" class="form-control"></select></div>
            <button id="btn-plan-save" class="btn btn-primary w-100 mt-4" onclick="savePaymentPlan()">Kaydet</button>
        </div>`;
    document.body.appendChild(modal);
}

window.openPaymentPlanModal = function(cariId = '', planId = '') {
    ensurePaymentPlanModal();
    const plan = planId ? getDBArray('odemePlanlari').find(item => String(item.id) === String(planId)) : null;
    if (plan && plan.durum !== 'beklemede') {
        return showToast({ type: 'warning', title: 'Ödenmiş plan doğrudan düzenlenemez', message: 'Önce “Ödemeyi Geri Al” ile planı beklemeye alın.' });
    }
    const select = document.getElementById('input-plan-cari');
    const selectedCariId = plan?.cariId || cariId;
    select.innerHTML = '<option value="">Cari seçin...</option>' + getDBArray('cariler')
        .filter(c => !c.isPasif || String(c.id) === String(selectedCariId))
        .map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu || '-')})</option>`).join('');
    document.getElementById('input-plan-id').value = plan?.id || '';
    if (selectedCariId) select.value = selectedCariId;
    document.getElementById('input-plan-tip').value = plan?.tip || 'tahsilat';
    document.getElementById('input-plan-vade').value = plan ? toDateInputValue(parseTRDate(plan.vadeTarihi)) : toDateInputValue(new Date());
    document.getElementById('input-plan-aciklama').value = plan?.aciklama || '';
    document.getElementById('input-plan-tutar').value = plan?.tutar || '';
    document.getElementById('modal-plan-title').textContent = plan ? 'Vade Planını Düzenle' : 'Vade Planı Ekle';
    document.getElementById('btn-plan-save').textContent = plan ? 'Değişiklikleri Kaydet' : 'Planı Kaydet';
    populateKasaOptions(plan?.kasaId || '');
    if (plan?.kasaId) document.getElementById('input-plan-kasa').value = plan.kasaId;
    refreshDateInputDisplay();
    openModal('modal-payment-plan');
};

window.savePaymentPlan = function() {
    const unlock = beginModalSubmit('modal-payment-plan');
    if (!unlock) return;
    try {
    const id = document.getElementById('input-plan-id')?.value || '';
    const existing = id ? getDBArray('odemePlanlari').find(item => String(item.id) === String(id)) : null;
    const cariId = document.getElementById('input-plan-cari')?.value || '';
    const cari = findCariByReference(cariId);
    const tip = document.getElementById('input-plan-tip')?.value || 'tahsilat';
    const vade = toTRDateFromInput(document.getElementById('input-plan-vade')?.value || '');
    const aciklama = plainText(document.getElementById('input-plan-aciklama')?.value || '');
    const tutar = roundMoney(parseFloat(document.getElementById('input-plan-tutar')?.value || '0') || 0);
    const kasaId = document.getElementById('input-plan-kasa')?.value || '';
    if (!validateModalFields('modal-payment-plan', [
        { id: 'input-plan-cari', test: value => !!findCariByReference(value), message: 'Vade planı için cari seçin.' },
        { id: 'input-plan-vade', test: value => !!value, message: 'Vade tarihini seçin.' },
        { id: 'input-plan-tutar', test: value => Number(value) > 0, message: 'Sıfırdan büyük geçerli bir tutar girin.' }
    ])) return;
    if (!cari) return;
    if (existing && existing.durum !== 'beklemede') return alert('Ödenmiş plan doğrudan düzenlenemez. Önce ödemeyi geri alın.');
    const plan = existing || {
        id: createRecordId(),
        planNo: generateSerialNo('odemePlani'),
        durum: 'beklemede',
        tarih: new Date().toLocaleDateString('tr-TR')
    };
    Object.assign(plan, {
        cariId: cari.id,
        firma: cari.adi,
        tip,
        vadeTarihi: vade,
        aciklama,
        tutar,
        kasaId: kasaId || null
    });
    if (!existing) db.odemePlanlari.push(plan);
    addAuditLog(existing ? 'Güncellendi' : 'Oluşturuldu', 'Vade Planı', plan.id, `${plan.planNo} / ${plan.firma} / ${formatCurrency(plan.tutar)}`);
    saveDB();
    closeModal('modal-payment-plan');
    renderPaymentPlans();
    showToast({ type: 'success', title: existing ? 'Vade planı güncellendi' : 'Vade planı oluşturuldu', message: `${plan.planNo} / ${plan.firma}` });
    } finally {
        unlock();
    }
};

window.openPaymentPlanSettlement = function(id) {
    const plan = getDBArray('odemePlanlari').find(p => String(p.id) === String(id));
    if (!plan || plan.durum !== 'beklemede') return;
    openSettlementModal({
        title: plan.tip === 'tahsilat' ? 'Vade Tahsilatı' : 'Vade Ödemesi',
        message: `${plan.firma} / ${formatCurrency(plan.tutar)}. İşlemin yansıtılacağı hesabı seçin.`,
        defaultKasaId: plan.kasaId || '',
        onConfirm: kasaId => markPaymentPlanPaid(id, kasaId)
    });
};

window.markPaymentPlanPaid = function(id, kasaId = '') {
    const plan = getDBArray('odemePlanlari').find(p => String(p.id) === String(id));
    if (!plan || plan.durum !== 'beklemede') return;
    const cari = findCariByReference(plan.cariId, plan.firma);
    if (!cari) return alert('Cari bulunamadı, vade kapatılamadı.');
    const kasa = getDBArray('kasaHesaplari').find(item => item.id == kasaId);
    if (!kasa) return alert('Kasa/banka hesabı seçilmeden vade kapatılamaz.');
    if (!isCashAccountActive(kasa)) return alert('Pasif hesapla vade kapatılamaz. Aktif bir hesap seçin.');
    const delta = plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar;
    const hareket = addCariMovement(cari, {
        tip: plan.tip === 'tahsilat' ? `Vade Tahsilatı (${plan.planNo})` : `Vade Ödemesi (${plan.planNo})`,
        aciklama: plan.aciklama || 'Vade planı kapatıldı',
        tutar: plan.tutar,
        bakiyeDegisimi: delta,
        isSuccess: true,
        isGelir: plan.tip === 'tahsilat'
    });
    const cashMovement = addCashMovement(kasa.id, {
        tip: plan.tip === 'tahsilat' ? 'giris' : 'cikis',
        tutar: plan.tutar,
        aciklama: `${plan.firma} - ${plan.planNo}`,
        kaynak: 'vade-plani',
        refId: plan.id
    });
    plan.durum = 'odendi';
    plan.kapanisTarihi = new Date().toLocaleString('tr-TR');
    plan.cariIslemId = hareket?.id || null;
    plan.kasaId = kasa.id;
    plan.kasaHareketId = cashMovement?.id || null;
    addAuditLog('Kapatıldı', 'Vade Planı', plan.id, `${plan.planNo} / ${plan.firma} / ${formatCurrency(plan.tutar)}`);
    saveDB();
    renderPaymentPlans();
    showImpactSummary(plan.tip === 'tahsilat' ? 'Vade tahsil edildi' : 'Vade ödemesi yapıldı', [
        { label: 'Cari', value: delta },
        { label: 'Kasa', value: plan.tip === 'tahsilat' ? plan.tutar : -plan.tutar }
    ], { message: `${plan.planNo} / ${plan.firma}` });
};

window.undoPaymentPlanSettlement = function(id) {
    const plan = getDBArray('odemePlanlari').find(item => String(item.id) === String(id));
    if (!plan) return alert('Vade planı bulunamadı.');
    if (plan.durum !== 'odendi') return alert('Yalnızca kapatılmış bir vade planı geri alınabilir.');
    const cari = findCariByReference(plan.cariId, plan.firma);
    if (!cari) return alert('Cari bulunamadığı için ödeme geri alınamadı.');
    confirmAction(`${plan.planNo} numaralı ${formatCurrency(plan.tutar)} tutarlı ödeme/tahsilat geri alınsın mı?\n\nCari ve kasa etkileri ters kayıtla düzeltilecek; plan yeniden beklemeye alınacak.`, () => {
        if (!getDBArray('odemePlanlari').includes(plan) || plan.durum !== 'odendi' || findCariByReference(plan.cariId, plan.firma) !== cari) {
            return alert('Vade planı değişti veya daha önce geri alındı. Listeyi yenileyin.');
        }
        const originalDelta = plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar;
        const originalCariMovement = getDBArray('islemler').find(item => String(item.id) === String(plan.cariIslemId));
        const originalCash = getDBArray('kasaHareketleri').find(item => String(item.id) === String(plan.kasaHareketId));
        if ((plan.cariIslemId && (!originalCariMovement || originalCariMovement.reversedBy)) ||
            (plan.kasaHareketId && (!originalCash || originalCash.reversedBy))) return alert('Bağlı ödeme hareketi eksik veya daha önce geri alınmış. Plan değiştirilmedi.');
        const cashReversal = plan.kasaHareketId ? reverseCashMovement(plan.kasaHareketId, `Vade ödemesi geri alındı: ${plan.planNo}`) : null;
        if (plan.kasaHareketId && !cashReversal) return alert('Kasa/banka ters kaydı oluşturulamadı.');
        const cariReversal = addCariMovement(cari, {
            tip: `Vade Ödemesi Geri Alındı (${plan.planNo})`,
            aciklama: 'Vade planı yeniden beklemeye alındı.',
            tutar: plan.tutar,
            bakiyeDegisimi: -originalDelta,
            isSuccess: false,
            isGelir: false,
            reversalOf: originalCariMovement?.id || null
        });
        if (originalCariMovement && cariReversal) originalCariMovement.reversedBy = cariReversal.id;
        if (cariReversal && cashReversal) cariReversal.kasaHareketId = cashReversal.id;
        plan.sonGeriAlmaTarihi = new Date().toLocaleString('tr-TR');
        plan.durum = 'beklemede';
        plan.kapanisTarihi = null;
        plan.cariIslemId = null;
        plan.kasaHareketId = null;
        addAuditLog('Geri Alındı', 'Vade Planı Ödemesi', plan.id, `${plan.planNo} / ${plan.firma} / ${formatCurrency(plan.tutar)}`);
        saveDB();
        renderPaymentPlans();
        showImpactSummary('Vade ödemesi geri alındı', [
            { label: 'Cari', value: -originalDelta },
            { label: 'Kasa', value: plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar }
        ], { message: 'Plan yeniden beklemede; artık düzenlenebilir.' });
    }, { title: 'Vade Ödemesini Geri Al', confirmLabel: 'Ters Kayıt Oluştur' });
};

window.deletePaymentPlan = function(id) {
    const plan = getDBArray('odemePlanlari').find(p => String(p.id) === String(id));
    if (!plan) return alert('Vade planı bulunamadı.');
    confirmAction('Bu vade planı silinsin mi? Ödenmiş bir plansa cari ve kasa etkileri ters kayıtla düzeltilecek.', () => {
        if (!getDBArray('odemePlanlari').includes(plan)) return alert('Bu vade planı daha önce kaldırıldı.');
        const originalDelta = plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar;
        if (plan.durum === 'odendi') {
            const cari = findCariByReference(plan.cariId, plan.firma);
            if (!cari) return alert('Cari bulunamadığı için ödenmiş vade planı silinemedi.');
            const originalCariMovement = getDBArray('islemler').find(item => String(item.id) === String(plan.cariIslemId));
            const originalCash = getDBArray('kasaHareketleri').find(item => String(item.id) === String(plan.kasaHareketId));
            if ((plan.cariIslemId && (!originalCariMovement || originalCariMovement.reversedBy)) ||
                (plan.kasaHareketId && (!originalCash || originalCash.reversedBy))) return alert('Bağlı ödeme hareketi eksik veya daha önce geri alınmış. Plan silinmedi.');
            const cashReversal = plan.kasaHareketId ? reverseCashMovement(plan.kasaHareketId, `Vade planı silindi: ${plan.planNo}`) : null;
            if (plan.kasaHareketId && !cashReversal) return alert('Kasa/banka hareketi geri alınamadığı için plan silinmedi.');
            const cariReversal = addCariMovement(cari, {
                tip: `Vade Planı Silindi (${plan.planNo})`,
                aciklama: 'Ödenmiş vade planı silindi; cari etkisi ters kayıtla geri alındı.',
                tutar: plan.tutar,
                bakiyeDegisimi: -originalDelta,
                isSuccess: false,
                isGelir: false,
                reversalOf: originalCariMovement?.id || null
            });
            if (originalCariMovement && cariReversal) originalCariMovement.reversedBy = cariReversal.id;
            if (cariReversal && cashReversal) cariReversal.kasaHareketId = cashReversal.id;
        }
        addAuditLog('Silindi', 'Vade Planı', plan.id, `${plan.planNo} / ${plan.firma} / ${plan.durum}`);
        db.odemePlanlari = getDBArray('odemePlanlari').filter(p => String(p.id) !== String(id));
        saveDB();
        renderPaymentPlans();
        const impacts = plan.durum === 'odendi'
            ? [
                { label: 'Cari', value: -originalDelta },
                { label: 'Kasa', value: plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar }
            ]
            : [];
        showImpactSummary('Vade planı silindi', impacts, { message: plan.durum === 'odendi' ? 'Ödenmiş planın etkileri ters kayıtla düzeltildi.' : 'Bekleyen vade planı kaldırıldı.' });
    }, { title: 'Vade Planını Sil', confirmLabel: 'Planı Sil' });
};

function ensureKasaModals() {
    if (!document.getElementById('modal-kasa-hesap')) {
        const modal = document.createElement('div');
        modal.id = 'modal-kasa-hesap';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-panel" style="max-width:520px;">
                <input type="hidden" id="input-kasa-id">
                <div class="flex-between mb-4">
                    <h3 id="modal-kasa-hesap-title">Kasa / Banka Hesabı Ekle</h3>
                    <button class="btn-close" onclick="closeModal('modal-kasa-hesap')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="form-group"><label>Hesap Adı</label><input id="input-kasa-ad" class="form-control" placeholder="Örn: İş Bankası"></div>
                <div class="form-group"><label>Tip</label><select id="input-kasa-tip" class="form-control"><option value="nakit">Nakit Kasa</option><option value="banka">Banka</option></select></div>
                <div id="kasa-opening-balance-group" class="form-group"><label>Açılış Bakiyesi</label><input id="input-kasa-bakiye" type="number" class="form-control" placeholder="0"><small class="field-help">Açılış bakiyesi ayrı bir hareket olarak kaydedilir; kayıt geçmişi korunur.</small></div>
                <button id="btn-kasa-hesap-save" class="btn btn-primary w-100 mt-4" onclick="saveKasaHesap()">Kaydet</button>
            </div>`;
        document.body.appendChild(modal);
    }
    if (!document.getElementById('modal-kasa-hareket')) {
        const modal = document.createElement('div');
        modal.id = 'modal-kasa-hareket';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-panel" style="max-width:520px;">
                <div class="flex-between mb-4">
                    <h3>Kasa / Banka Hareketi</h3>
                    <button class="btn-close" onclick="closeModal('modal-kasa-hareket')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="form-group"><label>Hesap</label><select id="input-kasa-hareket-hesap" class="form-control"></select></div>
                <div class="form-group"><label>Tip</label><select id="input-kasa-hareket-tip" class="form-control"><option value="giris">Giriş</option><option value="cikis">Çıkış</option></select></div>
                <div class="form-group"><label>İşlem Tarihi</label><input id="input-kasa-hareket-tarih" type="date" class="form-control account-date-input"></div>
                <div class="form-group"><label>Açıklama</label><input id="input-kasa-hareket-aciklama" class="form-control" placeholder="Örn: Elden tahsilat"></div>
                <div class="form-group"><label>Tutar</label><input id="input-kasa-hareket-tutar" type="number" class="form-control" placeholder="0"></div>
                <div class="modal-impact-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Yanlış girilen manuel hareketler silinmez; hareket listesinden ters kayıtla geri alınır.</span></div>
                <button class="btn btn-primary w-100 mt-4" onclick="saveKasaHareket()">Kaydet</button>
            </div>`;
        document.body.appendChild(modal);
    }
}

window.openKasaHesapModal = function(id = '') {
    ensureKasaModals();
    const account = id ? getDBArray('kasaHesaplari').find(item => String(item.id) === String(id)) : null;
    document.getElementById('input-kasa-id').value = account?.id || '';
    document.getElementById('input-kasa-ad').value = account?.ad || '';
    document.getElementById('input-kasa-tip').value = account?.tip || 'nakit';
    document.getElementById('input-kasa-bakiye').value = '';
    document.getElementById('modal-kasa-hesap-title').textContent = account ? 'Kasa / Banka Hesabını Düzenle' : 'Kasa / Banka Hesabı Ekle';
    document.getElementById('btn-kasa-hesap-save').textContent = account ? 'Değişiklikleri Kaydet' : 'Hesabı Kaydet';
    document.getElementById('kasa-opening-balance-group').hidden = !!account;
    openModal('modal-kasa-hesap');
};

window.saveKasaHesap = function() {
    const unlock = beginModalSubmit('modal-kasa-hesap');
    if (!unlock) return;
    try {
    const id = document.getElementById('input-kasa-id')?.value || '';
    const existing = id ? getDBArray('kasaHesaplari').find(item => String(item.id) === String(id)) : null;
    const ad = plainText(document.getElementById('input-kasa-ad')?.value || '');
    const tip = document.getElementById('input-kasa-tip')?.value || 'nakit';
    const rawBakiye = parseFloat(document.getElementById('input-kasa-bakiye')?.value || '0');
    const bakiye = roundMoney(rawBakiye || 0);
    if (!validateModalFields('modal-kasa-hesap', [
        { id: 'input-kasa-ad', test: value => !!plainText(value), message: 'Hesap adı zorunludur.' },
        { id: 'input-kasa-bakiye', test: () => !!existing || Number.isFinite(rawBakiye), message: 'Geçerli bir açılış bakiyesi girin.' }
    ])) return;

    if (existing) {
        const oldName = existing.ad;
        existing.ad = ad;
        existing.tip = tip;
        existing.guncellemeTarihi = new Date().toLocaleString('tr-TR');
        getDBArray('kasaHareketleri')
            .filter(item => String(item.kasaId) === String(existing.id))
            .forEach(item => { item.kasaAdi = ad; });
        addAuditLog('Güncellendi', 'Kasa / Banka Hesabı', existing.id, `${oldName} -> ${ad}`);
        saveDB();
        closeModal('modal-kasa-hesap');
        renderCashBank();
        showToast({ type: 'success', title: 'Hesap güncellendi', message: `${ad} bilgileri kaydedildi.` });
        return;
    }

    const account = { id: createRecordId(), kodu: generateSerialNo('kasa'), ad, tip, bakiye, ledgerOpeningBalance: 0, isPasif: false, tarih: new Date().toLocaleDateString('tr-TR') };
    db.kasaHesaplari.push(account);
    if (bakiye !== 0) {
        db.kasaHareketleri.push({ id: createRecordId(), kasaId: account.id, kasaAdi: account.ad, tip: bakiye >= 0 ? 'giris' : 'cikis', tutar: Math.abs(bakiye), aciklama: 'Açılış bakiyesi', kaynak: 'kasa-acilis', tarih: new Date().toLocaleString('tr-TR') });
    }
    addAuditLog('Oluşturuldu', 'Kasa / Banka Hesabı', account.id, `${account.kodu} / ${account.ad} / ${formatCurrency(account.bakiye)}`);
    saveDB();
    closeModal('modal-kasa-hesap');
    renderCashBank();
    showImpactSummary('Kasa / banka hesabı oluşturuldu', bakiye === 0 ? [] : [{ label: 'Kasa', value: bakiye }], { message: `${account.kodu} / ${account.ad}` });
    } finally {
        unlock();
    }
};

window.toggleKasaHesapStatus = function(id) {
    const account = getDBArray('kasaHesaplari').find(item => String(item.id) === String(id));
    if (!account) return alert('Kasa/banka hesabı bulunamadı.');
    if (!isCashAccountActive(account)) {
        account.isPasif = false;
        account.aktiflestirmeTarihi = new Date().toLocaleString('tr-TR');
        addAuditLog('Aktifleştirildi', 'Kasa / Banka Hesabı', account.id, `${account.kodu} / ${account.ad}`);
        saveDB();
        renderCashBank();
        return showToast({ type: 'success', title: 'Hesap aktifleştirildi', message: `${account.ad} yeniden seçim listelerinde kullanılabilir.` });
    }
    if (roundMoney(account.bakiye || 0) !== 0) {
        return showToast({ type: 'warning', title: 'Hesap pasife alınamadı', message: `Önce ${formatCurrency(account.bakiye || 0)} bakiyeyi kapatın veya hatalı hareketi geri alın.` });
    }
    const activeCount = getDBArray('kasaHesaplari').filter(isCashAccountActive).length;
    if (activeCount <= 1) return alert('En az bir aktif kasa/banka hesabı kalmalıdır.');
    confirmAction(`${account.ad} pasife alınsın mı?\n\nGeçmiş hareketler korunacak; hesap yeni işlemlerde seçilemeyecek.`, () => {
        account.isPasif = true;
        account.pasifTarihi = new Date().toLocaleString('tr-TR');
        addAuditLog('Pasife Alındı', 'Kasa / Banka Hesabı', account.id, `${account.kodu} / ${account.ad}`);
        saveDB();
        renderCashBank();
        showToast({ type: 'success', title: 'Hesap pasife alındı', message: 'Geçmiş hareketler ve denetim izi korundu.' });
    }, { title: 'Hesabı Pasife Al', confirmLabel: 'Pasife Al' });
};

window.deleteKasaHesap = function(id) {
    const account = getDBArray('kasaHesaplari').find(item => String(item.id) === String(id));
    if (!account) return alert('Kasa/banka hesabı bulunamadı.');
    const usage = getCashAccountUsage(account.id);
    if (roundMoney(account.bakiye || 0) !== 0 || usage.movements.length || usage.references.length) {
        return showToast({ type: 'warning', title: 'Hesap silinemez', message: 'Bakiyesi veya işlem geçmişi olan hesaplar silinmez; bakiye kapatıldıktan sonra pasife alınır.' });
    }
    if (isCashAccountActive(account) && getDBArray('kasaHesaplari').filter(isCashAccountActive).length <= 1) {
        return alert('En az bir aktif kasa/banka hesabı kalmalıdır.');
    }
    confirmAction(`${account.ad} kalıcı olarak silinsin mi?\n\nBu hesap hiç kullanılmadığı için kayıt geçmişi etkilenmeyecek.`, () => {
        db.kasaHesaplari = getDBArray('kasaHesaplari').filter(item => String(item.id) !== String(account.id));
        addAuditLog('Silindi', 'Kasa / Banka Hesabı', account.id, `${account.kodu} / ${account.ad}`);
        saveDB();
        renderCashBank();
        showToast({ type: 'success', title: 'Kullanılmayan hesap silindi', message: `${account.ad} kaldırıldı.` });
    }, { title: 'Kullanılmayan Hesabı Sil', confirmLabel: 'Hesabı Sil' });
};

window.openKasaHareketModal = function() {
    ensureKasaModals();
    populateKasaOptions();
    const firstActiveAccount = getDBArray('kasaHesaplari').find(isCashAccountActive);
    document.getElementById('input-kasa-hareket-hesap').value = firstActiveAccount?.id || '';
    document.getElementById('input-kasa-hareket-tip').value = 'giris';
    document.getElementById('input-kasa-hareket-tarih').value = toDateInputValue(new Date());
    document.getElementById('input-kasa-hareket-aciklama').value = '';
    document.getElementById('input-kasa-hareket-tutar').value = '';
    refreshDateInputDisplay();
    openModal('modal-kasa-hareket');
};

window.saveKasaHareket = function() {
    const unlock = beginModalSubmit('modal-kasa-hareket');
    if (!unlock) return;
    try {
    const kasaId = document.getElementById('input-kasa-hareket-hesap')?.value || '';
    const tip = document.getElementById('input-kasa-hareket-tip')?.value || 'giris';
    const tarihValue = document.getElementById('input-kasa-hareket-tarih')?.value || '';
    const aciklama = plainText(document.getElementById('input-kasa-hareket-aciklama')?.value || '');
    const tutar = parseFloat(document.getElementById('input-kasa-hareket-tutar')?.value || '0');
    if (!kasaId) return alert('Kasa/banka hesabı seçin.');
    if (!tarihValue) return alert('İşlem tarihini seçin.');
    if (!Number.isFinite(tutar) || tutar <= 0) return alert('Geçerli tutar girin.');
    const account = getDBArray('kasaHesaplari').find(item => String(item.id) === String(kasaId));
    if (!account || !isCashAccountActive(account)) return alert('Aktif bir kasa/banka hesabı seçin.');
    const movement = addCashMovement(kasaId, { tip, tutar, aciklama, kaynak: 'manuel', tarih: toTRDateFromInput(tarihValue) });
    if (!movement) return alert('Kasa/banka hareketi oluşturulamadı.');
    addAuditLog('Oluşturuldu', 'Manuel Kasa Hareketi', movement.id, `${movement.kasaAdi} / ${tip === 'giris' ? 'Giriş' : 'Çıkış'} / ${formatCurrency(tutar)}`);
    saveDB();
    document.getElementById('input-kasa-hareket-tutar').value = '';
    closeModal('modal-kasa-hareket');
    renderCashBank();
    showImpactSummary('Kasa hareketi kaydedildi', [
        { label: 'Kasa', value: tip === 'giris' ? tutar : -tutar }
    ], { message: aciklama || (tip === 'giris' ? 'Manuel para girişi' : 'Manuel para çıkışı') });
    } finally {
        unlock();
    }
};

window.undoManualCashMovement = function(id) {
    const movement = getDBArray('kasaHareketleri').find(item => String(item.id) === String(id));
    if (!movement) return alert('Kasa/banka hareketi bulunamadı.');
    if (movement.kaynak !== 'manuel') return alert('Bağlı hareketler oluşturulduğu modülden düzeltilmelidir.');
    if (movement.reversedBy) return alert('Bu hareket daha önce geri alınmış.');
    confirmAction(`${movement.kasaAdi || 'Hesap'} üzerindeki ${formatCurrency(movement.tutar || 0)} tutarlı ${movement.tip === 'giris' ? 'giriş' : 'çıkış'} geri alınsın mı?\n\nHareket silinmeyecek; denetim izi için ters kayıt oluşturulacak.`, () => {
        if (!getDBArray('kasaHareketleri').includes(movement) || movement.reversedBy) return alert('Bu hareket daha önce geri alındı veya değişti.');
        const reversal = reverseCashMovement(movement.id, 'Manuel kasa hareketi geri alındı');
        if (!reversal) return alert('Ters kasa hareketi oluşturulamadı.');
        addAuditLog('Geri Alındı', 'Manuel Kasa Hareketi', movement.id, `${movement.kasaAdi} / ${formatCurrency(movement.tutar || 0)}`);
        saveDB();
        renderCashBank();
        showImpactSummary('Manuel kasa hareketi geri alındı', [
            { label: 'Kasa', value: movement.tip === 'giris' ? -movement.tutar : movement.tutar }
        ], { message: 'Orijinal hareket ve ters kayıt birlikte korunuyor.' });
    }, { title: 'Manuel Hareketi Geri Al', confirmLabel: 'Ters Kayıt Oluştur' });
};

function renderAll() {
    if (document.readyState === 'loading') return;
    
    const tasks = [
        { name: 'Header', fn: renderHeader },
        { name: 'Cariler', fn: renderCariler },
        { name: 'Stoklar', fn: renderStoklar },
        { name: 'Fireler', fn: renderFireler },
        { name: 'Dashboard', fn: renderDashboard },
        { name: 'Expenses', fn: renderExpenses },
        { name: 'Invoices', fn: renderInvoices },
        { name: 'Profitability', fn: renderProfitability },
        { name: 'CashBank', fn: renderCashBank },
        { name: 'Personnel', fn: renderPersonnel },
        { name: 'Orders', fn: renderOrders },
        { name: 'Cheques', fn: renderCekSenetler },
        { name: 'SidebarBadges', fn: updateSidebarBadges },
        { name: 'QuoteMaterials', fn: updateQuoteMaterials },
        { name: 'QuoteHistory', fn: renderQuoteHistory },
        { name: 'FinanceFollowUp', fn: renderFinanceFollowUp },
        { name: 'QuickSales', fn: renderQuickSales },
        { name: 'SheetCuts', fn: renderSheetCuts }
    ];

    tasks.forEach(task => {
        try {
            task.fn();
        } catch (err) {
            console.error(`Render Error [${task.name}]:`, err);
        }
    });
    enhanceSortableTableHeaders();
    refreshDateInputDisplay();
}

function addLog(msg) {
    const el = document.getElementById('debug-log');
    if (el) el.textContent = `> ${plainText(msg)}`;
    if (window.location.search.includes('debug=1')) console.log(msg);
}

let startupHydrationPromise = null;

function hydrateDBFromFileIfNeeded() {
    if (startupHydrationPromise) return startupHydrationPromise;

    startupHydrationPromise = (async () => {
        if (!window.electronAPI?.loadDBFromFile) {
            startupHydrationPending = false;
            if (startupHasValidLocalDB) {
                try { await backupBeforeReadableCodes(storedDBAtStartup); } catch(error) { startupPersistenceBlocked=true; return {success:false,error:error.message}; }
                return { success: true, source: 'local-storage' };
            }
            const saveResult = await saveDB(true);
            return saveResult.success
                ? { success: true, source: 'browser-default' }
                : saveResult;
        }

        try {
            const response = await window.electronAPI.loadDBFromFile();
            if (response && response.success && response.data) {
                await backupBeforeReadableCodes(response.data);
                db = validateAndNormalizeDB(response.data);
                try {
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                } catch (error) {
                    console.warn('Disk verisi yüklendi ancak yerel önbellek güncellenemedi:', error);
                }
                startupHasValidLocalDB = true;
                startupPersistenceBlocked = false;
                startupHydrationPending = false;
                renderAll();
                return { success: true, source: 'disk' };
            }
            if (response?.missing) {
                startupHydrationPending = false;
                if (startupHasValidLocalDB) await backupBeforeReadableCodes(storedDBAtStartup);
                const source = startupHasValidLocalDB ? 'local-storage-migrated' : 'new-install';
                const saveResult = await saveDB(true);
                return saveResult.success
                    ? { success: true, source, cacheWarning: !!saveResult.cacheWarning }
                    : saveResult;
            }
            throw new Error(response?.error || 'Kalıcı veri dosyası okunamadı.');
        } catch (error) {
            startupHydrationPending = false;
            startupPersistenceBlocked = true;
            console.error('Dosya verisi yüklenemedi:', error);
            alert(`DİKKAT: Kayıtlı veri dosyası okunamadı ve üzerine yazılmadı.\n\n${error.message}\n\nAyarlar bölümünden sağlam bir yedek geri yükleyin.`);
            return { success: false, error: error.message };
        }
    })();

    return startupHydrationPromise;
}


function setNavGroupState(group, shouldOpen) {
    if (!group) return;
    const toggle = group.querySelector('.nav-section-toggle');
    const items = group.querySelector('.nav-group-items');
    if (!toggle || !items) return;
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    items.hidden = !shouldOpen;
    group.classList.toggle('is-open', shouldOpen);
}

window.toggleNavGroup = function(groupName) {
    const selectedGroup = document.querySelector(`.nav-group[data-nav-group="${groupName}"]`);
    if (!selectedGroup) return;
    const willOpen = selectedGroup.querySelector('.nav-section-toggle')?.getAttribute('aria-expanded') !== 'true';
    setNavGroupState(selectedGroup, willOpen);
    saveWorkspacePreferences({ navGroups: { ...readWorkspacePreferences().navGroups, [groupName]: willOpen } });
};

function openNavGroupForTarget(target) {
    const activeItem = document.querySelector(`.nav-item[data-target="${target}"]`);
    const activeGroup = activeItem?.closest('.nav-group') || null;
    if (activeGroup) setNavGroupState(activeGroup, true);
}

window.switchView = function(target) {
    if (!document.getElementById(`view-${target}`)) target = 'dashboard';
    toggleWorkspaceMenu(false);
    addLog("Görünüm Değişiyor: " + target);
    
    try {
        const views = document.querySelectorAll('.view');
        const navItems = document.querySelectorAll('.nav-item');
        const pageTitle = document.getElementById('page-title');

        // Sidebar Update
        navItems.forEach(nav => {
            nav.classList.remove('active');
            nav.removeAttribute('aria-current');
            if (nav.getAttribute('data-target') === target) {
                nav.classList.add('active');
                nav.setAttribute('aria-current', 'page');
                if (pageTitle) {
                    const span = nav.querySelector('span');
                    if (span) {
                        const meta = INNER_PAGE_LAYOUTS[target];
                        const label = plainText(span.textContent);
                        pageTitle.classList.toggle('has-breadcrumb', !!meta);
                        pageTitle.innerHTML = meta
                            ? `<span class="header-breadcrumb-root">${escapeHTML(meta.category)}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span>${escapeHTML(label)}</span>`
                            : escapeHTML(nav.dataset.pageTitle || label);
                    }
                }
            }
        });
        openNavGroupForTarget(target);
        const scroller = document.querySelector('.view-container');
        if (scroller) scroller.scrollTop = 0;

        // View Update - Absolute Force Show
        views.forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none';
            if (v.id === 'view-' + target) {
                v.classList.add('active');
                v.style.display = 'flex';
                v.style.flexDirection = 'column';
            }
        });

        // Data Rendering
        setTimeout(() => {
            try {
                switch(target) {
                    case 'dashboard': renderDashboard(); break;
                    case 'quotation': renderCariler(); updateQuoteMaterials(); renderQuoteHistory(); break;
                    case 'accounts': renderCariler(); break;
                    case 'inventory': renderStoklar(); break;
                    case 'orders': renderOrders(); break;
                    case 'scraps': renderFireler(); renderSheetCuts(); break;
                    case 'expenses': renderExpenses(); break;
                    case 'profitability': renderProfitability(); break;
                    case 'cashbank': renderCashBank(); break;
                    case 'personnel': renderPersonnel(); break;
                    case 'audit': renderAuditTrail(); break;
                    case 'cheques': renderCekSenetler(); break;
                    case 'invoices': renderInvoices(); break;
                    case 'quicksales': renderQuickSales(); break;
                    case 'collections': renderCollections(); break;
                    case 'accountcheck': renderAccountChecks(); break;
                }
                enhanceTableHeaderScopes(document.getElementById(`view-${target}`) || document);
                enhanceSortableTableHeaders();
                renderHeader();
                refreshDateInputDisplay();
                addLog(`Modül Yüklendi: ${target}`);
            } catch (err) {
                console.error("Rendering Error:", err);
            }
        }, 30);

    } catch (e) {
        console.error("SwitchView Error:", e);
    }
};

window.onhashchange = () => {
    const hash = window.location.hash.substring(1) || 'dashboard';
    switchView(hash);
    
    // Initial badge update
    setTimeout(updateNotifications, 500);
}

window.updateNotifications = function() {
    const orders = getDBArray('isEmirleri').filter(o => o.durum === 'Beklemede');
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    if (orders.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = orders.length;
    } else {
        badge.style.display = 'none';
    }
    updateSidebarBadges();
};

function updateSidebarBadges() {
    const pendingOrders = getDBArray('isEmirleri').filter(order => order.durum === 'Beklemede').length;
    const criticalStocks = getCriticalStockItems().length;
    [
        ['nav-badge-orders', pendingOrders, `${pendingOrders} bekleyen iş emri`],
        ['nav-badge-stock', criticalStocks, `${criticalStocks} kritik stok`]
    ].forEach(([id, count, label]) => {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = String(count);
        badge.hidden = count === 0;
        badge.setAttribute('aria-label', label);
        badge.closest('.nav-item')?.setAttribute('aria-label', count > 0
            ? `${badge.closest('.nav-item').querySelector('span')?.textContent || ''}, ${label}`
            : (badge.closest('.nav-item').querySelector('span')?.textContent || ''));
    });
    const operationBadge = document.getElementById('nav-group-badge-operations');
    if (operationBadge) {
        const totalAlerts = pendingOrders + criticalStocks;
        operationBadge.textContent = String(totalAlerts);
        operationBadge.hidden = totalAlerts === 0;
        operationBadge.setAttribute('aria-label', `${pendingOrders} bekleyen iş, ${criticalStocks} kritik stok`);
        operationBadge.title = `${pendingOrders} bekleyen iş / ${criticalStocks} kritik stok`;
        operationBadge.closest('.nav-section-toggle')?.setAttribute('aria-label', totalAlerts > 0
            ? `Operasyon, ${pendingOrders} bekleyen iş, ${criticalStocks} kritik stok`
            : 'Operasyon');
    }
}

window.openNotifications = function() {
    const orders = getDBArray('isEmirleri').filter(o => o.durum === 'Beklemede');
    const list = document.getElementById('notification-list');
    if (!list) return;
    
    if (orders.length === 0) {
        list.innerHTML = '<li style="padding: 15px; text-align: center; color: var(--text-muted);">Bekleyen iş emri bulunmuyor.</li>';
    } else {
        list.innerHTML = orders.map(o => `
            <li style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="closeModal('modal-notifications'); location.hash='orders'; switchView('orders'); setTimeout(() => openOrderHistory(${o.id}), 100);">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong style="color:var(--warning); text-decoration:underline;">${escapeHTML(o.orderNo)}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${escapeHTML(o.tarih)}</span>
                </div>
                <div style="font-size:14px; font-weight:500; color:var(--primary);">${escapeHTML(o.customerName || 'Bilinmeyen Müşteri')}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${escapeHTML(o.description || '-')}</div>
            </li>
        `).join('');
    }
    openModal('modal-notifications');
};;

window.updateQuoteTypeUI = function() {
    const type = document.getElementById('quote-type').value;
    const operationMeta = getQuoteOperationMeta(type);
    const lazerFields = document.getElementById('quote-lazer-fields');
    const kgFields = document.getElementById('quote-kg-fields');
    const descContainer = document.getElementById('quote-desc-container');
    const cutLabel = document.getElementById('summary-cut-label');

    const usesKgPricing = operationMeta.pricing === 'kg';
    lazerFields.style.display = usesKgPricing ? 'none' : 'flex';
    kgFields.style.display = usesKgPricing ? 'flex' : 'none';
    descContainer.style.display = operationMeta.descriptionHidden ? 'none' : 'block';
    cutLabel.textContent = operationMeta.summaryLabel;
    document.getElementById('summary-cut-container').style.display = operationMeta.operationSummaryHidden ? 'none' : 'flex';

    if (usesKgPricing) {
        document.getElementById('label-kg-amount').textContent = operationMeta.kgAmountLabel;
        document.getElementById('label-kg-price').textContent = operationMeta.kgPriceLabel;
    }

    const helper = document.getElementById('quote-pricing-helper');
    if (helper) {
        helper.textContent = operationMeta.helperText || '';
        helper.hidden = !operationMeta.helperText;
    }

    updateQuoteMaterials();
    calculateQuote();
};

window.calculateQuote = function() {
    const type = document.getElementById('quote-type') ? document.getElementById('quote-type').value : 'lazer';
    
    const inputMinutes = document.getElementById('quote-minutes');
    const inputRate = document.getElementById('quote-rate');
    const inputKgAmount = document.getElementById('quote-kg-amount');
    const inputKgPrice = document.getElementById('quote-kg-price');
    
    const selectMaterial = document.getElementById('quote-material');
    const inputMaterialQty = document.getElementById('quote-material-qty');
    const inputDiscount = document.getElementById('quote-discount');
    const selectTax = document.getElementById('quote-tax-rate');

    const stokId = selectMaterial ? selectMaterial.value : "0";
    const stok = db.stoklar.find(s => s.id == stokId);
    
    const readPreviewNumber = (input, fallback = 0) => {
        const raw = input?.value;
        if (raw === undefined || raw === null || plainText(raw) === '') return fallback;
        const value = Number(raw);
        return Number.isFinite(value) ? value : fallback;
    };
    const materialCostPerUnit = getStockPlateCost(stok);
    const materialQty = readPreviewNumber(inputMaterialQty);
    const discountPercent = readPreviewNumber(inputDiscount);
    const taxRatePercent = readPreviewNumber(selectTax, 20);
    const amounts = calculateQuoteAmounts({
        islemTipi: type,
        minutes: readPreviewNumber(inputMinutes),
        rate: readPreviewNumber(inputRate),
        kgAmount: readPreviewNumber(inputKgAmount),
        kgPrice: readPreviewNumber(inputKgPrice),
        materialCostPerUnit,
        stokQty: materialQty,
        discountPercent,
        taxRate: taxRatePercent
    });
    const {
        operationCost,
        materialCost,
        discountAmount,
        subTotal,
        tax,
        total
    } = amounts;

    if(document.getElementById('summary-cut')) document.getElementById('summary-cut').textContent = formatCurrency(operationCost);
    if(document.getElementById('summary-mat')) document.getElementById('summary-mat').textContent = formatCurrency(materialCost);
    if(document.getElementById('summary-discount')) document.getElementById('summary-discount').textContent = formatCurrency(discountAmount);
    if(document.getElementById('summary-sub')) document.getElementById('summary-sub').textContent = formatCurrency(subTotal);
    if(document.getElementById('summary-tax')) document.getElementById('summary-tax').textContent = formatCurrency(tax);
    if(document.getElementById('summary-tax-label')) document.getElementById('summary-tax-label').textContent = `KDV (%${taxRatePercent}):`;
    if(document.getElementById('summary-total')) document.getElementById('summary-total').textContent = formatCurrency(total);
};

// (saveQuote and approveQuoteAsOrder are defined earlier in the file via getQuoteData)

// ========== ÇEK / SENET MODÜLÜ ==========

const CEK_SENET_TYPES = {
    alinan_cek: { label: 'Alınan Çek', icon: 'fa-money-check-dollar', direction: 'incoming' },
    verilen_cek: { label: 'Verilen Çek', icon: 'fa-money-check', direction: 'outgoing' },
    alinan_senet: { label: 'Alınan Senet', icon: 'fa-file-signature', direction: 'incoming' },
    verilen_senet: { label: 'Verilen Senet', icon: 'fa-file-contract', direction: 'outgoing' }
};

const CEK_SENET_STATUS = {
    beklemede: { label: 'Beklemede', badge: 'warning' },
    tahsil_edildi: { label: 'Tahsil Edildi', badge: 'success' },
    odendi: { label: 'Ödendi', badge: 'success' },
    karsiliksiz: { label: 'Karşılıksız', badge: 'error' },
    iptal: { label: 'İptal', badge: 'info' }
};

function getCekSenetTypeLabel(type) {
    return CEK_SENET_TYPES[type]?.label || 'Çek / Senet';
}

function getCekSenetStatusLabel(status) {
    return CEK_SENET_STATUS[status]?.label || 'Beklemede';
}

function getCekSenetStatusBadge(status) {
    return CEK_SENET_STATUS[status]?.badge || 'warning';
}

function getCekSenetDirection(record) {
    return CEK_SENET_TYPES[record?.tip]?.direction || 'incoming';
}

function isCekSenetSettled(record) {
    const direction = getCekSenetDirection(record);
    return direction === 'incoming'
        ? record?.durum === 'tahsil_edildi'
        : record?.durum === 'odendi';
}

function getCekSenetCariDelta(record) {
    const tutar = roundMoney(record?.tutar || 0);
    if (!tutar) return 0;
    return getCekSenetDirection(record) === 'incoming' ? -tutar : tutar;
}

function toTRDateFromInput(value) {
    if (!value) return new Date().toLocaleDateString('tr-TR');
    const parsed = parseDateInputValue(value);
    return parsed ? parsed.toLocaleDateString('tr-TR') : value;
}

function populateCekSenetCariOptions(selectedId = '') {
    const select = document.getElementById('input-ceksenet-cari');
    if (!select) return;
    const current = selectedId || select.value;
    select.innerHTML = '<option value="">Cari seçin...</option>' + getDBArray('cariler')
        .filter(c => !c.isPasif || String(c.id) === String(current))
        .map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu || '-')})</option>`)
        .join('');
    if (current && getDBArray('cariler').some(c => c.id == current)) select.value = current;
}

function syncCekSenetCariEffect(record, kasaId = '') {
    if (!record) return false;
    const cari = findCariByReference(record.cariId, record.firma);
    if (!cari) return false;

    const shouldReflect = isCekSenetSettled(record);
    const alreadyReflected = record.cariYansitildi === true;
    const delta = getCekSenetCariDelta(record);

    if (shouldReflect && !alreadyReflected) {
        const kasa = getDBArray('kasaHesaplari').find(item => item.id == (kasaId || record.kasaId));
        if (!kasa || !isCashAccountActive(kasa)) return false;
        const hareket = addCariMovement(cari, {
            tip: `${getCekSenetTypeLabel(record.tip)} ${getCekSenetStatusLabel(record.durum)}`,
            aciklama: `${record.belgeNo || 'Belge'}${record.vadeTarihi ? ` / Vade: ${record.vadeTarihi}` : ''}${record.aciklama ? ` - ${record.aciklama}` : ''}`,
            tutar: record.tutar,
            bakiyeDegisimi: delta,
            isSuccess: true,
            isGelir: getCekSenetDirection(record) === 'incoming',
            ek: record.ek || null
        });
        const cashMovement = addCashMovement(kasa.id, {
            tip: getCekSenetDirection(record) === 'incoming' ? 'giris' : 'cikis',
            tutar: record.tutar,
            aciklama: `${record.firma} - ${record.belgeNo || getCekSenetTypeLabel(record.tip)}`,
            kaynak: 'cek-senet',
            refId: record.id
        });
        record.cariYansitildi = true;
        record.cariBakiyeDegisimi = delta;
        record.cariIslemId = hareket?.id || null;
        record.kasaId = kasa.id;
        record.kasaHareketId = cashMovement?.id || null;
    } else if (!shouldReflect && alreadyReflected) {
        const oldDelta = typeof record.cariBakiyeDegisimi === 'number' ? record.cariBakiyeDegisimi : delta;
        // Link the reversal so the settled movement cannot be undone a second time from the account history.
        const original = getDBArray('islemler').find(item => String(item.id) === String(record.cariIslemId) && !item.reversedBy);
        const reversal = addCariMovement(cari, {
            tip: `${getCekSenetTypeLabel(record.tip)} Geri Alındı`,
            aciklama: `${record.belgeNo || 'Belge'} durumu ${getCekSenetStatusLabel(record.durum)} yapıldı; cari etkisi geri alındı.`,
            tutar: record.tutar,
            bakiyeDegisimi: -oldDelta,
            isSuccess: false,
            isGelir: false,
            reversalOf: original?.id || null,
            ek: record.ek || null
        });
        if (original && reversal) original.reversedBy = reversal.id;
        record.cariYansitildi = false;
        record.cariBakiyeDegisimi = 0;
        record.cariIslemId = null;
        if (record.kasaHareketId) {
            reverseCashMovement(record.kasaHareketId, `${record.belgeNo || 'Çek/senet'} durumu geri alındı`);
        }
        record.kasaHareketId = null;
    }
    return true;
}

window.openCekSenetModal = function(id = '') {
    const record = id ? getDBArray('cekSenetler').find(item => String(item.id) === String(id)) : null;
    if (record?.cariYansitildi) {
        return showToast({ type: 'warning', title: 'Kapatılmış belge doğrudan düzenlenemez', message: 'Önce durumunu Beklemede veya İptal yaparak finans etkisini geri alın.' });
    }
    ['input-ceksenet-no', 'input-ceksenet-banka', 'input-ceksenet-kesideci', 'input-ceksenet-lehtar', 'input-ceksenet-seri', 'input-ceksenet-iban', 'input-ceksenet-teslim', 'input-ceksenet-tutar', 'input-ceksenet-aciklama', 'input-ceksenet-ek-not'].forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    resetAttachmentInputs('input-ceksenet-ek', 'input-ceksenet-ek-not');
    document.getElementById('input-ceksenet-id').value = record?.id || '';
    document.getElementById('input-ceksenet-tip').value = record?.tip || 'alinan_cek';
    populateCekSenetCariOptions(record?.cariId || '');
    updateCekSenetStatusOptions();
    document.getElementById('input-ceksenet-durum').value = record?.durum || 'beklemede';
    document.getElementById('input-ceksenet-cari').value = record?.cariId || '';
    document.getElementById('input-ceksenet-no').value = record?.belgeNo || '';
    document.getElementById('input-ceksenet-banka').value = record?.banka || '';
    document.getElementById('input-ceksenet-kesideci').value = record?.kesideci || '';
    document.getElementById('input-ceksenet-lehtar').value = record?.lehtar || '';
    document.getElementById('input-ceksenet-seri').value = record?.seriNo || '';
    document.getElementById('input-ceksenet-iban').value = record?.hesapIban || '';
    document.getElementById('input-ceksenet-ciro').value = record?.ciroDurumu || 'ciro_yok';
    document.getElementById('input-ceksenet-teslim').value = record?.teslimAlan || '';
    document.getElementById('input-ceksenet-tutar').value = record?.tutar || '';
    document.getElementById('input-ceksenet-aciklama').value = record?.aciklama || '';
    document.getElementById('input-ceksenet-ek-not').value = record?.ek?.note || '';
    document.getElementById('modal-ceksenet-title').textContent = record ? 'Çek / Senet Kaydını Düzenle' : 'Çek / Senet Ekle';
    document.getElementById('btn-ceksenet-save').textContent = record ? 'Değişiklikleri Kaydet' : 'Kaydet';
    const noEl = document.getElementById('input-ceksenet-no');
    if (noEl && !noEl.value) noEl.placeholder = previewSerialNo('cekSenet');
    const vadeEl = document.getElementById('input-ceksenet-vade');
    if (vadeEl) vadeEl.value = record ? toDateInputValue(parseTRDate(record.vadeTarihi)) : toDateInputValue(new Date());
    populateKasaOptions(record?.kasaId || '');
    if (record?.kasaId) document.getElementById('input-ceksenet-kasa').value = record.kasaId;
    refreshDateInputDisplay();
    openModal('modal-ceksenet');
};

window.updateCekSenetStatusOptions = function() {
    const type = document.getElementById('input-ceksenet-tip')?.value || 'alinan_cek';
    const statusEl = document.getElementById('input-ceksenet-durum');
    const infoEl = document.getElementById('ceksenet-info');
    if (!statusEl) return;

    const direction = CEK_SENET_TYPES[type]?.direction || 'incoming';
    const current = statusEl.value;
    const settledOption = direction === 'incoming'
        ? '<option value="tahsil_edildi">Tahsil Edildi</option>'
        : '<option value="odendi">Ödendi</option>';
    statusEl.innerHTML = `
        <option value="beklemede">Beklemede</option>
        ${settledOption}
        ${direction === 'incoming' ? '<option value="karsiliksiz">Karşılıksız</option>' : ''}
        <option value="iptal">İptal</option>
    `;
    statusEl.value = [...statusEl.options].some(opt => opt.value === current) ? current : 'beklemede';

    if (infoEl) {
        infoEl.textContent = direction === 'incoming'
            ? 'Alınan çek/senet beklemedeyken sadece takip edilir; tahsil edildi yapınca cari borç azalır.'
            : 'Verilen çek/senet beklemedeyken sadece takip edilir; ödendi yapınca bizim borcumuz azalır.';
    }
};

window.saveCekSenet = function() {
    const unlock = beginModalSubmit('modal-ceksenet');
    if (!unlock) return;
    try {
    const id = document.getElementById('input-ceksenet-id')?.value || '';
    const existing = id ? getDBArray('cekSenetler').find(item => String(item.id) === String(id)) : null;
    if (existing?.cariYansitildi) return alert('Kapatılmış çek/senet doğrudan düzenlenemez. Önce durumunu beklemeye alın.');
    const tip = document.getElementById('input-ceksenet-tip')?.value || 'alinan_cek';
    const cariId = document.getElementById('input-ceksenet-cari')?.value || '';
    const cari = findCariByReference(cariId);
    const belgeNo = plainText(document.getElementById('input-ceksenet-no')?.value || '') || generateSerialNo('cekSenet');
    const banka = plainText(document.getElementById('input-ceksenet-banka')?.value || '');
    const vadeValue = document.getElementById('input-ceksenet-vade')?.value || '';
    const tutar = roundMoney(parseFloat(document.getElementById('input-ceksenet-tutar')?.value || '0') || 0);
    const durum = document.getElementById('input-ceksenet-durum')?.value || 'beklemede';
    const kasaId = document.getElementById('input-ceksenet-kasa')?.value || '';
    const aciklama = plainText(document.getElementById('input-ceksenet-aciklama')?.value || '');
    const kesideci = plainText(document.getElementById('input-ceksenet-kesideci')?.value || '');
    const lehtar = plainText(document.getElementById('input-ceksenet-lehtar')?.value || '');
    const seriNo = plainText(document.getElementById('input-ceksenet-seri')?.value || '');
    const hesapIban = plainText(document.getElementById('input-ceksenet-iban')?.value || '').replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
    const ciroDurumu = document.getElementById('input-ceksenet-ciro')?.value || 'ciro_yok';
    const teslimAlan = plainText(document.getElementById('input-ceksenet-teslim')?.value || '');
    const attachmentInput = document.getElementById('input-ceksenet-ek');
    const attachmentNote = plainText(document.getElementById('input-ceksenet-ek-not')?.value || '');
    const hasNewAttachment = !!attachmentInput?.files?.[0];
    const newAttachment = getAttachmentFromInputs('input-ceksenet-ek', 'input-ceksenet-ek-not');
    const ek = existing?.ek && !hasNewAttachment ? { ...existing.ek, note: attachmentNote } : newAttachment;

    if (!validateModalFields('modal-ceksenet', [
        { id: 'input-ceksenet-cari', test: value => !!findCariByReference(value), message: 'Çek/senet için cari seçin.' },
        { id: 'input-ceksenet-vade', test: value => !!value, message: 'Vade tarihini seçin.' },
        { id: 'input-ceksenet-tutar', test: value => Number(value) > 0, message: 'Sıfırdan büyük geçerli bir tutar girin.' }
    ])) return;
    if (!cari) return;
    if (hasDuplicateCekSenetNo(belgeNo, existing?.id || null)) {
        setFieldError('input-ceksenet-no', 'Bu çek/senet numarası daha önce kullanılmış. Farklı bir numara girin.');
        document.getElementById('input-ceksenet-no')?.focus();
        return;
    }
    const willSettle = (CEK_SENET_TYPES[tip]?.direction === 'incoming' && durum === 'tahsil_edildi') || (CEK_SENET_TYPES[tip]?.direction === 'outgoing' && durum === 'odendi');
    if (willSettle && !getDBArray('kasaHesaplari').some(item => item.id == kasaId)) {
        setFieldError('input-ceksenet-kasa', 'Tahsil edilen veya ödenen çek/senet için kasa/banka hesabı seçin.');
        document.getElementById('input-ceksenet-kasa')?.focus();
        return;
    }

    const oldStatus = existing?.durum || '';
    const record = existing || {
        id: createRecordId(),
        tarih: new Date().toLocaleDateString('tr-TR'),
        durumGecmisi: [],
        cariYansitildi: false,
        cariBakiyeDegisimi: 0
    };
    Object.assign(record, {
        tip,
        cariId: cari.id,
        firma: cari.adi,
        belgeNo,
        banka,
        kesideci,
        lehtar,
        seriNo,
        hesapIban,
        ciroDurumu,
        teslimAlan,
        vadeTarihi: toTRDateFromInput(vadeValue),
        tutar,
        durum,
        kasaId: kasaId || null,
        aciklama,
        ek
    });
    if (!Array.isArray(record.durumGecmisi)) record.durumGecmisi = [];
    if (!existing || oldStatus !== durum) {
        record.durumGecmisi.push({ durum, tarih: new Date().toLocaleString('tr-TR'), aciklama: existing ? 'Belge düzenlenirken durum güncellendi' : 'Belge oluşturuldu' });
    }

    if (!existing) db.cekSenetler.push(record);
    if (!existing || hasNewAttachment) scheduleAttachmentArchive(ek, 'Cek Senet', cari.adi);
    syncCekSenetCariEffect(record, kasaId);
    addAuditLog(existing ? 'Güncellendi' : 'Oluşturuldu', 'Çek / Senet', record.id, `${record.belgeNo} / ${record.firma} / ${getCekSenetStatusLabel(record.durum)}`);
    saveDB();
    closeModal('modal-ceksenet');
    renderCekSenetler();

    ['input-ceksenet-no', 'input-ceksenet-banka', 'input-ceksenet-kesideci', 'input-ceksenet-lehtar', 'input-ceksenet-seri', 'input-ceksenet-iban', 'input-ceksenet-teslim', 'input-ceksenet-tutar', 'input-ceksenet-aciklama', 'input-ceksenet-ek-not'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const ekEl = document.getElementById('input-ceksenet-ek');
    if (ekEl) ekEl.value = '';
    const cariEl = document.getElementById('input-ceksenet-cari');
    if (cariEl) cariEl.value = '';
    document.getElementById('input-ceksenet-id').value = '';
    if (record.cariYansitildi) {
        showImpactSummary(`${getCekSenetTypeLabel(tip)} ${existing ? 'güncellendi' : 'kaydedildi'}`, [
            { label: 'Cari', value: record.cariBakiyeDegisimi },
            { label: 'Kasa', value: getCekSenetDirection(record) === 'incoming' ? tutar : -tutar }
        ], { message: `${getCekSenetStatusLabel(durum)} / ${cari.adi}` });
    } else {
        showToast({ type: 'success', title: `${getCekSenetTypeLabel(tip)} ${existing ? 'güncellendi' : 'kaydedildi'}`, message: `${getCekSenetStatusLabel(durum)} / ${cari.adi}` });
    }
    } finally {
        unlock();
    }
};

window.updateCekSenetStatus = function(id, status) {
    const record = getDBArray('cekSenetler').find(item => item.id == id);
    if (!record) return;
    const oldStatus = record.durum;
    if (oldStatus === status) return;
    const nextRecord = { ...record, durum: status };
    if (isCekSenetSettled(nextRecord) && !record.cariYansitildi) {
        renderCekSenetler();
        openSettlementModal({
            title: getCekSenetDirection(record) === 'incoming' ? 'Çek / Senet Tahsilatı' : 'Çek / Senet Ödemesi',
            message: `${record.firma} / ${record.belgeNo || '-'} / ${formatCurrency(record.tutar)}. Hesabı seçin.`,
            defaultKasaId: record.kasaId || '',
            onConfirm: kasaId => {
                record.durum = status;
                if (!syncCekSenetCariEffect(record, kasaId)) {
                    record.durum = oldStatus;
                    return alert('Çek/senet işlemi kasa veya cari bulunamadığı için tamamlanamadı.');
                }
                addAuditLog('Durum Değişti', 'Çek / Senet', record.id, `${getCekSenetStatusLabel(oldStatus)} -> ${getCekSenetStatusLabel(status)}`);
                if (!Array.isArray(record.durumGecmisi)) record.durumGecmisi = [];
                record.durumGecmisi.push({ durum: status, tarih: new Date().toLocaleString('tr-TR'), aciklama: `${getCekSenetStatusLabel(oldStatus)} durumundan değiştirildi` });
                saveDB();
                showImpactSummary(getCekSenetDirection(record) === 'incoming' ? 'Çek / senet tahsil edildi' : 'Çek / senet ödendi', [
                    { label: 'Cari', value: record.cariBakiyeDegisimi },
                    { label: 'Kasa', value: getCekSenetDirection(record) === 'incoming' ? record.tutar : -record.tutar }
                ], { message: `${record.belgeNo || '-'} / ${record.firma}` });
            }
        });
        return;
    }
    record.durum = status;
    const wasReflected = record.cariYansitildi === true;
    const oldDelta = Number(record.cariBakiyeDegisimi) || getCekSenetCariDelta(record);
    syncCekSenetCariEffect(record);
    addAuditLog('Durum Değişti', 'Çek / Senet', record.id, `${getCekSenetStatusLabel(oldStatus)} -> ${getCekSenetStatusLabel(status)}`);
    if (!Array.isArray(record.durumGecmisi)) record.durumGecmisi = [];
    record.durumGecmisi.push({ durum: status, tarih: new Date().toLocaleString('tr-TR'), aciklama: `${getCekSenetStatusLabel(oldStatus)} durumundan değiştirildi` });
    saveDB();
    if (wasReflected && !record.cariYansitildi) {
        showImpactSummary('Çek / senet etkisi geri alındı', [
            { label: 'Cari', value: -oldDelta },
            { label: 'Kasa', value: getCekSenetDirection(record) === 'incoming' ? -record.tutar : record.tutar }
        ], { message: `${record.belgeNo || '-'} durumu ${getCekSenetStatusLabel(status)} olarak güncellendi.` });
    } else {
        showToast({ type: 'success', title: 'Çek / senet güncellendi', message: `${record.belgeNo || '-'} / ${getCekSenetStatusLabel(status)}` });
    }
};

window.showCekSenetHistory = function(id) {
    const record = getDBArray('cekSenetler').find(item => item.id == id);
    if (!record) return alert('Çek/senet kaydı bulunamadı.');
    let modal = document.getElementById('modal-ceksenet-history');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ceksenet-history';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    const history = Array.isArray(record.durumGecmisi) && record.durumGecmisi.length
        ? record.durumGecmisi.slice().reverse()
        : [{ durum: record.durum || 'beklemede', tarih: record.tarih || '-', aciklama: 'Mevcut durum' }];
    modal.innerHTML = `<div class="modal-content glass-panel">
        <div class="flex-between mb-4"><h3>Belge ve Durum Tarihçesi</h3><button type="button" class="btn-close" onclick="closeModal('modal-ceksenet-history')"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-impact-note" style="margin-bottom:14px;"><i class="fa-solid fa-money-check-dollar"></i><span><strong>${escapeHTML(record.belgeNo || '-')}</strong> · ${escapeHTML(record.firma || '-')} · ${formatCurrency(record.tutar || 0)}</span></div>
        <div class="history-timeline">${history.map(item => `<div class="history-timeline-item"><span class="history-timeline-icon"><i class="fa-solid fa-clock-rotate-left"></i></span><span><strong>${escapeHTML(getCekSenetStatusLabel(item.durum))}</strong><small>${escapeHTML(item.tarih || '-')} · ${escapeHTML(item.aciklama || 'Durum güncellendi')}</small></span></div>`).join('')}</div>
        <div class="modal-impact-note" style="margin-top:14px;"><i class="fa-solid fa-link"></i><span>${record.kesideci ? `Keşideci: ${escapeHTML(record.kesideci)} · ` : ''}${record.lehtar ? `Lehtar: ${escapeHTML(record.lehtar)} · ` : ''}${record.seriNo ? `Seri: ${escapeHTML(record.seriNo)} · ` : ''}${record.teslimAlan ? `Teslim: ${escapeHTML(record.teslimAlan)}` : 'Teslim bilgisi yok'}</span></div>
    </div>`;
    openModal('modal-ceksenet-history');
};

window.deleteCekSenet = function(id) {
    const record = getDBArray('cekSenetler').find(item => item.id == id);
    if (!record) return alert('Çek/senet kaydı bulunamadı.');
    confirmAction('Bu çek/senet kaydı silinsin mi? Tahsil edilmiş veya ödenmişse cari ve kasa etkileri geri alınacak.', () => {
        if (!getDBArray('cekSenetler').includes(record)) return alert('Bu çek/senet daha önce kaldırıldı.');
        const wasReflected = record.cariYansitildi === true;
        const oldDelta = Number(record.cariBakiyeDegisimi) || getCekSenetCariDelta(record);
        const cashDelta = getCekSenetDirection(record) === 'incoming' ? -record.tutar : record.tutar;
        if (wasReflected) {
            record.durum = 'iptal';
            syncCekSenetCariEffect(record);
        }
        addAuditLog('Silindi', 'Çek / Senet', record.id, `${record.belgeNo} / ${record.firma}`);
        db.cekSenetler = getDBArray('cekSenetler').filter(item => item.id != id);
        saveDB();
        renderCekSenetler();
        const impacts = wasReflected ? [{ label: 'Cari', value: -oldDelta }, { label: 'Kasa', value: cashDelta }] : [];
        showImpactSummary('Çek / senet silindi', impacts, { message: wasReflected ? 'Cari ve kasa etkileri ters kayıtla düzeltildi.' : 'Bekleyen kayıt kaldırıldı.' });
    }, { title: 'Çek / Senet Kaydını Sil', confirmLabel: 'Kaydı Sil' });
};

function renderCekSenetler() {
    const tbody = document.getElementById('cheques-tbody');
    if (!tbody) return;

    const records = getFilteredCekSenetlerForReport();
    const incomingWaiting = records
        .filter(r => getCekSenetDirection(r) === 'incoming' && r.durum === 'beklemede')
        .reduce((acc, r) => acc + (r.tutar || 0), 0);
    const outgoingWaiting = records
        .filter(r => getCekSenetDirection(r) === 'outgoing' && r.durum === 'beklemede')
        .reduce((acc, r) => acc + (r.tutar || 0), 0);
    const settledTotal = records
        .filter(isCekSenetSettled)
        .reduce((acc, r) => acc + (r.tutar || 0), 0);

    const incomingEl = document.getElementById('cheques-stat-incoming');
    const outgoingEl = document.getElementById('cheques-stat-outgoing');
    const settledEl = document.getElementById('cheques-stat-settled');
    if (incomingEl) incomingEl.textContent = formatCurrency(incomingWaiting);
    if (outgoingEl) outgoingEl.textContent = formatCurrency(outgoingWaiting);
    if (settledEl) settledEl.textContent = formatCurrency(settledTotal);

    const reversedRecords = applyListSort('cheques', [...records].reverse(), {
        type: item => getCekSenetTypeLabel(item.tip),
        company: item => `${item.firma || ''} ${item.belgeNo || ''}`,
        date: item => parseTRDate(item.vadeTarihi || ''),
        bank: item => item.banka || '',
        amount: item => Number(item.tutar) || 0,
        status: item => getCekSenetStatusLabel(item.durum)
    });
    window.pageCheques = window.pageCheques || 1;
    const itemsPerPage = getListPageSize('cheques');
    const totalPages = Math.ceil(reversedRecords.length / itemsPerPage) || 1;
    if (window.pageCheques > totalPages) window.pageCheques = totalPages;
    if (window.pageCheques < 1) window.pageCheques = 1;

    const startIndex = (window.pageCheques - 1) * itemsPerPage;
    const paginatedItems = reversedRecords.slice(startIndex, startIndex + itemsPerPage);

    const pageInfo = document.getElementById('cheques-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pageCheques, totalPages, reversedRecords.length, itemsPerPage);
    const prevBtn = document.getElementById('btn-cheques-prev');
    const nextBtn = document.getElementById('btn-cheques-next');
    if (prevBtn) prevBtn.disabled = window.pageCheques <= 1;
    if (nextBtn) nextBtn.disabled = window.pageCheques >= totalPages;

    tbody.innerHTML = paginatedItems.length ? paginatedItems.map(record => {
        const statusOptions = Object.entries(CEK_SENET_STATUS)
            .filter(([value]) => value !== 'tahsil_edildi' || getCekSenetDirection(record) === 'incoming')
            .filter(([value]) => value !== 'odendi' || getCekSenetDirection(record) === 'outgoing')
            .filter(([value]) => value !== 'karsiliksiz' || getCekSenetDirection(record) === 'incoming')
            .map(([value, meta]) => `<option value="${value}" ${record.durum === value ? 'selected' : ''}>${meta.label}</option>`)
            .join('');
        return `
            <tr>
                ${renderSelectionCell('cheques', record.id)}
                <td>
                    <span class="badge ${getCekSenetDirection(record) === 'incoming' ? 'success' : 'info'}">
                        <i class="fa-solid ${CEK_SENET_TYPES[record.tip]?.icon || 'fa-file-lines'}"></i>
                        ${escapeHTML(getCekSenetTypeLabel(record.tip))}
                    </span>
                </td>
                <td><strong>${escapeHTML(record.firma || '-')}</strong><br><span class="dashboard-muted-text">${escapeHTML(record.belgeNo || '-')}</span>${renderAttachmentBadge(record)}</td>
                <td>${escapeHTML(record.vadeTarihi || '-')}</td>
                <td>${escapeHTML(record.banka || '-')}</td>
                <td style="text-align:right; font-weight:700;">${formatCurrency(record.tutar || 0)}</td>
                <td>
                    <select class="form-control compact-select cheque-status-select ${getCekSenetStatusBadge(record.durum)}" aria-label="Çek veya senet durumunu değiştir" onchange="updateCekSenetStatus('${record.id}', this.value)">
                        ${statusOptions}
                    </select>
                </td>
                <td style="text-align:right;"><div class="table-actions destructive-actions">
                    <button class="btn btn-outline table-action-button" aria-label="Çek veya senet tarihçesini göster" title="Tarihçe" onclick="showCekSenetHistory('${record.id}')"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Tarihçe</button>
                    ${record.cariYansitildi ? '' : `<button class="btn btn-outline table-action-button" aria-label="Çek veya senet kaydını düzenle" title="Düzenle" onclick="openCekSenetModal('${record.id}')"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Düzenle</button>`}
                    <button class="btn btn-danger table-action-button" aria-label="Çek veya senet kaydını sil" title="Sil" onclick="deleteCekSenet('${record.id}')"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `;
    }).join('') : renderTableEmptyState(8, 'Henüz çek veya senet kaydı yok.', 'Yeni belge eklediğinizde vade ve durum bilgileri burada izlenecek.', 'fa-money-check-dollar');
    updateReportSelectionUI('cheques');
}

window.prevChequesPage = function() {
    if (window.pageCheques > 1) {
        window.pageCheques--;
        renderCekSenetler();
    }
};

window.nextChequesPage = function() {
    window.pageCheques = (window.pageCheques || 1) + 1;
    renderCekSenetler();
};

// ========== FATURALAR MODÜLÜ ==========

let invoiceTabFilter = 'kesilen';

window.setInvoiceTab = function(tab) {
    invoiceTabFilter = tab;
    window.pageInvoices = 1;
    const btnKesilen = document.getElementById('inv-tab-kesilen');
    const btnAlinan = document.getElementById('inv-tab-alinan');
    if (btnKesilen) btnKesilen.className = tab === 'kesilen' ? 'btn btn-primary' : 'btn btn-outline';
    if (btnAlinan) btnAlinan.className = tab === 'alinan' ? 'btn btn-primary' : 'btn btn-outline';
    renderInvoices();
};

function renderInvoices() {
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    if (!db.faturalar) db.faturalar = [];
    const faturalar = getFilteredInvoicesForReport();

    const kesilen = faturalar.filter(f => f.tur === 'kesilen');
    const alinan = faturalar.filter(f => f.tur === 'alinan');

    const toplamKesilen = kesilen.reduce((a, f) => a + (f.tutar || 0), 0);
    const toplamAlinan = alinan.reduce((a, f) => a + (f.tutar || 0), 0);

    const elKesilen = document.getElementById('inv-total-kesilen');
    const elAlinan = document.getElementById('inv-total-alinan');
    if (elKesilen) elKesilen.textContent = formatCurrency(toplamKesilen);
    if (elAlinan) elAlinan.textContent = formatCurrency(toplamAlinan);

    const filtered = invoiceTabFilter === 'kesilen' ? kesilen : alinan;
    const reversedFiltered = applyListSort('invoices', [...filtered].reverse(), {
        number: item => item.faturaNo || '',
        date: item => parseTRDate(item.tarih || ''),
        company: item => item.firma || '',
        description: item => item.aciklama || '',
        amount: item => Number(item.tutar) || 0
    });

    // Sayfalama (Pagination) - Faturalar
    window.pageInvoices = window.pageInvoices || 1;
    const itemsPerPage = getListPageSize('invoices');
    const totalPages = Math.ceil(reversedFiltered.length / itemsPerPage) || 1;
    
    if (window.pageInvoices > totalPages) window.pageInvoices = totalPages;
    if (window.pageInvoices < 1) window.pageInvoices = 1;

    const startIndex = (window.pageInvoices - 1) * itemsPerPage;
    const paginatedItems = reversedFiltered.slice(startIndex, startIndex + itemsPerPage);

    // Update pagination UI
    const pageInfo = document.getElementById('invoices-page-info');
    if (pageInfo) pageInfo.textContent = formatListPagination(window.pageInvoices, totalPages, reversedFiltered.length, itemsPerPage);

    const btnPrev = document.getElementById('btn-invoices-prev');
    const btnNext = document.getElementById('btn-invoices-next');
    
    if (btnPrev) btnPrev.disabled = window.pageInvoices <= 1;
    if (btnNext) btnNext.disabled = window.pageInvoices >= totalPages;

    tbody.innerHTML = paginatedItems.length ? paginatedItems.map(f => `
        <tr style="cursor:pointer;" onclick="showFaturaDetail(${f.id})">
            ${renderSelectionCell('invoices', f.id)}
            <td><span class="badge" style="background:rgba(69,123,157,0.2); color:var(--secondary); border:1px solid var(--secondary);">${escapeHTML(f.faturaNo)}</span></td>
            <td style="color:var(--text-muted);">${escapeHTML(f.tarih)}</td>
            <td><strong>${escapeHTML(f.firma)}</strong></td>
            <td style="color:var(--text-muted); font-size:13px;">${escapeHTML(f.aciklama || '-')}<br><span class="dashboard-muted-text">Vade: ${escapeHTML(f.vadeTarihi || '-')} · ${getInvoicePaymentLabel(f)}</span>${renderAttachmentBadge(f)}</td>
            <td style="text-align:right; font-weight:600; color:${f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)'};">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}<div class="dashboard-muted-text">Kalan: ${getInvoicePaymentSummary(f).remaining === null ? 'Belirtilmemiş' : formatCurrency(getInvoicePaymentSummary(f).remaining)}</div></td>
            <td style="text-align:right;"><div class="table-actions">
                ${!getInvoicePaymentSummary(f).legacy && getInvoicePaymentSummary(f).remaining > 0 ? `<button class="btn btn-outline table-action-button" aria-label="${f.tur === 'kesilen' ? 'Faturaya tahsilat ekle' : 'Faturaya ödeme ekle'}" onclick="event.stopPropagation(); openInvoicePayment(${f.id})"><i class="fa-solid fa-wallet" aria-hidden="true"></i> ${f.tur === 'kesilen' ? 'Tahsilat' : 'Ödeme'}</button>` : ''}
                <button class="btn btn-outline table-action-button" aria-label="Faturayı yazdır" title="Yazdır" onclick="event.stopPropagation(); printInvoiceDocument(${f.id})"><i class="fa-solid fa-print" aria-hidden="true"></i> Yazdır</button>
                <button class="btn btn-danger table-action-button" aria-label="Faturayı sil" title="Sil" onclick="event.stopPropagation(); deleteFatura(${f.id})"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
            </div></td>
        </tr>
    `).join('') : renderTableEmptyState(7, invoiceTabFilter === 'kesilen' ? 'Henüz kesilen fatura yok.' : 'Henüz alınan fatura yok.', 'Yeni bir fatura eklediğinizde bu listede görünecek.', 'fa-file-invoice');
    updateReportSelectionUI('invoices');
}

window.prevInvoicesPage = function() {
    if (window.pageInvoices > 1) {
        window.pageInvoices--;
        renderInvoices();
    }
}

window.nextInvoicesPage = function() {
    window.pageInvoices = (window.pageInvoices || 1) + 1;
    renderInvoices();
}

window.showFaturaDetail = function(id) {
    const f = (db.faturalar || []).find(x => String(x.id) === String(id));
    if (!f) return;

    const turLabel = f.tur === 'kesilen' ? 'Kesilen Fatura' : 'Alınan Fatura';
    const turIcon = f.tur === 'kesilen' ? 'fa-arrow-up-from-bracket' : 'fa-arrow-down-to-bracket';
    const turColor = f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)';

    const payment = getInvoicePaymentSummary(f);
    const html = `
        <div class="modal-content glass-panel" style="max-width:500px;">
            <div class="flex-between mb-4">
                <h3><i class="fa-solid ${turIcon}" aria-hidden="true"></i> Fatura Detayı</h3>
                <button class="btn-close" onclick="closeModal('modal-fatura-detail')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <table class="data-table" style="width:100%;">
                <tbody>
                    <tr><td style="color:var(--text-muted); width:140px;">Fatura Türü</td><td><span class="badge ${f.tur === 'kesilen' ? 'success' : ''}" style="${f.tur === 'alinan' ? 'background:rgba(230,57,70,0.2); color:var(--alert); border:1px solid var(--alert);' : ''}">${turLabel}</span></td></tr>
                    <tr><td style="color:var(--text-muted);">Fatura No</td><td><strong>${escapeHTML(f.faturaNo)}</strong></td></tr>
                    <tr><td style="color:var(--text-muted);">Tarih</td><td>${escapeHTML(f.tarih)}</td></tr>
                    <tr><td style="color:var(--text-muted);">Vade / Ödeme</td><td>${escapeHTML(f.vadeTarihi || '-')} · ${getInvoicePaymentLabel(f)}</td></tr>
                    ${f.seriSira ? `<tr><td style="color:var(--text-muted);">Seri / Sıra</td><td>${escapeHTML(f.seriSira)}</td></tr>` : ''}
                    ${f.vergiNo ? `<tr><td style="color:var(--text-muted);">Vergi No</td><td>${escapeHTML(f.vergiNo)}</td></tr>` : ''}
                    <tr><td style="color:var(--text-muted);">Firma / Müşteri</td><td><strong>${escapeHTML(f.firma)}</strong></td></tr>
                    <tr><td style="color:var(--text-muted);">Açıklama</td><td>${escapeHTML(f.aciklama || '-')}</td></tr>
                    ${f.ek ? `<tr><td style="color:var(--text-muted);">Belge Eki</td><td><strong>${escapeHTML(f.ek.name || 'Ek belge')}</strong>${f.ek.note ? `<br><span class="dashboard-muted-text">${escapeHTML(f.ek.note)}</span>` : ''}</td></tr>` : ''}
                    <tr><td style="color:var(--text-muted);">Matrah</td><td>${formatCurrency(getInvoiceDocumentLine(f).subTotal)}</td></tr>
                    <tr><td style="color:var(--text-muted);">KDV (${escapeHTML(getInvoiceDocumentLine(f).taxRate)}%)</td><td>${formatCurrency(getInvoiceDocumentLine(f).tax)}</td></tr>
                    <tr style="border-top:2px solid var(--border);"><td style="font-weight:700; font-size:15px; padding-top:10px;">GENEL TOPLAM</td><td style="font-weight:700; font-size:20px; color:${turColor}; padding-top:10px;">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}</td></tr>
                    <tr><td>${f.tur === 'kesilen' ? 'Tahsil Edilen' : 'Ödenen'}</td><td>${payment.paid === null ? 'Önceki kayıtta tutar belirtilmemiş' : formatCurrency(payment.paid)}</td></tr>
                    <tr><td><strong>Kalan Tutar</strong></td><td><strong>${payment.remaining === null ? 'Belirtilmemiş' : formatCurrency(payment.remaining)}</strong></td></tr>
                </tbody>
            </table>
            ${payment.legacy || f.paymentOpeningAmount !== undefined ? `<div class="form-group" style="margin-top:16px;">
                <label for="invoice-history-paid">Önceki kayıtlarda ödenen toplam (₺)</label>
                <input id="invoice-history-paid" class="form-control" type="number" min="${payment.linkedPaid}" max="${f.tutar}" step="0.01" value="${payment.paid ?? ''}">
                <p class="dashboard-muted-text">Ödeme geçmişini tamamlar. Cari ve kasa bakiyelerini değiştirmez; yeni tahsilat oluşturmaz.</p>
                <button type="button" class="btn btn-outline" onclick="saveInvoicePaymentHistory(${f.id})">Ödeme Geçmişini Tamamla</button>
            </div>` : ''}
            ${payment.movements.length ? `<div style="margin-top:16px;"><strong>Bağlı Ödemeler</strong><div class="table-responsive"><table class="data-table"><thead><tr><th>Tarih</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${payment.movements.map(m => `<tr><td>${escapeHTML(m.tarih)}</td><td>${formatCurrency(m.tutar)}</td><td>${canEditCariMovement(m) ? `<button type="button" class="btn btn-outline" onclick="closeModal('modal-fatura-detail'); openEditCariMovement(${m.id})">Düzelt</button>` : ''} ${canReverseCariMovement(m) ? `<button type="button" class="btn btn-outline" onclick="closeModal('modal-fatura-detail'); reverseCariMovement(${m.id})">Geri Al</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
            <div class="modal-actions" style="display:flex; flex-wrap:wrap; gap:8px;">
                ${!payment.legacy && payment.remaining > 0 ? `<button type="button" class="btn btn-primary" onclick="openInvoicePayment(${f.id})">${f.tur === 'kesilen' ? 'Tahsilat Ekle' : 'Ödeme Ekle'}</button>` : ''}
                <button class="btn btn-primary" style="flex:1;" onclick="printInvoiceDocument(${f.id})">
                    <i class="fa-solid fa-print"></i> Yazdır
                </button>
                <button class="btn btn-danger" style="flex:1;" onclick="deleteFatura(${f.id})">
                    <i class="fa-solid fa-trash-can"></i> Sil
                </button>
            </div>
        </div>`;

    let modal = document.getElementById('modal-fatura-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-fatura-detail';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    openModal('modal-fatura-detail');
    modal.onclick = function(e) { if (e.target === modal) closeModal('modal-fatura-detail'); };
};

function getSelectedInvoiceModalOrder() {
    const orderId = document.getElementById('input-fatura-order')?.value || '';
    return orderId ? getDBArray('isEmirleri').find(order => order.id == orderId) : null;
}

window.populateInvoiceOrderOptions = function() {
    const tur = document.getElementById('input-fatura-tur')?.value || invoiceTabFilter;
    const firmaId = document.getElementById('input-fatura-firma')?.value || '';
    const orderSelect = document.getElementById('input-fatura-order');
    const helper = document.getElementById('fatura-order-helper');
    const cari = firmaId && firmaId !== 'internal' ? findCariByReference(firmaId) : null;
    const invoiceDateEl = document.getElementById('input-fatura-tarih');
    const dueDateEl = document.getElementById('input-fatura-vade');
    if (cari && invoiceDateEl?.value && dueDateEl) {
        const due = new Date(`${invoiceDateEl.value}T12:00:00`);
        due.setDate(due.getDate() + Math.max(0, Number(cari.vadeGun) || 0));
        dueDateEl.value = toDateInputValue(due);
    }
    if (!orderSelect) return;

    const previousValue = orderSelect.value;
    const orders = tur === 'kesilen' && firmaId && firmaId !== 'internal'
        ? getInvoiceableOrdersForCari(firmaId).filter(order =>
            !getDBArray('faturalar').some(invoice => invoice.orderId != null && invoice.orderId == order.id)
        )
        : [];

    orderSelect.innerHTML = '<option value="">Serbest fatura (iş emrine bağlı değil)</option>' +
        orders.map(order => {
            const description = plainText(order.description || order.aciklama || 'Teslim edilen iş');
            return `<option value="${escapeHTML(order.id)}">${escapeHTML(order.orderNo || 'İş emri')} - ${escapeHTML(description)} - ${escapeHTML(formatCurrency(order.total))}</option>`;
        }).join('');

    if (previousValue && orders.some(order => String(order.id) === String(previousValue))) {
        orderSelect.value = previousValue;
    }

    if (helper) {
        helper.textContent = firmaId && orders.length === 0
            ? 'Bu cari için faturalanmamış teslim edilmiş iş bulunmuyor. Serbest fatura yeni bir cari borç hareketi oluşturur.'
            : 'Serbest fatura yeni bir cari borç hareketi oluşturur.';
    }
    window.applyInvoiceOrderSelection();
};

window.applyInvoiceOrderSelection = function() {
    const linkedOrder = getSelectedInvoiceModalOrder();
    const amountEl = document.getElementById('input-fatura-tutar');
    const baseEl = document.getElementById('input-fatura-matrah');
    const rateEl = document.getElementById('input-fatura-kdv-orani');
    const descriptionEl = document.getElementById('input-fatura-aciklama');
    const helper = document.getElementById('fatura-order-helper');
    if (!amountEl) return;

    amountEl.readOnly = Boolean(linkedOrder);
    amountEl.classList.toggle('form-control-readonly', Boolean(linkedOrder));
    if (baseEl) {
        baseEl.readOnly = Boolean(linkedOrder);
        baseEl.classList.toggle('form-control-readonly', Boolean(linkedOrder));
    }

    if (linkedOrder) {
        const linkedTaxRate = linkedOrder.taxRate == null ? 20 : Math.max(0, Number(linkedOrder.taxRate) || 0);
        amountEl.value = roundMoney(linkedOrder.total);
        if (baseEl) baseEl.value = roundMoney(linkedOrder.subTotal ?? (linkedOrder.total / (1 + linkedTaxRate / 100)));
        if (rateEl) rateEl.value = linkedTaxRate;
        amountEl.dataset.invoiceOrderId = String(linkedOrder.id);
        if (descriptionEl) {
            const automaticDescription = plainText(linkedOrder.description || linkedOrder.aciklama || `${linkedOrder.orderNo} teslim edilen iş`);
            descriptionEl.value = automaticDescription;
            descriptionEl.dataset.invoiceOrderDescription = automaticDescription;
        }
        if (helper) {
            helper.textContent = linkedOrder.bakiyeCariyeYansitildi === true
                ? `${linkedOrder.orderNo}: Tutar iş emrinden geldi. Cari borç teslimatta işlendiği için tekrar eklenmeyecek.`
                : `${linkedOrder.orderNo}: Tutar iş emrinden geldi ve fatura ile cari hesaba işlenecek.`;
        }
    } else if (amountEl.dataset.invoiceOrderId) {
        amountEl.value = '';
        delete amountEl.dataset.invoiceOrderId;
        if (descriptionEl?.dataset.invoiceOrderDescription && descriptionEl.value === descriptionEl.dataset.invoiceOrderDescription) {
            descriptionEl.value = '';
        }
        if (descriptionEl) delete descriptionEl.dataset.invoiceOrderDescription;
    }
    updateInvoiceTaxPreview(linkedOrder ? 'matrah' : 'total');
};

window.updateInvoiceTaxPreview = function(source = 'matrah') {
    const baseEl = document.getElementById('input-fatura-matrah');
    const rateEl = document.getElementById('input-fatura-kdv-orani');
    const taxEl = document.getElementById('input-fatura-kdv-tutari');
    const totalEl = document.getElementById('input-fatura-tutar');
    if (!baseEl || !rateEl || !taxEl || !totalEl) return { matrah: 0, kdvOrani: 0, kdvTutari: 0, tutar: 0 };
    const rate = Math.max(0, Math.min(100, Number(rateEl.value) || 0));
    let base = Math.max(0, Number(baseEl.value) || 0);
    let total = Math.max(0, Number(totalEl.value) || 0);
    if (source === 'total' && total > 0) base = roundMoney(total / (1 + rate / 100));
    else total = roundMoney(base * (1 + rate / 100));
    const tax = roundMoney(total - base);
    baseEl.value = base ? roundMoney(base) : '';
    taxEl.value = tax ? tax : '0';
    totalEl.value = total ? total : '';
    return { matrah: roundMoney(base), kdvOrani: rate, kdvTutari: tax, tutar: roundMoney(total) };
};

window.updateInvoiceModalMode = function() {
    const tur = document.getElementById('input-fatura-tur')?.value || invoiceTabFilter;
    const orderContainer = document.getElementById('fatura-order-container');
    const flowNote = document.getElementById('fatura-flow-note');
    const amountEl = document.getElementById('input-fatura-tutar');
    const isOutgoing = tur === 'kesilen';

    if (orderContainer) orderContainer.style.display = isOutgoing ? 'block' : 'none';
    if (flowNote) flowNote.style.display = isOutgoing ? 'flex' : 'none';
    if (!isOutgoing && amountEl) {
        amountEl.readOnly = false;
        amountEl.classList.remove('form-control-readonly');
        const baseEl = document.getElementById('input-fatura-matrah');
        if (baseEl) { baseEl.readOnly = false; baseEl.classList.remove('form-control-readonly'); }
    }
    window.populateInvoiceOrderOptions();
};

window.openFaturaModal = function() {
    const turSelect = document.getElementById('input-fatura-tur');
    const turContainer = turSelect?.closest('.form-group');
    if (turSelect) {
        turSelect.value = invoiceTabFilter; // Aktif sekmeye göre otomatik ayarla
    }
    if (turContainer) {
        turContainer.style.display = 'none'; // Tür seçiciyi gizle
    }
    // Modal başlığını güncelle
    const title = document.querySelector('#modal-fatura h3');
    if (title) {
        title.textContent = invoiceTabFilter === 'kesilen' ? 'Yeni Kesilen Fatura Ekle' : 'Yeni Alınan Fatura Ekle';
    }
    const noEl = document.getElementById('input-fatura-no');
    if (noEl && !noEl.value) noEl.placeholder = previewSerialNo('fatura');
    const invoiceDate = document.getElementById('input-fatura-tarih');
    const dueDate = document.getElementById('input-fatura-vade');
    if (invoiceDate && !invoiceDate.value) invoiceDate.value = toDateInputValue(new Date());
    if (dueDate && !dueDate.value) dueDate.value = toDateInputValue(new Date());
    refreshDateInputDisplay();
    window.updateInvoiceModalMode();
    openModal('modal-fatura');
};

window.saveFatura = function() {
    const unlock = beginModalSubmit('modal-fatura');
    if (!unlock) return;
    try {
        const tur = document.getElementById('input-fatura-tur').value;
        const faturaNo = document.getElementById('input-fatura-no').value.trim() || generateSerialNo('fatura');
        const firmaSelect = document.getElementById('input-fatura-firma');
        const firmaId = firmaSelect.value;
        const firma = firmaSelect.options[firmaSelect.selectedIndex]?.text || '';
        const aciklama = document.getElementById('input-fatura-aciklama').value.trim();
        const linkedOrder = tur === 'kesilen' ? getSelectedInvoiceModalOrder() : null;
        const tax = updateInvoiceTaxPreview(linkedOrder ? 'matrah' : 'total');
        const tutar = linkedOrder ? roundMoney(linkedOrder.total) : tax.tutar;
        const faturaTarihiEl = document.getElementById('input-fatura-tarih');
        const faturaTarihiInput = faturaTarihiEl?.value || toDateInputValue(new Date());
        if (faturaTarihiEl && !faturaTarihiEl.value) faturaTarihiEl.value = faturaTarihiInput;
        const vadeTarihiInput = document.getElementById('input-fatura-vade')?.value || '';
        const odemeDurumu = 'odenmedi';
        const seriSira = plainText(document.getElementById('input-fatura-seri')?.value || '');
        const vergiNo = plainText(document.getElementById('input-fatura-vergi-no')?.value || '');
        const ek = getAttachmentFromInputs('input-fatura-ek', 'input-fatura-ek-not');

        if (!validateModalFields('modal-fatura', [
            { id: 'input-fatura-firma', test: value => !!value && value !== 'internal', message: 'Gerçek bir cari seçin.' },
            { id: 'input-fatura-tarih', test: value => !!value, message: 'Fatura tarihini seçin.' },
            { id: 'input-fatura-matrah', test: value => Number(value) > 0, message: 'Sıfırdan büyük matrah girin.' },
            { id: 'input-fatura-tutar', test: value => Number(value) > 0, message: 'Sıfırdan büyük genel toplam girin.' }
        ])) return;
        if (!firmaId) return;
        if (firmaId === 'internal') return alert('Fatura için gerçek bir cari seçin. Firma içi üretim faturalandırılamaz.');
        if (!Number.isFinite(tutar) || tutar <= 0) return alert('Geçerli bir tutar girin!');

        const cari = findCariByReference(firmaId, firma);
        if (!cari) return alert(`Cari bulunamadı: ${firma}\n\nFatura kaydedilmedi.`);
        if (hasDuplicateInvoiceNo(faturaNo, { tur, cariId: cari.id })) {
            setFieldError('input-fatura-no', 'Bu fatura numarası daha önce kullanılmış. Farklı bir numara girin.');
            document.getElementById('input-fatura-no')?.focus();
            return;
        }
        if (linkedOrder && linkedOrder.customerId != cari.id) return alert('Seçilen iş emri bu cariye ait değil.');
        if (linkedOrder && linkedOrder.durum !== 'Teslim Edildi') return alert('Sadece teslim edilmiş iş emirleri faturalanabilir.');
        if (linkedOrder && linkedOrder.faturaKesildi === true) return alert('Bu iş emrinin faturası daha önce kesilmiş.');
        if (linkedOrder && getDBArray('faturalar').some(invoice => invoice.orderId != null && invoice.orderId == linkedOrder.id)) {
            return alert('Bu iş emri için daha önce fatura kaydı oluşturulmuş.');
        }

        if (!db.faturalar) db.faturalar = [];
        const faturaId = createRecordId();
        const bakiyeDegisimi = tur === 'kesilen'
            ? (linkedOrder && linkedOrder.bakiyeCariyeYansitildi === true ? 0 : tutar)
            : -tutar;
        const fatura = {
            id: faturaId,
            tur: tur,
            faturaNo: faturaNo,
            cariId: cari.id,
            firma: cari.adi,
            aciklama: aciklama || (linkedOrder ? `${linkedOrder.orderNo} faturası` : ''),
            matrah: linkedOrder ? roundMoney(linkedOrder.subTotal ?? tax.matrah) : tax.matrah,
            kdvOrani: linkedOrder ? Number(linkedOrder.taxRate ?? tax.kdvOrani) : tax.kdvOrani,
            kdvTutari: linkedOrder ? roundMoney(linkedOrder.tax ?? (tutar - tax.matrah)) : tax.kdvTutari,
            tutar: tutar,
            tarih: toTRDateFromInput(faturaTarihiInput),
            faturaTarihi: toTRDateFromInput(faturaTarihiInput),
            vadeTarihi: vadeTarihiInput ? toTRDateFromInput(vadeTarihiInput) : '',
            odemeDurumu,
            paymentTrackingVersion: 1,
            discountAmount: linkedOrder?.discountAmount || 0,
            discountPercent: linkedOrder?.discountPercent ?? null,
            seriSira,
            vergiNo,
            cariYansitildi: true,
            cariBakiyeDegisimi: bakiyeDegisimi,
            orderId: linkedOrder?.id || null,
            orderNo: linkedOrder?.orderNo || '',
            ek,
            kaynak: linkedOrder ? 'is-emri-faturasi' : 'faturalar-modulu'
        };

        const hareket = addCariMovement(cari, {
            tip: tur === 'kesilen'
                ? `Kesilen Fatura (${faturaNo}${linkedOrder ? ` / ${linkedOrder.orderNo}` : ''})`
                : `Alınan Fatura (${faturaNo})`,
            aciklama: linkedOrder && bakiyeDegisimi === 0
                ? `${aciklama || `${linkedOrder.orderNo} faturası`}. Cari borç teslim aşamasında işlendiği için tekrar borç eklenmedi.`
                : (aciklama || (tur === 'kesilen' ? 'Kesilen fatura cari borca işlendi' : 'Alınan fatura cari borca işlendi')),
            faturaNo: faturaNo,
            faturaId: faturaId,
            tutar: tutar,
            bakiyeDegisimi: bakiyeDegisimi,
            orderId: linkedOrder?.id || null,
            orderNo: linkedOrder?.orderNo || '',
            isSuccess: false,
            isGelir: false,
            ek
        });
        fatura.cariIslemId = hareket?.id || null;
        db.faturalar.push(fatura);
        if (linkedOrder) {
            linkedOrder.faturaKesildi = true;
            linkedOrder.faturaNo = faturaNo;
            linkedOrder.faturaTarihi = fatura.faturaTarihi;
            if (bakiyeDegisimi !== 0) linkedOrder.bakiyeCariyeYansitildi = true;
        }
        addAuditLog('Oluşturuldu', 'Fatura', fatura.id, `${fatura.faturaNo} / ${fatura.firma} / ${formatCurrency(fatura.tutar)}`);
        scheduleAttachmentArchive(ek, 'Faturalar', cari.adi);

        saveDB();
        closeModal('modal-fatura');
        renderInvoices();

        // Formu temizle
        document.getElementById('input-fatura-no').value = '';
        document.getElementById('input-fatura-firma').value = '';
        document.getElementById('input-fatura-order').value = '';
        document.getElementById('input-fatura-aciklama').value = '';
        document.getElementById('input-fatura-matrah').value = '';
        document.getElementById('input-fatura-kdv-tutari').value = '';
        document.getElementById('input-fatura-tutar').value = '';
        document.getElementById('input-fatura-tutar').readOnly = false;
        document.getElementById('input-fatura-tutar').classList.remove('form-control-readonly');
        delete document.getElementById('input-fatura-tutar').dataset.invoiceOrderId;
        delete document.getElementById('input-fatura-aciklama').dataset.invoiceOrderDescription;
        document.getElementById('input-fatura-seri').value = '';
        document.getElementById('input-fatura-vergi-no').value = '';
        document.getElementById('input-fatura-odeme-durumu').value = 'odenmedi';
        resetAttachmentInputs('input-fatura-ek', 'input-fatura-ek-not');

        showImpactSummary('Fatura kaydedildi', [
            { label: 'Cari', value: bakiyeDegisimi }
        ], {
            message: bakiyeDegisimi === 0
                ? `${cari.adi}: Cari borç teslimatta işlendiği için bakiye değişmedi.`
                : `${cari.adi} yeni bakiye: ${formatCurrency(cari.bakiye)}`,
            actions: linkedOrder ? [{ label: `${linkedOrder.orderNo || 'İş emri'} bağlantıları`, onClick: () => openOrderHistory(linkedOrder.id) }] : []
        });
    } catch(e) {
        alert('Fatura kaydedilirken hata oluştu: ' + e.message);
    } finally {
        unlock();
    }
};

window.deleteFatura = function(id) {
    const fatura = (db.faturalar || []).find(f => f.id === id);
    if (!fatura) return alert('Fatura kaydı bulunamadı.');
    const payment = getInvoicePaymentSummary(fatura);
    if (payment.linkedPaid > 0 || Number(fatura.paymentOpeningAmount) > 0 || payment.legacy) return alert('Ödemesi bulunan fatura silinemez. Önce fatura detayından bağlı ödemeleri geri alın veya hatalı ödeme geçmişini düzeltin.');
    confirmAction('Bu fatura kaydı silinsin mi? Cari etkisi varsa ters kayıtla geri alınacak.', () => {
        if (!getDBArray('faturalar').includes(fatura)) return alert('Bu fatura daha önce kaldırıldı.');
        const currentPayment = getInvoicePaymentSummary(fatura);
        if (currentPayment.linkedPaid > 0 || Number(fatura.paymentOpeningAmount) > 0 || currentPayment.legacy) {
            return alert('Faturaya ödeme işlendiği için silme durduruldu. Önce bağlı ödemeleri kontrol edin.');
        }
        const originalBakiyeDegisimi = typeof fatura.cariBakiyeDegisimi === 'number'
            ? fatura.cariBakiyeDegisimi
            : (fatura.tur === 'kesilen' ? fatura.tutar : -fatura.tutar);

        if (fatura.cariYansitildi) {
            const cari = findCariByReference(fatura.cariId, fatura.firma);
            if (!cari) {
                alert(`Cari bulunamadı: ${fatura.firma}\n\nFatura silinmedi; çünkü cari bakiyesi geri alınamadı.`);
                return;
            }

            const originalMovement = getDBArray('islemler').find(item => String(item.id) === String(fatura.cariIslemId));
            if (originalMovement?.reversedBy) return alert('Faturanın cari etkisi daha önce geri alınmış. Hesap kontrolünden kaydı inceleyin.');
            const cancellation = addCariMovement(cari, {
                tip: `Fatura Silindi (${fatura.faturaNo})`,
                aciklama: originalBakiyeDegisimi === 0
                    ? 'Fatura kaydı iptal edildi. Satış teslim aşamasında cari hesaba işlendiği için bakiye değişmedi.'
                    : 'Fatura kaydı silindi, cari etkisi geri alındı.',
                faturaNo: fatura.faturaNo,
                faturaId: fatura.id,
                reversalOf: originalMovement?.id || null,
                orderId: fatura.orderId || null,
                orderNo: fatura.orderNo || '',
                tutar: fatura.tutar,
                bakiyeDegisimi: -originalBakiyeDegisimi,
                isSuccess: false,
                isGelir: false
            });
            if (originalMovement && cancellation) originalMovement.reversedBy = cancellation.id;
        }

        if (fatura.orderId) {
            const order = getDBArray('isEmirleri').find(o => o.id == fatura.orderId);
            if (order) {
                order.faturaKesildi = false;
                order.faturaNo = '';
                order.faturaTarihi = '';
                // The invoice carried the order's receivable; reversing it returns the order to "not reflected".
                if (fatura.cariYansitildi && roundMoney(originalBakiyeDegisimi) !== 0) order.bakiyeCariyeYansitildi = false;
            }
        }

        addAuditLog('Silindi', 'Fatura', fatura.id, `${fatura.faturaNo} / ${fatura.firma} / ${formatCurrency(fatura.tutar)}`);
        db.faturalar = (db.faturalar || []).filter(f => f.id !== id);
        saveDB();
        renderInvoices();
        closeModal('modal-fatura-detail');
        showImpactSummary('Fatura silindi', [{ label: 'Cari', value: -originalBakiyeDegisimi }], {
            message: originalBakiyeDegisimi === 0 ? 'Fatura kaldırıldı; cari bakiye teslimatta işlendiği için değişmedi.' : 'Faturanın cari etkisi ters kayıtla düzeltildi.'
        });
    }, { title: 'Fatura Kaydını Sil', confirmLabel: 'Faturayı Sil' });
};

async function renderAppVersion() {
    const versionElement = document.getElementById('app-version');
    if (!versionElement || !window.electronAPI?.getAppVersion) return;

    try {
        const response = await window.electronAPI.getAppVersion();
        if (response?.success && typeof response.version === 'string' && response.version.trim()) {
            versionElement.textContent = `v${response.version.trim()}`;
        }
    } catch (error) {
        console.warn('Sürüm bilgisi okunamadı:', error);
    }
}

const UPDATE_CHECK_LAST_KEY = 'ak_lazer_update_last_check';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let latestUpdateInfo = null;

function getVisibleAppVersion() {
    return plainText(document.getElementById('app-version')?.textContent || 'v1.3.37').replace(/^v/i, '') || '1.3.37';
}

function setUpdateStatus(state, title, message, options = {}) {
    const card = document.getElementById('update-status-card');
    const icon = document.getElementById('update-status-icon');
    const titleElement = document.getElementById('update-status-title');
    const copyElement = document.getElementById('update-status-copy');
    const currentElement = document.getElementById('update-current-version');
    const latestElement = document.getElementById('update-latest-version');
    const openButton = document.getElementById('btn-open-update');
    const icons = {
        checking: 'fa-spinner fa-spin',
        available: 'fa-circle-arrow-up',
        current: 'fa-circle-check',
        error: 'fa-triangle-exclamation',
        idle: 'fa-circle-info'
    };
    if (card) card.dataset.state = state;
    if (icon) icon.innerHTML = `<i class="fa-solid ${icons[state] || icons.idle}" aria-hidden="true"></i>`;
    if (titleElement) titleElement.textContent = title;
    if (copyElement) copyElement.textContent = message;
    if (currentElement) currentElement.textContent = `v${options.currentVersion || getVisibleAppVersion()}`;
    if (latestElement) {
        latestElement.hidden = !options.latestVersion;
        latestElement.textContent = options.latestVersion ? `Son sürüm v${options.latestVersion}` : '';
    }
    if (openButton) openButton.hidden = !(state === 'available' && options.downloadUrl);
}

function renderUpdateState() {
    if (latestUpdateInfo?.hasUpdate) {
        setUpdateStatus('available', 'Yeni sürüm hazır', latestUpdateInfo.notes || `v${latestUpdateInfo.latestVersion} kurulabilir.`, latestUpdateInfo);
        return;
    }
    setUpdateStatus('idle', 'Sürüm kontrolü hazır', 'Kontrol başlatıldığında yalnızca AK LAZER sürüm adresine bağlanılır.', {
        currentVersion: getVisibleAppVersion()
    });
}

window.checkForUpdates = async function(options = {}) {
    const manual = !!options.manual;
    const button = document.getElementById('btn-check-update');
    if (!window.electronAPI?.checkForUpdates) {
        if (manual) showToast({ type: 'warning', title: 'Sürüm kontrolü kullanılamıyor', message: 'Bu özellik yalnızca kurulu masaüstü uygulamasında çalışır.' });
        return { success: false, unsupported: true };
    }

    if (button) button.disabled = true;
    setUpdateStatus('checking', 'Sürüm kontrol ediliyor', 'AK LAZER sürüm bilgisi doğrulanıyor...', { currentVersion: getVisibleAppVersion() });
    try {
        const response = await window.electronAPI.checkForUpdates();
        try { localStorage.setItem(UPDATE_CHECK_LAST_KEY, String(Date.now())); } catch (_) {}
        if (!response?.success) {
            latestUpdateInfo = null;
            setUpdateStatus('error', 'Sürüm bilgisine ulaşılamadı', response?.error || 'İnternet bağlantısını kontrol edip tekrar deneyin.', {
                currentVersion: response?.currentVersion || getVisibleAppVersion()
            });
            if (manual) showToast({ type: 'warning', title: 'Güncelleme kontrol edilemedi', message: response?.error || 'Bağlantıyı kontrol edip tekrar deneyin.' });
            return response;
        }

        latestUpdateInfo = response.hasUpdate ? response : null;
        if (response.hasUpdate) {
            const releaseText = response.releaseDate ? `Yayın: ${response.releaseDate}. ` : '';
            setUpdateStatus('available', 'Yeni sürüm hazır', `${releaseText}${response.notes || 'Yeni kurulum yayımlandı.'}`, response);
            const noticeKey = `ak_lazer_update_notice_${response.latestVersion}`;
            let alreadyShown = false;
            try { alreadyShown = localStorage.getItem(noticeKey) === '1'; } catch (_) {}
            if (manual || !alreadyShown) {
                showToast({ type: 'info', title: `v${response.latestVersion} hazır`, message: 'Ayarlar > Sürüm Kontrolü bölümünden kurulum sayfasını açabilirsiniz.', duration: 8000 });
                try { localStorage.setItem(noticeKey, '1'); } catch (_) {}
            }
        } else {
            setUpdateStatus('current', 'Uygulama güncel', `Kullanılan v${response.currentVersion} sürümü yayımlanan son sürümdür.`, response);
            if (manual) showToast({ type: 'success', title: 'Uygulama güncel', message: `v${response.currentVersion} son sürüm.` });
        }
        return response;
    } catch (error) {
        latestUpdateInfo = null;
        setUpdateStatus('error', 'Sürüm kontrolü tamamlanamadı', error?.message || 'Beklenmeyen bir hata oluştu.', { currentVersion: getVisibleAppVersion() });
        if (manual) showToast({ type: 'error', title: 'Güncelleme kontrolü başarısız', message: error?.message || 'Tekrar deneyin.' });
        return { success: false, error: error?.message || String(error) };
    } finally {
        if (button) button.disabled = false;
    }
};

window.openUpdateDownload = async function() {
    const downloadUrl = latestUpdateInfo?.downloadUrl;
    if (!downloadUrl || !window.electronAPI?.openUpdatePage) {
        return showToast({ type: 'warning', title: 'Kurulum adresi bulunamadı', message: 'Sürüm kontrolünü yeniden çalıştırın.' });
    }
    const response = await window.electronAPI.openUpdatePage(downloadUrl);
    if (!response?.success) showToast({ type: 'error', title: 'Sayfa açılamadı', message: response?.error || 'Kurulum adresi doğrulanamadı.' });
};

function scheduleAutomaticUpdateCheck() {
    if (!window.electronAPI?.checkForUpdates) return;
    let lastCheck = 0;
    try { lastCheck = Number(localStorage.getItem(UPDATE_CHECK_LAST_KEY) || 0); } catch (_) {}
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    setTimeout(() => checkForUpdates({ manual: false }), 2500);
}

function enhanceCloseButtons() {
    document.querySelectorAll('.btn-close').forEach(button => {
        if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Pencereyi kapat');
        if (!button.hasAttribute('title')) button.setAttribute('title', button.getAttribute('aria-label'));
        if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
        button.querySelector('i')?.setAttribute('aria-hidden', 'true');
    });
}

function lockStartupWorkspace() {
    const previousInert = [...document.body.children].map(element => [element, element.inert]);
    previousInert.forEach(([element]) => { element.inert = true; });
    const status = document.createElement('div');
    status.className = 'startup-status';
    status.setAttribute('role', 'status');
    status.innerHTML = '<strong>Kayıtlar yükleniyor</strong><span>Program birazdan hazır olacak.</span>';
    document.body.appendChild(status);
    document.body.setAttribute('aria-busy', 'true');
    const blockInput = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const events = ['click', 'keydown', 'submit'];
    events.forEach(name => document.addEventListener(name, blockInput, true));
    return () => {
        events.forEach(name => document.removeEventListener(name, blockInput, true));
        previousInert.forEach(([element, inert]) => { element.inert = !!inert; });
        status.remove();
        document.body.removeAttribute('aria-busy');
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    const releaseStartup = startupHydrationPending ? lockStartupWorkspace() : () => {};
    try {
        addLog("Uygulama başlatıldı.");
        initializeWorkspace();
        enhanceCloseButtons();
        enhanceFilterPanels();
        enhanceQuoteSections();
        enhanceInnerPageActions();
        enhanceContentPageLayouts();
        await renderAppVersion();
        await hydrateDBFromFileIfNeeded();
        const hash = window.location.hash.substring(1) || 'dashboard';
        switchView(hash);
        scheduleAutomaticUpdateCheck();
        refreshBackupStatus();
    } catch (e) {
        console.error("Initialization Error:", e);
    } finally {
        releaseStartup();
    }
});
window.createManualBackup = async function() {
    if (window.electronAPI && window.electronAPI.manualBackup) {
        let data;
        try {
            const normalized = validateAndNormalizeDB(db);
        db.ayarlar.numaralandirma = normalized.ayarlar.numaralandirma;
        data = JSON.stringify(normalized);
        } catch (error) {
            return alert(`Yedeklenecek veri doğrulanamadı: ${error?.message || String(error)}`);
        }
        
        let response;
        try { response = await window.electronAPI.manualBackup(data); }
        catch (error) { response = { success: false, error: error?.message || 'Yedekleme tamamlanamadı.' }; }
        if (!response?.canceled) applyBackupStatus(response?.backupStatus || (response?.success
            ? { success: true, lastSuccessAt: new Date().toISOString(), kind: 'manual', available: true }
            : { ...backupStatusView, success: false, error: response?.error || 'Yedekleme tamamlanamadı.' }));
        if (response && response.success) {
            alert(`Yedek dosyası başarıyla kaydedildi:\n${response.path}`);
        } else if (response && !response.canceled) {
            alert("Yedekleme sırasında hata oluştu: " + response.error);
        }
    } else {
        alert("Bu özellik sadece masaüstü uygulamasında çalışır.");
    }
}

window.restoreBackupFile = async function() {
    if (window.electronAPI && window.electronAPI.restoreBackup) {
        const confirm1 = await askConfirmation("Geri yükleme işlemi çalışan verilerin yerine seçtiğiniz yedeği koyacaktır. Devam etmek istiyor musunuz?", {
            title: 'Yedekten Geri Yükle',
            confirmLabel: 'Devam Et'
        });
        if (!confirm1) return;

        const confirm2 = await askConfirmation("Son onay: Sistem önce mevcut verilerin güvenlik yedeğini alacak, ardından seçtiğiniz yedeği yükleyecek.", {
            title: 'Geri Yüklemeyi Onaylayın',
            confirmLabel: 'Yedeği Yükle'
        });
        if (!confirm2) return;

        let currentData = '';
        try {
            currentData = JSON.stringify(validateAndNormalizeDB(db));
        } catch (error) {
            return alert(`Mevcut veri doğrulanamadı. Geri yükleme güvenlik amacıyla durduruldu.\n\n${error?.message || String(error)}`);
        }
        if (currentData) {
            const backupResult = await createSafetyBackup(currentData);
            if (!backupResult.success) {
                return alert('Geri yükleme öncesi güvenlik yedeği alınamadı. Mevcut verileri korumak için işlem iptal edildi.');
            }
        }

        const response = await window.electronAPI.restoreBackup();
        if (response && response.success && response.data) {
            try {
                const parsedData = validateAndNormalizeDB(response.data, true);
                const saveResult = await replaceDatabaseSafely(parsedData);
                if (!saveResult.success) return alert(`Yedek doğrulandı ancak kalıcı dosyaya yazılamadı. Mevcut veriler değiştirilmedi.\n\n${saveResult.error || ''}`);
                alert("Veriler başarıyla geri yüklendi! Sistem yeniden başlatılıyor.");
                location.reload();
            } catch (e) {
                alert("Geçersiz yedek dosyası! İşlem iptal edildi.\nHata: " + e.message);
            }
        } else if (response && !response.canceled) {
            alert("Geri yükleme hatası: " + response.error);
        }
    } else {
        alert("Bu özellik sadece masaüstü uygulamasında çalışır.");
    }
}

window.confirmSafeReset = async function() {
    const inputVal = document.getElementById('input-safe-reset').value;
    if (inputVal === 'SIFIRLA') {
        let currentData = '';
        try {
            currentData = JSON.stringify(validateAndNormalizeDB(db));
        } catch (error) {
            return alert(`Mevcut veri doğrulanamadı. Sıfırlama güvenlik amacıyla durduruldu.\n\n${error?.message || String(error)}`);
        }
        if (currentData) {
            const backupResult = await createSafetyBackup(currentData);
            if (!backupResult.success) return alert('Sıfırlama öncesi yedek alınamadı. Güvenlik için sıfırlama iptal edildi.');
        }
        const freshDB = createEmptyDatabase();
        freshDB.denetimKayitlari.push(createAuditLogRecord('Sıfırlandı', 'Veritabanı', 'all', 'Kullanıcı onayıyla tüm işletme kayıtları temizlendi.'));
        const saveResult = await replaceDatabaseSafely(freshDB);
        if (!saveResult.success) return alert(`Yeni boş veritabanı kalıcı dosyaya yazılamadı. Mevcut veriler değiştirilmedi.\n\n${saveResult.error || ''}`);
        alert("Tüm veriler sıfırlandı. Uygulama yeniden başlatılıyor.");
        location.reload();
    }
}

// Workspace preferences are separate from accounting records and backups.
const WORKSPACE_PREFERENCES_KEY = 'AkLazerWorkspacePreferences';
let workspacePreferencesCache;
function readWorkspacePreferences() {
    if (workspacePreferencesCache) return workspacePreferencesCache;
    try {
        const value = JSON.parse(localStorage.getItem(WORKSPACE_PREFERENCES_KEY) || '{}');
        return workspacePreferencesCache = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return workspacePreferencesCache = {}; }
}
function saveWorkspacePreferences(changes) {
    workspacePreferencesCache = { ...readWorkspacePreferences(), ...changes };
    try { localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(workspacePreferencesCache)); } catch (_) {}
}
function applyWorkspacePreferences() {
    const preferences = readWorkspacePreferences();
    const dark = preferences.theme === 'dark';
    const compact = preferences.density === 'compact';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
    const themeButton = document.getElementById('workspace-theme');
    const themeLabel = dark ? 'Açık görünüme geç' : 'Koyu görünüme geç';
    if (themeButton) {
        themeButton.setAttribute('aria-label', themeLabel);
        themeButton.title = themeLabel;
        themeButton.innerHTML = `<i class="fa-solid ${dark ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>`;
    }
    const densityButton = document.getElementById('workspace-density');
    if (densityButton) {
        densityButton.setAttribute('aria-pressed', String(compact));
        densityButton.setAttribute('aria-label', compact ? 'Tablo satırları sık; rahat görünüme geç' : 'Tablo satırları rahat; sık görünüme geç');
        densityButton.querySelector('span').textContent = compact ? 'Sık' : 'Rahat';
    }
}
window.toggleWorkspaceTheme = function() {
    saveWorkspacePreferences({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
    applyWorkspacePreferences();
    if (document.getElementById('view-dashboard')?.classList.contains('active')) renderDashboard();
};
window.toggleWorkspaceDensity = function() {
    saveWorkspacePreferences({ density: document.documentElement.dataset.density === 'compact' ? 'comfortable' : 'compact' });
    applyWorkspacePreferences();
};
window.toggleWorkspaceMenu = function(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('workspace-menu-open');
    document.body.classList.toggle('workspace-menu-open', open);
    const main = document.getElementById('main-content');
    if (main) main.inert = open;
    const trigger = document.getElementById('sidebar-mobile-toggle');
    trigger?.setAttribute('aria-expanded', String(open));
    trigger?.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    const backdrop = document.querySelector('.workspace-menu-backdrop');
    if (backdrop) backdrop.hidden = !open;
    if (open) document.querySelector('.sidebar .nav-item.active')?.focus();
    else if (document.activeElement?.closest('.sidebar')) trigger?.focus();
};

let workspaceSearchResults = [];
function getWorkspaceSearchItems(query) {
    const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const matches = item => terms.every(term => normalize(`${item.title} ${item.detail} ${item.kind}`).includes(term));
    const items = [
        { title: 'Yeni teklif oluştur', detail: 'Müşteri, malzeme ve fiyatlandırma', kind: 'İşlem', icon: 'fa-plus', run: () => navigateTo('quotation') },
        { title: 'Yeni cari ekle', detail: 'Müşteri veya tedarikçi kartı', kind: 'İşlem', icon: 'fa-user-plus', run: () => navigateToLinkedModule('accounts', () => openModal('modal-cari')) },
        { title: 'Yeni gider ekle', detail: 'İşletme gideri ve ödeme kaynağı', kind: 'İşlem', icon: 'fa-receipt', run: () => navigateToLinkedModule('expenses', () => openGiderModal()) },
        { title: 'Yeni fatura ekle', detail: 'Kesilen veya alınan fatura', kind: 'İşlem', icon: 'fa-file-circle-plus', run: () => navigateToLinkedModule('invoices', () => openFaturaModal()) },
        { title: 'Ayarlar ve yedekleme', detail: 'Firma bilgileri, yedekler ve sürüm', kind: 'Menü', icon: 'fa-gear', run: () => openAyarlarModal() },
        { title: 'Gösterge Paneli', detail: 'İşletme özeti ve öncelikler', kind: 'Menü', icon: 'fa-chart-pie', run: () => navigateTo('dashboard') },
        ...Object.entries(INNER_PAGE_LAYOUTS).map(([page, meta]) => ({ title: meta.title, detail: `${meta.category} · ${meta.context}`, kind: 'Menü', icon: meta.icon, run: () => navigateTo(page) }))
    ];
    if (terms.join('').length >= 2) {
        const sources = [
            ['cariler', 'Cari', 'fa-building', c => ({ title: c.adi || 'İsimsiz cari', detail: `${codeSearchText(c)} · ${c.tel || c.telefon || 'Cari hesap'}`, run: () => navigateToLinkedModule('accounts', () => openCariDetay(c.id)) })],
            ['isEmirleri', 'İş emri', 'fa-clipboard-list', o => ({ title: o.orderNo || 'İş emri', detail: `${o.customerName || ''} · ${o.description || ''} · ${o.durum || ''}`, run: () => navigateToLinkedModule('orders', () => openOrderHistory(o.id)) })],
            ['faturalar', 'Fatura', 'fa-file-invoice', f => ({ title: f.faturaNo || 'Fatura', detail: `${f.firma || ''} · ${f.aciklama || ''}`, run: () => navigateToLinkedModule('invoices', () => showFaturaDetail(f.id)) })],
            ['stoklar', 'Stok', 'fa-boxes-stacked', s => ({ title: s.cinsi || s.kodu || 'Stok', detail: `${getStockDisplayCode(s)} · ${getCodeAliases(s).join(' / ')} · ${s.mm || 0} mm`, run: () => navigateToLinkedModule('inventory', () => openStokDuzenleModal(s.id)) })]
        ];
        // Limit each source while scanning, so large databases never build thousands of result nodes.
        for (const [key, kind, icon, map] of sources) {
            let count = 0;
            for (const record of getDBArray(key)) {
                const item = { ...map(record), kind, icon };
                if (!matches(item)) continue;
                items.push(item);
                if (++count === 12) break;
            }
        }
    }
    return items.filter(matches).slice(0, 30);
}
window.renderWorkspaceSearch = function() {
    const query = document.getElementById('workspace-search-input')?.value || '';
    workspaceSearchResults = getWorkspaceSearchItems(query);
    const results = document.getElementById('workspace-search-results');
    const count = document.getElementById('workspace-search-count');
    if (!results || !count) return;
    count.textContent = query.trim().length < 2
        ? 'Hızlı işlemler ve menüler · Kayıt aramak için en az 2 karakter yazın.'
        : `${workspaceSearchResults.length} sonuç${workspaceSearchResults.length === 30 ? ' · Daha kesin sonuç için aramayı daraltın.' : ''}`;
    results.innerHTML = workspaceSearchResults.length ? workspaceSearchResults.map((item, index) => `
        <button type="button" class="workspace-search-result" data-workspace-result="${index}">
            <i class="fa-solid ${item.icon}" aria-hidden="true"></i><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></span><em>${escapeHTML(item.kind)}</em>
        </button>`).join('') : '<p class="workspace-search-empty">Eşleşen kayıt bulunamadı. İsim veya belge numarasının bir bölümünü deneyin.</p>';
};
window.openWorkspaceSearch = function() {
    // A form in progress keeps its own focus and cannot be replaced by navigation.
    if (document.querySelector('.modal-overlay.active')) return;
    document.getElementById('workspace-search-input').value = '';
    renderWorkspaceSearch();
    toggleWorkspaceMenu(false);
    openModal('modal-workspace-search');
};
function initializeWorkspace() {
    applyWorkspacePreferences();
    const preferences = readWorkspacePreferences();
    document.querySelectorAll('.nav-group').forEach(group => {
        const name = group.dataset.navGroup;
        const saved = preferences.navGroups?.[name];
        setNavGroupState(group, typeof saved === 'boolean' ? saved : ['operations', 'finance'].includes(name));
    });
    document.querySelector('.sidebar')?.addEventListener('click', event => {
        if (event.target.closest('.nav-item, .sidebar-create')) toggleWorkspaceMenu(false);
    });
    window.matchMedia?.('(max-width: 760px)').addEventListener?.('change', event => {
        if (!event.matches) toggleWorkspaceMenu(false);
    });
    document.getElementById('workspace-search-results')?.addEventListener('click', event => {
        const button = event.target.closest('[data-workspace-result]');
        if (!button) return;
        const item = workspaceSearchResults[Number(button.dataset.workspaceResult)];
        if (!item) return;
        closeModal('modal-workspace-search');
        item.run();
    });
    document.getElementById('modal-workspace-search')?.addEventListener('keydown', event => {
        if (event.isComposing) return;
        const buttons = [...document.querySelectorAll('.workspace-search-result')];
        const index = buttons.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!buttons.length) return;
            const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].focus();
        } else if (event.key === 'Enter' && event.target.id === 'workspace-search-input') {
            event.preventDefault();
            buttons[0]?.click();
        }
    });
    document.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            openWorkspaceSearch();
        }
        if (event.key === 'Escape' && document.body.classList.contains('workspace-menu-open')) toggleWorkspaceMenu(false);
        if (event.key === 'Tab' && document.body.classList.contains('workspace-menu-open') && !document.querySelector('.modal-overlay.active')) {
            const elements = getModalFocusables(document.getElementById('workspace-sidebar'));
            if (!elements.length) return;
            if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1).focus(); }
            else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus(); }
        }
    });
}

// Read-only finance follow-up. These views never allocate payments or repair records.
let collectionsPage = 1;
let accountCheckLimit = 50;
let activePaymentOverviewCariId = null;
let currentAccountCheckFindings = [];
let backupStatusView = null;
let backupStatusRevision = 0;

function normalizeSearchText(value) {
    return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim();
}

function financeDay(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/) || text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s|$)/);
    if (!match) return null;
    const iso = text.includes('-');
    const [year, month, day] = iso ? [+match[1], +match[2], +match[3]] : [+match[3], +match[2], +match[1]];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.getTime() / 86400000;
}

function financeCariFor(record, database = db) {
    if (record.cariId != null) return (database.cariler || []).find(c => String(c.id) === String(record.cariId)) || null;
    const matches = (database.cariler || []).filter(c => normalizeLookupText(c.adi) === normalizeLookupText(record.firma));
    return matches.length === 1 ? matches[0] : null;
}

function getCollectionRows(database = db, now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
    return (database.faturalar || []).filter(invoice => invoice.tur === 'kesilen').map(invoice => {
        const payment = getInvoicePaymentSummary(invoice, '', database);
        const due = financeDay(invoice.vadeTarihi);
        const days = due === null ? null : today - due;
        const status = payment.remaining === null ? 'unknown' : days === null ? 'undated' : days > 0 ? 'overdue' : days === 0 ? 'today' : days >= -7 ? 'soon' : 'future';
        return { invoice, payment, cari: financeCariFor(invoice, database), due, days, status };
    }).filter(row => row.payment.remaining === null || row.payment.remaining > 0);
}

function collectionStatusLabel(row) {
    return ({ unknown: 'Ödeme geçmişi eksik', undated: 'Vade belirtilmedi', overdue: `${row.days} gün gecikti`, today: 'Bugün vadeli', soon: `${-row.days} gün sonra`, future: `${-row.days} gün sonra` })[row.status];
}

function financeSummaryCard(label, value, detail = '') {
    return `<div class="finance-summary-card"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(detail)}</small></div>`;
}

function filterCollections() { collectionsPage = 1; renderCollections(); }
function changeCollectionsPage(delta) { collectionsPage += delta; renderCollections(); }
function openCollectionsForCari(id) {
    const cari = getDBArray('cariler').find(c => String(c.id) === String(id));
    if (!cari) return;
    closeModal('modal-cari-ekstre');
    renderCollections();
    document.getElementById('collections-cari').value = String(cari.id);
    document.getElementById('collections-search').value = '';
    document.getElementById('collections-status').value = 'all';
    location.hash = 'collections'; switchView('collections'); filterCollections();
}

function renderCollections() {
    const tbody = document.getElementById('collections-tbody');
    if (!tbody) return;
    const all = getCollectionRows();
    const cariSelect = document.getElementById('collections-cari');
    const selectedCariId = cariSelect.value;
    cariSelect.innerHTML = '<option value="">Tüm müşteriler</option>' + [...getDBArray('cariler')].sort((a,b) => String(a.adi).localeCompare(String(b.adi),'tr')).map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.adi)} · ${escapeHTML(c.kodu || '')}</option>`).join('');
    cariSelect.value = selectedCariId;
    const total = rows => formatCurrency(roundMoney(rows.reduce((sum, r) => sum + (r.payment.remaining ?? 0), 0)));
    const unknown = all.filter(r => r.status === 'unknown').length;
    document.getElementById('collections-summary').innerHTML =
        financeSummaryCard('Açık fatura tutarı', total(all), `${all.length} fatura · ${unknown ? `${unknown} faturanın kalan tutarı bilinmiyor` : 'Tüm açık faturalar'}`) +
        financeSummaryCard('Geciken tutar', total(all.filter(r => r.status === 'overdue')), `${all.filter(r => r.status === 'overdue').length} fatura`) +
        financeSummaryCard('Bugün vadeli', total(all.filter(r => r.status === 'today')), `${all.filter(r => r.status === 'today').length} fatura`) +
        financeSummaryCard('Önümüzdeki 7 gün', total(all.filter(r => r.status === 'soon')), `${all.filter(r => r.status === 'soon').length} fatura`);
    const query = normalizeSearchText(document.getElementById('collections-search').value);
    const filter = document.getElementById('collections-status').value;
    const sort = document.getElementById('collections-sort').value;
    const rows = all.filter(r => (!cariSelect.value || String(r.cari?.id) === cariSelect.value) && (filter === 'all' || r.status === filter) && (!query || normalizeSearchText(`${r.cari?.adi || r.invoice.firma} ${r.cari?.kodu || ''} ${r.invoice.faturaNo}`).includes(query)));
    rows.sort((a, b) => {
        if (sort === 'customer') return String(a.cari?.adi || a.invoice.firma).localeCompare(String(b.cari?.adi || b.invoice.firma), 'tr') || (a.due ?? Infinity) - (b.due ?? Infinity);
        if (sort === 'amount') return (b.payment.remaining ?? -1) - (a.payment.remaining ?? -1);
        return (a.due ?? Infinity) - (b.due ?? Infinity) || String(a.invoice.faturaNo).localeCompare(String(b.invoice.faturaNo), 'tr');
    });
    const pages = Math.max(1, Math.ceil(rows.length / 25));
    collectionsPage = Math.max(1, Math.min(pages, collectionsPage));
    tbody.innerHTML = rows.slice((collectionsPage - 1) * 25, collectionsPage * 25).map(row => {
        const id = escapeJSStringForAttr(row.invoice.id);
        return `<tr><td><strong>${escapeHTML(row.cari?.adi || row.invoice.firma || 'Cari bulunamadı')}</strong><small>${escapeHTML(row.invoice.faturaNo || 'Fatura numarası yok')}${row.cari?.kodu ? ' · ' + escapeHTML(row.cari.kodu) : ''}</small></td>
            <td>${escapeHTML(row.invoice.vadeTarihi || '—')}</td><td><span class="finance-status ${row.status}">${escapeHTML(collectionStatusLabel(row))}</span></td>
            <td>${row.payment.remaining === null ? 'Bilinmiyor' : formatCurrency(row.payment.remaining)}</td><td><div class="finance-row-actions">
            <button type="button" class="btn btn-outline" onclick="showFaturaDetail(${id})">Fatura</button>
            ${row.payment.legacy ? `<button type="button" class="btn btn-outline" onclick="showFaturaDetail(${id})">Geçmişi Tamamla</button>` : `<button type="button" class="btn btn-primary" onclick="openInvoicePayment(${id})"${row.cari ? '' : ' disabled'}>Tahsilat</button>`}
            ${row.payment.remaining !== null && row.cari ? `<button type="button" class="btn btn-outline" onclick="openCollectionReminder(${id})" aria-label="${escapeHTML(row.invoice.faturaNo)} için hatırlatma hazırla"><i class="fa-solid fa-comment" aria-hidden="true"></i> Hatırlat</button>` : ''}
            </div></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="finance-empty"><strong>Bu görünümde açık fatura yok.</strong>Farklı bir vade durumu veya arama deneyebilirsiniz.</td></tr>';
    document.getElementById('collections-page-info').textContent = `${rows.length} fatura · Sayfa ${collectionsPage} / ${pages}`;
    document.getElementById('collections-prev').disabled = collectionsPage === 1;
    document.getElementById('collections-next').disabled = collectionsPage === pages;
}

function openCollectionReminder(id) {
    const row = getCollectionRows().find(r => String(r.invoice.id) === String(id));
    if (!row || row.payment.remaining === null || !row.cari) return alert('Hatırlatma için cari ve kalan fatura tutarı belirli olmalıdır.');
    const company = db.ayarlar?.firmaAdi || 'AK LAZER';
    const due = row.due !== null ? ` Vade tarihi: ${row.invoice.vadeTarihi}.` : '';
    document.getElementById('collection-reminder-text').value = `Merhaba ${row.cari.adi},\n\n${row.invoice.faturaNo || 'Faturanız'} için kayıtlarımızdaki kalan tutar ${formatCurrency(row.payment.remaining)}.${due}\nÖdeme planınız hakkında bilgi paylaşabilir misiniz? Ödemenizi yaptıysanız dekontunuzu iletmenizi rica ederiz.\n\nZİRAAT BANKASI · MERT ODUNKESEN\nIBAN: TR04 0001 0090 1065 8664 4050 01\n\nTeşekkür ederiz.\n${company}`;
    openModal('modal-collection-reminder');
}

async function copyCollectionReminder() {
    const field = document.getElementById('collection-reminder-text');
    try {
        await navigator.clipboard.writeText(field.value);
        showToast({ type: 'success', title: 'Metin kopyalandı', message: 'Mesajı kontrol ederek istediğiniz uygulamadan gönderebilirsiniz.' });
    } catch (_) {
        field.focus(); field.select();
        showToast({ type: 'info', title: 'Metin seçildi', message: 'Kopyalamak için Ctrl+C veya ⌘C kullanın.' });
    }
}

function renderCariPaymentOverview(id = activePaymentOverviewCariId) {
    const container = document.getElementById('cari-payment-overview');
    const cari = getDBArray('cariler').find(c => String(c.id) === String(id));
    if (!container || !cari) return;
    activePaymentOverviewCariId = cari.id;
    const rows = getCollectionRows().filter(row => row.cari && String(row.cari.id) === String(id));
    const unknown = rows.filter(row => row.payment.remaining === null).length;
    const total = roundMoney(rows.reduce((sum, row) => sum + (row.payment.remaining ?? 0), 0));
    const overdue = roundMoney(rows.filter(row => row.status === 'overdue').reduce((sum, row) => sum + row.payment.remaining, 0));
    const payments = getDBArray('islemler').filter(m => !m.reversedBy && !m.reversalOf && financeCariFor(m)?.id === cari.id && getCariMovementFormType(m) === 'tahsilat');
    payments.sort((a,b) => (parseTRDate(b.tarih).getTime() || 0) - (parseTRDate(a.tarih).getTime() || 0));
    const last = payments[0];
    container.innerHTML = '<div class="finance-summary-grid">' +
        financeSummaryCard('Açık faturalar', formatCurrency(total), `${rows.length} fatura${unknown ? ` · ${unknown} tutar bilinmiyor` : ''}`) +
        financeSummaryCard('Geciken fatura tutarı', formatCurrency(overdue), 'Kalan tutarı bilinen faturalar') +
        financeSummaryCard('Son tahsilat', last ? formatCurrency(last.tutar) : 'Henüz yok', last?.tarih || 'Aktif tahsilat kaydı bulunmuyor') +
        `</div><button type="button" class="btn btn-outline" onclick="openCollectionsForCari(${escapeJSStringForAttr(cari.id)})">Açık Faturaları Gör</button>`;
}

function buildStockCheckFindings(database=db) {
    const findings=[],stocks=database.stoklar||[],movements=database.stokHareketleri||[];
    const add=(stock,detail,severity='error')=>findings.push({severity,category:'Stok',title:getStockDisplayCode(stock),detail,target:'stock',id:stock.id});
    const grouped=new Map();
    for(const m of movements){const key=String(m.stokId);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(m);}
    for(const stock of stocks) {
        const rows=grouped.get(String(stock.id))||[];
        for(const field of ['miktar','kg']) {
            if(!Number.isFinite(Number(stock[field]||0))||Number(stock[field])<0){add(stock,'Stok adedi veya ağırlığı geçersiz.');continue;}
            const fieldRows=rows.filter(m=>m.alan===field);
            let last=null,broken=false;
            for(const m of fieldRows) {
                if(![m.miktar,m.onceki,m.sonraki].every(v=>typeof v==='number'&&Number.isFinite(v)) || roundMoney(m.onceki+m.miktar)!==roundMoney(m.sonraki) || (last&&roundMoney(last.sonraki)!==roundMoney(m.onceki)))broken=true;
                last=m;
            }
            if(broken)add(stock,`${field==='kg'?'KG':'Adet'} hareketlerinin önceki ve sonraki değerleri birbirini tutmuyor.`);
            else if(last&&roundMoney(last.sonraki)!==roundMoney(stock[field]||0))add(stock,`Karttaki ${field==='kg'?'KG':'adet'} miktarı son stok hareketiyle eşleşmiyor.`);
            else if(fieldRows.length&&roundMoney(fieldRows[0].onceki)!==0)add(stock,`İlk ${field==='kg'?'KG':'adet'} girişi hareket geçmişinde yok (${roundMoney(fieldRows[0].onceki).toLocaleString('tr-TR')} ${field==='kg'?'KG':'adet'} kayıtsız başlıyor). Stok geçmişi eksik; fiziki sayımla kontrol edin.`,'review');
        }
        if(stock.isPasif||stock.cutVoided)continue;
        if(isDimensionedSheet(stock)&&stock.weightBasis==='estimate'&&Number(stock.miktar)>0&&Number(stock.kg)>0) {
            try {
                const density=stock.weightDensity||sheetDensity(stock.cinsi);
                const expected=roundMoney(Number(stock.en)*Number(stock.boy)*Number(stock.mm)*Number(stock.miktar)*density/1e9);
                if(Math.abs(expected-Number(stock.kg))>Math.max(.05,expected*.05))add(stock,`Tahmini ağırlık ölçü ve adetle uyuşmuyor: kayıtta ${Number(stock.kg).toLocaleString('tr-TR')} KG, ölçüye göre yaklaşık ${expected.toLocaleString('tr-TR')} KG. Tartım veya geçmiş stok düşümleri incelenmeli.`,'review');
            }catch(_){}
        }
    }
    for(const order of database.isEmirleri||[]) {
        if(!order.stokDusuldu)continue;
        const stock=stocks.find(s=>String(s.id)===String(order.stokId));
        if(!stock){findings.push({severity:'error',category:'Stok',title:order.orderNo,detail:'Stok düşülen iş emrinin malzeme kartı bulunamadı.',target:'order',id:order.id});continue;}
        if(order.stockTrackingVersion===2)for(const [amountKey,idKey,field] of [['stokDusulenKg','stockKgMovementId','kg'],['stokDusulenPlaka','stockPlateMovementId','miktar']]) {
            if(!(Number(order[amountKey])>0))continue;
            const m=movements.find(m=>m.id===order[idKey]);
            if(!m||String(m.stokId)!==String(stock.id)||m.alan!==field||m.miktar!==-order[amountKey])add(stock,`${order.orderNo}: bağlı plaka / KG düşüm hareketi eksik veya tutarsız.`);
        }
        const field=order.stokDusulenAlan||(order.islemTipi==='hammadde'?'kg':'miktar');
        if(field==='miktar'&&!order.sheetCutId&&!(Number(order.stokDusulenKg)>0)&&Number(stock.kg)>0)add(stock,`${order.orderNo}: plaka düşülmüş ancak KG düşümü kayıtlı değil.`,'review');
    }
    return findings;
}

function buildAccountCheckReport(database = db) {
    const findings = buildStockCheckFindings(database);
    const caris = database.cariler || [], invoices = database.faturalar || [], movements = database.islemler || [], cash = database.kasaHareketleri || [], accounts = database.kasaHesaplari || [];
    const cariIds = new Map(caris.map(c => [String(c.id), c]));
    const cariNames = new Map();
    for (const c of caris) {
        const name = normalizeLookupText(c.adi);
        cariNames.set(name, cariNames.has(name) ? null : c);
    }
    const resolveCari = record => record.cariId != null ? cariIds.get(String(record.cariId)) : cariNames.get(normalizeLookupText(record.firma));
    const cariRows = new Map(), cashRows = new Map();
    for (const movement of movements) {
        const owner = resolveCari(movement);
        if (owner) { const key = String(owner.id); if (!cariRows.has(key)) cariRows.set(key, []); cariRows.get(key).push(movement); }
    }
    for (const movement of cash) {
        const key = String(movement.kasaId); if (!cashRows.has(key)) cashRows.set(key, []); cashRows.get(key).push(movement);
    }
    const byId = rows => new Map(rows.map(row => [String(row.id), row]));
    const invoiceMap = byId(invoices), movementMap = byId(movements), cashMap = byId(cash), accountMap = byId(accounts);
    const add = (severity, category, title, detail, target, id) => findings.push({ severity, category, title, detail, target, id });
    const numeric = value => typeof value === 'number' && Number.isFinite(value);
    for (const cari of caris) {
        const rows = cariRows.get(String(cari.id)) || [];
        const unknown = rows.some(m => !numeric(m.bakiyeDegisimi));
        const sum = roundMoney(rows.reduce((n,m) => n + (Number(m.bakiyeDegisimi) || 0), 0));
        const knownOpening = numeric(cari.ledgerOpeningBalance);
        const difference = roundMoney(Number(cari.bakiye || 0) - sum - (knownOpening ? cari.ledgerOpeningBalance : 0));
        if (unknown || difference !== 0) add(knownOpening && !unknown ? 'error' : 'review', 'Cari', cari.adi,
            `Kayıtlı bakiye ${formatCurrency(cari.bakiye)}; hareket toplamı ${formatCurrency(sum)}. ${knownOpening ? `Başlangıç ${formatCurrency(cari.ledgerOpeningBalance)}; fark ${formatCurrency(difference)}.` : `Açıklanması gereken fark ${formatCurrency(difference)}. Eski devir veya eksik hareket bilgisi kontrol edilmeli.`}${unknown ? ' Tutar etkisi bilinmeyen eski hareket var.' : ''}`, 'cari', cari.id);
    }
    for (const account of accounts) {
        const rows = cashRows.get(String(account.id)) || [];
        const sum = roundMoney(rows.reduce((n,m) => n + (m.tip === 'cikis' ? -1 : 1) * (Number(m.tutar) || 0), 0));
        const knownOpening = numeric(account.ledgerOpeningBalance);
        const difference = roundMoney(Number(account.bakiye || 0) - sum - (knownOpening ? account.ledgerOpeningBalance : 0));
        if (difference !== 0) add(knownOpening ? 'error' : 'review', 'Kasa / Banka', account.ad, `Kayıtlı bakiye ${formatCurrency(account.bakiye)}; hareket toplamı ${formatCurrency(sum)}; fark ${formatCurrency(difference)}.${knownOpening ? '' : ' Eski açılış bakiyesi veya eksik hareket kontrol edilmeli.'}`, 'cash', account.id);
    }
    for (const invoice of invoices) {
        const label = invoice.faturaNo || 'Fatura';
        if (!resolveCari(invoice)) add('error','Fatura',label,'Faturanın bağlı olduğu cari bulunamıyor veya isim birden fazla cariye ait.','invoice',invoice.id);
        const summary = getInvoicePaymentSummary(invoice, '', database);
        if (summary.remaining === null) add('review','Fatura',label,'Eski kısmi ödemenin tutarı bilinmiyor. Fatura detayından ödeme geçmişini tamamlayın.','invoice',invoice.id);
        if (summary.paid !== null && summary.paid > Number(invoice.tutar)) add('error','Fatura',label,`Bağlı ödeme toplamı ${formatCurrency(summary.paid)}, fatura tutarı ${formatCurrency(invoice.tutar)}.`, 'invoice',invoice.id);
        if (numeric(invoice.matrah) && numeric(invoice.kdvTutari) && Math.abs(roundMoney(invoice.matrah + invoice.kdvTutari - Number(invoice.tutar))) > .01) add('error','Fatura',label,'Matrah ve KDV toplamı fatura tutarıyla eşleşmiyor.','invoice',invoice.id);
        if (invoice.cariIslemId != null) {
            const movement = movementMap.get(String(invoice.cariIslemId));
            if (!movement || movement.reversedBy || resolveCari(movement)?.id !== resolveCari(invoice)?.id || (numeric(invoice.cariBakiyeDegisimi) && roundMoney(movement.bakiyeDegisimi) !== roundMoney(invoice.cariBakiyeDegisimi))) add('error','Fatura',label,'Faturanın cari hareketi eksik, geri alınmış veya cari/tutar bilgisi farklı.','invoice',invoice.id);
        } else if (invoice.cariYansitildi) add('review','Fatura',label,'Cari hesaba işlendiği belirtiliyor ancak kaynak hareket bağlantısı yok.','invoice',invoice.id);
        if (invoice.orderId != null && !(database.isEmirleri || []).some(order => String(order.id) === String(invoice.orderId))) add('error','Fatura',label,'Bağlı iş emri bulunamıyor.','invoice',invoice.id);
    }
    for (const movement of movements) {
        const cari = resolveCari(movement);
        const label = `${cari?.adi || movement.firma || 'Cari hareketi'} · ${movement.tip || movement.id}`;
        if (!cari) add('review','Cari',label,'Hareketin carisi bulunamıyor veya eski isim bağlantısı belirsiz.','accounts',null);
        if (movement.paymentInvoiceId != null && !movement.reversalOf && !movement.reversedBy) {
            const invoice = invoiceMap.get(String(movement.paymentInvoiceId));
            if (!invoice || !invoiceMatchesCari(invoice, movement.cariId, movement.firma, database) || getCariMovementFormType(movement) !== (invoice.tur === 'kesilen' ? 'tahsilat' : 'odeme_yaptik')) add('error','Ödeme',label,'Ödemenin fatura bağlantısı bulunamıyor veya cari/ödeme yönü eşleşmiyor.','cari',cari?.id);
        }
        if (movement.kasaHareketId != null) {
            const linked = cashMap.get(String(movement.kasaHareketId));
            const cashDelta = linked ? roundMoney((linked.tip === 'cikis' ? -1 : 1) * Number(linked.tutar)) : null;
            if (!linked || (numeric(movement.bakiyeDegisimi) && cashDelta !== -roundMoney(movement.bakiyeDegisimi))) add('error','Ödeme',label,'Cari hareketinin kasa/banka kaydı eksik veya tutar/yön farklı.','cari',cari?.id);
        }
    }
    for (const [rows, map, category] of [[movements,movementMap,'Cari'],[cash,cashMap,'Kasa / Banka']]) {
        const reversalSource = row => row?.reversalOf ?? (category === 'Kasa / Banka' && String(row?.kaynak || '').endsWith('-ters-kayit') ? row.refId : null);
        for (const row of rows) {
            const target = category === 'Cari' ? 'cari' : 'cash';
            const targetId = category === 'Cari' ? resolveCari(row)?.id : row.kasaId;
            if (category === 'Kasa / Banka' && !accountMap.has(String(row.kasaId))) add('error',category,row.kasaAdi || 'Kasa hareketi','Hareketin kasa/banka hesabı bulunamıyor.','cash',null);
            if (reversalSource(row) != null) {
                const original = map.get(String(reversalSource(row)));
                const delta = item => category === 'Cari' ? Number(item.bakiyeDegisimi) : (item.tip === 'cikis' ? -1 : 1) * Number(item.tutar);
                if (!original || String(original.reversedBy) !== String(row.id) || Math.abs(roundMoney(delta(original) + delta(row))) > .01) add('error',category,`Ters kayıt · ${row.id}`,'Kaynak hareket ve ters kayıt bağlantısı veya tutarı eşleşmiyor.',target,targetId);
            }
            if (row.reversedBy != null && String(reversalSource(map.get(String(row.reversedBy)))) !== String(row.id)) add('error',category,`Geri alınan işlem · ${row.id}`,'İşaretlenen ters kayıt bulunamıyor veya kaynak bağlantısı farklı.',target,targetId);
        }
    }
    for (const order of database.isEmirleri || []) {
        if (order.customerId === 'internal') continue;
        const charges = movements.filter(m => m.orderId != null && String(m.orderId) === String(order.id) && !isIncomeMovement(m));
        const net = roundMoney(charges.reduce((n,m) => n + (Number(m.bakiyeDegisimi) || 0), 0));
        const expected = order.bakiyeCariyeYansitildi === true ? roundMoney(order.total) : 0;
        if ((charges.length || expected) && net !== expected) add('review','İş Emri',order.orderNo || 'İş emri',`İş emrinin cari borç etkisi ${formatCurrency(net)}, beklenen ${formatCurrency(expected)} (${order.bakiyeCariyeYansitildi ? 'cariye yansıtıldı' : 'cariye yansıtılmadı'}). Teslim, fatura ve iptal kayıtları kontrol edilmeli.`,'order',order.id);
    }
    for (const sale of database.hizliSatislar || []) {
        const issue = getQuickSaleLinkError(sale, database);
        if (issue) add('error', 'Hızlı Satış', sale.satisNo, issue, 'quicksale', sale.id);
        const cut=(database.sacKesimleri||[]).find(c=>c.id===sale.sheetCutId);
        if(sale.status==='active'&&cut&&!cut.pieces?.length&&sale.cut?.remainderMode!=='none'&&Number(sale.cut?.en)*Number(sale.cut?.boy)<Number(cut.sourceEn)*Number(cut.sourceBoy))add('review','Hızlı Satış',sale.satisNo,'Kısmi kesimin kalan parçaları kaydedilmemiş. Gerçek kalan ölçüler kontrol edilmeli.','quicksale',sale.id);
    }
    for (const cut of database.sacKesimleri || []) {
        const issue = getSheetCutLinkError(cut, database);
        if (issue) add('error', 'Sac Kesimi', cut.kesimNo, issue, 'cut', cut.id);
    }
    for(const movement of movements.filter(m=>m.sheetPurchase)){const issue=getSheetPurchaseLinkError(movement,database);if(issue)add('error','Sac Alımı',movement.sheetPurchase.code,issue,'cari',movement.cariId);}
    return { findings, records: (database.stoklar || []).length + (database.isEmirleri || []).length + (database.sacKesimleri || []).length + (database.hizliSatislar || []).length + caris.length + invoices.length + movements.length + cash.length + accounts.length };
}

function showMoreAccountChecks() { accountCheckLimit += 50; renderAccountChecks(); }
function renderAccountChecks() {
    if (!document.getElementById('account-check-results')) return;
    const report = buildAccountCheckReport();
    const errors = report.findings.filter(f => f.severity === 'error').length;
    const reviews = report.findings.length - errors;
    document.getElementById('account-check-summary').innerHTML = financeSummaryCard('Kontrol edilen kayıt', String(report.records)) + financeSummaryCard('Tutarsızlık', String(errors), 'Bağlantı veya tutar farkı') + financeSummaryCard('İncelenecek', String(reviews), 'Eski veri / devir bilgisi') + financeSummaryCard('Kontrol sonucu', errors ? 'Kontrol gerekli' : reviews ? 'İnceleme gerekli' : 'Fark bulunmadı', 'Mevcut kayıtlar üzerinden');
    const filter = document.getElementById('account-check-filter').value;
    currentAccountCheckFindings = report.findings.filter(f => filter === 'all' || f.severity === filter).sort((a,b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
    document.getElementById('account-check-results').innerHTML = currentAccountCheckFindings.slice(0,accountCheckLimit).map((f,index) => `<article class="finance-check-item"><div><span class="finance-status ${f.severity}">${f.severity === 'error' ? 'Tutarsızlık' : 'İncelenecek'} · ${escapeHTML(f.category)}</span><h4>${escapeHTML(f.title)}</h4><p>${escapeHTML(f.detail)}</p></div><button type="button" class="btn btn-outline" onclick="openAccountCheckFinding(${index})">Kaydı İncele</button></article>`).join('') || `<div class="finance-empty"><strong>${report.records ? 'Bu görünümde bulgu yok.' : 'Henüz kontrol edilecek kayıt yok.'}</strong>${report.records ? 'Kontrol mevcut kayıtların tutar ve bağlantılarıyla sınırlıdır.' : 'Kayıtlar eklendikçe burada kontrol edebilirsiniz.'}</div>`;
    document.getElementById('account-check-more').hidden = currentAccountCheckFindings.length <= accountCheckLimit;
    document.getElementById('account-check-time').textContent = `Son kontrol: ${new Date().toLocaleString('tr-TR')}`;
}

function openAccountCheckFinding(index) {
    const f = currentAccountCheckFindings[index];
    if (!f) return;
    if (f.target === 'cut') return showSheetCutHistory(f.id);
    if(f.target==='stock'){const stock=getDBArray('stoklar').find(s=>s.id===f.id);document.getElementById('stok-search').value=stock?.kodu||'';location.hash='inventory';switchView('inventory');renderStoklar();return;}
    if(f.target==='order')return openOrderHistory(f.id);
    if (f.target === 'quicksale') { location.hash = 'quicksales'; switchView('quicksales'); return; }
    if (f.target === 'invoice') return showFaturaDetail(f.id);
    if (f.target === 'cari' && f.id != null) return openCariDetay(f.id);
    const target = f.target === 'cash' ? 'cashbank' : 'accounts';
    location.hash = target; switchView(target);
}

function renderFinanceFollowUp() {
    if (document.getElementById('view-collections')?.classList.contains('active')) renderCollections();
    if (document.getElementById('view-accountcheck')?.classList.contains('active')) renderAccountChecks();
    if (document.getElementById('modal-cari-ekstre')?.classList.contains('active')) renderCariPaymentOverview();
}

function applyBackupStatus(status) {
    backupStatusRevision++;
    backupStatusView = status;
    renderBackupStatus();
}

async function refreshBackupStatus() {
    const revision = backupStatusRevision;
    if (!window.electronAPI?.getBackupStatus) { renderBackupStatus(); return; }
    try {
        const status = await window.electronAPI.getBackupStatus();
        if (revision === backupStatusRevision) applyBackupStatus(status);
    } catch (_) {
        if (revision === backupStatusRevision) applyBackupStatus({ success: false, error: 'Yedek bilgisi okunamadı.' });
    }
}

function renderBackupStatus() {
    const status = backupStatusView;
    const date = status?.lastSuccessAt ? new Date(status.lastSuccessAt) : null;
    const dateValid = date && Number.isFinite(date.getTime());
    const age = dateValid ? Date.now() - date.getTime() : Infinity;
    let state = 'warning', title = 'Henüz doğrulanmış yedek yok', detail = 'Ayarlar bölümünden yedek oluşturabilirsiniz.';
    if (!window.electronAPI?.sendBackup) { title = 'Yedekleme masaüstü uygulamasında kullanılabilir'; detail = 'Bu görünümde dosya yedeği oluşturulmaz.'; }
    else if (status?.error || status?.success === false) { state = 'error'; title = 'Yedekleme kontrol edilmeli'; detail = status.error || 'Son yedekleme tamamlanamadı.'; }
    else if (dateValid && status.available === false) { title = 'Son yedek dosyası bulunamıyor'; detail = 'Yeni bir yedek oluşturun.'; }
    else if (dateValid) { state = age > 86400000 ? 'warning' : 'success'; title = age > 86400000 ? 'Son yedek 24 saatten eski' : 'Yedekleme güncel'; detail = `Son başarılı yedek: ${date.toLocaleString('tr-TR')}${status.kind === 'manual' ? ' · Manuel' : status.kind === 'safety' ? ' · Güvenlik yedeği' : ' · Otomatik'}`; }
    if ((status?.error || status?.success === false) && dateValid) detail += ` Son başarılı yedek: ${date.toLocaleString('tr-TR')}.`;
    for (const id of ['dashboard-backup-status','settings-backup-status']) {
        const el = document.getElementById(id); if (!el) continue;
        el.dataset.state = state;
        el.innerHTML = `<i class="fa-solid ${state === 'success' ? 'fa-shield-halved' : 'fa-triangle-exclamation'}" aria-hidden="true"></i><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(detail)}</small></div>${id === 'dashboard-backup-status' ? '<button type="button" class="btn btn-outline" onclick="openAyarlarModal(); setSettingsTab(\'backup\'); refreshBackupStatus()">Yedekleme</button>' : '<button type="button" class="btn btn-outline" onclick="refreshBackupStatus()">Durumu Yenile</button>'}`;
    }
}

// Quick sales are committed as a complete candidate database: a failed disk write
// leaves both the live ledger and the form intact. A token makes retries idempotent.
let quickSalesPage = 1;
function quickSaleStatusLabel(sale) {
    return sale.status === 'cancelled' ? 'İptal' : sale.status === 'corrected' ? 'Düzeltildi' : 'Tahsil edildi';
}
function getQuickSaleLinkError(sale, database = db) {
    const same = (a,b) => String(a) === String(b);
    const cari = (database.cariler || []).find(c => same(c.id, sale.cariId));
    const debit = (database.islemler || []).find(m => same(m.id, sale.debitMovementId));
    const receipt = (database.islemler || []).find(m => same(m.id, sale.receiptMovementId));
    const cash = (database.kasaHareketleri || []).find(m => same(m.id, sale.cashMovementId));
    if (!cari || !debit || !receipt || !cash) return 'Satışın bağlı cari veya tahsilat kaydı eksik.';
    if (!['active','cancelled','corrected'].includes(sale.status) || !(sale.tutar > 0) || roundMoney(sale.matrah + sale.kdvTutari) !== sale.tutar) return 'Satış durumu veya tutar bilgisi tutarsız.';
    if (![debit,receipt].every(m => same(m.cariId, cari.id) && same(m.quickSaleId, sale.id)) || debit.bakiyeDegisimi !== sale.tutar || receipt.bakiyeDegisimi !== -sale.tutar || cash.tutar !== sale.tutar || cash.tip !== 'giris' || !same(cash.kasaId,sale.kasaId) || !same(cash.refId,receipt.id) || !same(receipt.kasaHareketId,cash.id)) return 'Satış, cari ve tahsilat tutarları veya bağlantıları eşleşmiyor.';
    if (!(database.kasaHesaplari || []).some(k => same(k.id,sale.kasaId))) return 'Tahsilat hesabı bulunamadı.';
    const active = sale.status === 'active';
    if ([debit,receipt,cash].some(m => active ? !!m.reversedBy : !m.reversedBy)) return 'Satış durumu ile geri alınan hareketler eşleşmiyor.';
    if (!active) {
        for (const original of [debit,receipt]) {
            const rev = (database.islemler || []).find(m => same(m.id,original.reversedBy));
            if (!rev || !same(rev.reversalOf, original.id) || rev.bakiyeDegisimi !== -original.bakiyeDegisimi) return 'Satışın geri alma hareketi eksik veya tutarı farklı.';
        }
        const rev = (database.kasaHareketleri || []).find(m => same(m.id,cash.reversedBy));
        if (!rev || !same(rev.refId,cash.id) || !same(rev.kasaId,cash.kasaId) || rev.tip !== 'cikis' || rev.tutar !== cash.tutar) return 'Tahsilatın geri alma hareketi eksik veya tutarı farklı.';
    }
    if (sale.sheetCutId) {
        const cut = (database.sacKesimleri || []).find(c => c.id === sale.sheetCutId);
        if (!cut || cut.quickSaleId !== sale.id || cut.stokId !== sale.stokId || cut.quantity !== sale.stokMiktar || (cut.status === 'active') !== active) return 'Satışın kesim bağlantısı tutarsız.';
        return getSheetCutLinkError(cut, database);
    }
    if (sale.stokId) {
        const stok = (database.stoklar || []).find(s => same(s.id,sale.stokId));
        const movement = (database.stokHareketleri || []).find(m => same(m.id,sale.stockMovementId));
        if (!stok || (active && stok.sahibiTipi === 'musteri') || !movement || !same(movement.stokId,sale.stokId) || movement.alan !== sale.stokAlan || movement.miktar !== -sale.stokMiktar) return 'Satışın stok hareketi eksik veya miktarı farklı.';
        if(sale.stockTrackingVersion===2)for(const [key,field] of [['stockKg','kg'],['stockPlateQty','miktar']]) {
            if(!sale[key])continue;
            const paired=(database.stokHareketleri||[]).find(m=>same(m.id,sale[key+'MovementId']));
            if(!paired||!same(paired.stokId,sale.stokId)||paired.alan!==field||paired.miktar!==-sale[key])return 'Satışın eşleşen plaka / KG hareketi eksik veya farklı.';
            if(!active){const undo=(database.stokHareketleri||[]).find(m=>same(m.id,sale[key+'ReversalId']));if(!undo||!same(undo.stokId,sale.stokId)||undo.alan!==field||undo.miktar!==sale[key])return 'Satışın plaka / KG iadesi eksik veya farklı.';}
        }
        if (!active) {
            const rev = (database.stokHareketleri || []).find(m => same(m.id,sale.stockReversalId));
            if (!rev || !same(rev.stokId,sale.stokId) || rev.alan !== sale.stokAlan || rev.miktar !== sale.stokMiktar) return 'Stok iade hareketi eksik veya miktarı farklı.';
        }
    }
    return '';
}
function reverseQuickSaleRecords(sale, status) {
    if (!sale || sale.status !== 'active') throw new Error('Bu satış daha önce iptal edilmiş veya düzeltilmiş. Listeyi yenileyin.');
    const issue = getQuickSaleLinkError(sale);
    if (issue) throw new Error(issue + ' Hesap Kontrolü bölümünden inceleyin.');
    const cari = db.cariler.find(c => c.id === sale.cariId);
    for (const id of [sale.debitMovementId, sale.receiptMovementId]) {
        const original = db.islemler.find(m => m.id === id);
        const reversal = addCariMovement(cari, { tip: 'Hızlı Satış Geri Alma', tutar: original.tutar, bakiyeDegisimi: -original.bakiyeDegisimi, reversalOf: original.id, quickSaleId: sale.id, quickSaleNo: sale.satisNo, aciklama: sale.satisNo });
        original.reversedBy = reversal.id;
        if (id === sale.receiptMovementId) {
            const cashReversal = reverseCashMovement(sale.cashMovementId, `${sale.satisNo} ${status === 'corrected' ? 'düzeltildi' : 'iptal edildi'}`);
            if (!cashReversal) throw new Error('Tahsilat geri alınamadı.');
            reversal.kasaHareketId = cashReversal.id;
        }
    }
    if (sale.sheetCutId) undoSheetCutRecords(sale.sheetCutId, sale.id);
    if (sale.stokId && !sale.sheetCutId) {
        const stok = db.stoklar.find(s => s.id === sale.stokId);
        const before = Number(stok[sale.stokAlan]) || 0;
        if (sale.stockKg) sale.stockKgReversalId=changeSheetStock(stok,'kg',sale.stockKg,'Hızlı Satış İadesi',sale.satisNo);
        if (sale.stockPlateQty) sale.stockPlateQtyReversalId=changeSheetStock(stok,'miktar',sale.stockPlateQty,'Hızlı Satış İadesi',sale.satisNo);
        stok[sale.stokAlan] = roundMoney(before + sale.stokMiktar);
        sale.stockReversalId = addStokMovement(stok, { tip: 'Hızlı Satış İadesi', alan: sale.stokAlan, miktar: sale.stokMiktar, onceki: before, sonraki: stok[sale.stokAlan], ref: sale.satisNo }).id;
    }
    sale.status = status;
    sale.closedAt = new Date().toISOString();
    addAuditLog(status === 'corrected' ? 'Düzeltildi' : 'İptal', 'Hızlı Satış', sale.id, sale.satisNo);
}
function prepareQuickSaleCandidate(input, editId = '', cancel = false) {
    const live = db;
    try {
        db = JSON.parse(JSON.stringify(live));
        if (!Array.isArray(db.hizliSatislar)) db.hizliSatislar = [];
        const previous = editId ? db.hizliSatislar.find(s => String(s.id) === String(editId)) : null;
        if (editId && !previous) throw new Error('Satış bulunamadı.');
        if (!cancel && (!input.token || typeof input.token !== 'string')) throw new Error('Satış formunu yeniden açın.');
        if (!cancel && db.hizliSatislar.some(s => s.submitToken === input.token)) throw new Error('Bu satış zaten kaydedildi. Satış geçmişini kontrol edin.');
        if (cancel) {
            reverseQuickSaleRecords(previous, 'cancelled');
            return { candidate: db, sale: previous };
        }
        const tutar = roundMoney(input.total), tax = Number(input.tax);
        if (!Number.isFinite(Number(input.total)) || tutar <= 0 || tutar > 1e12) throw new Error('Geçerli bir satış tutarı girin.');
        const preservingLegacyTax = previous && [1,10].includes(Number(previous.kdvOrani)) && tax === Number(previous.kdvOrani);
        if (![0,20].includes(tax) && !preservingLegacyTax) throw new Error('KDV oranı %0 veya %20 olmalıdır.');
        if (!plainText(input.description) || plainText(input.description).length > 300) throw new Error('Satış açıklaması girin (en fazla 300 karakter).');
        if (plainText(input.name).length > 120) throw new Error('Müşteri adı en fazla 120 karakter olabilir.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || financeDay(input.date) === null) throw new Error('Geçerli bir satış tarihi seçin.');
        const account = db.kasaHesaplari.find(k => String(k.id) === String(input.cashId) && isCashAccountActive(k));
        if (!account) throw new Error('Aktif bir tahsilat hesabı seçin.');
        // Return old stock before checking the replacement's available quantity.
        if (previous) reverseQuickSaleRecords(previous, 'corrected');
        let stok = null, quantity = 0;
        const field = input.cut ? 'miktar' : input.unit || 'miktar';
        if (input.stockId) {
            stok = db.stoklar.find(s => String(s.id) === String(input.stockId));
            quantity = roundMoney(input.quantity);
            if (!stok || stok.sahibiTipi === 'musteri' || stok.isPasif) throw new Error('Satış için işletmeye ait aktif bir stok seçin.');
            if (!['kg','miktar'].includes(field) || !Number.isFinite(Number(input.quantity)) || quantity <= 0) throw new Error('Geçerli stok miktarı ve birimi girin.');
            if (stok.originCutId && (field !== 'miktar' || !Number.isInteger(quantity))) throw new Error('Kalan parçalar adetle kullanılır. Bölmek için Kesim / Kalan işlemini kullanın.');
            validateStockUsage(stok,field,quantity);
        }
        let saleCut = null;
        if (input.cut) {
            if (!stok) throw new Error('Ölçüyle kesim için malzeme seçin.');
            const basis = sheetWeightBasis(stok, input.cut.density);
            if (!(Number(stok.kg)>0)) {
                changeSheetStock(stok,'kg',basis.total,'Ölçüden Tahmini Ağırlık',input.token);
                stok.weightBasis='estimate'; stok.weightDensity=basis.density;
            }
            const cutInput = quickSaleCutInput(input, stok);
            const prepared = prepareSheetCutCandidate(cutInput);
            db = prepared.candidate; saleCut = prepared.cut;
            stok = db.stoklar.find(s => s.id === stok.id);
        }
        let cari = db.cariler.find(c => c.systemRole === 'retail');
        if (!cari) {
            cari = { id: createRecordId(), kodu: generateSerialNo('cari'), adi: 'Perakende Müşteri', tip: 'musteri', systemRole: 'retail', bakiye: 0, ledgerOpeningBalance: 0, isPasif: false };
            db.cariler.push(cari);
        }
        if (cari.isPasif || Number(cari.bakiye) !== 0) throw new Error('Perakende hesabı kontrol edilmeli. Hesap Kontrolü bölümünü açın.');
        const sale = { id: createRecordId(), satisNo: generateSerialNo('hizliSatis'), submitToken: input.token, status: 'active', tarih: toTRDateFromInput(input.date), date: input.date,
            aciklama: plainText(input.description), customerName: plainText(input.name), cariId: cari.id, kasaId: account.id, kasaAdi: account.ad, kasaTip: account.tip,
            tutar, kdvOrani: tax, matrah: roundMoney(tutar / (1 + tax / 100)), stokId: stok?.id || null, stokAdi: stok?.cinsi || '', stokAlan: field, stokMiktar: quantity,
            issuer: { firmaAdi: db.ayarlar?.firmaAdi, telefon: db.ayarlar?.telefon, adres: db.ayarlar?.adres }, correctionOf: previous?.id || null, createdAt: new Date().toISOString() };
        sale.kdvTutari = roundMoney(tutar - sale.matrah);
        const common = { tarih: sale.tarih, quickSaleId: sale.id, quickSaleNo: sale.satisNo, tutar, aciklama: `${sale.satisNo} · ${sale.aciklama}${sale.customerName ? ' · ' + sale.customerName : ''}` };
        sale.debitMovementId = addCariMovement(cari, { ...common, tip: 'Hızlı Satış', bakiyeDegisimi: tutar }).id;
        const receipt = addCariMovement(cari, { ...common, tip: 'Hızlı Satış Tahsilatı', bakiyeDegisimi: -tutar, isGelir: true, isSuccess: true });
        sale.receiptMovementId = receipt.id;
        const cash = addCashMovement(account.id, { tip: 'giris', tutar, kaynak: 'hizli-satis', refId: receipt.id, aciklama: common.aciklama, tarih: sale.tarih });
        if (!cash) throw new Error('Tahsilat kaydı oluşturulamadı.');
        receipt.kasaHareketId = cash.id;
        sale.cashMovementId = cash.id;
        if (saleCut) {
            sale.sheetCutId = saleCut.id; sale.cut = {...JSON.parse(JSON.stringify(input.cut)), pieces:saleCut.pieces.map(p=>({en:p.en,boy:p.boy,quantity:p.quantity})), remainderMode:input.cut.remainderMode || 'manual'};
            saleCut.quickSaleId = sale.id; saleCut.quickSaleNo = sale.satisNo;
        }
        if (stok && !saleCut) {
            const before = Number(stok[field]) || 0;
            const secondary=secondaryStockUsage(stok,field,quantity);
            sale.stockTrackingVersion=2;
            if(secondary) {
                const key=secondary.field==='kg'?'stockKg':'stockPlateQty';
                sale[key]=secondary.quantity;
                sale[key+'MovementId']=changeSheetStock(stok,secondary.field,-secondary.quantity,'Hızlı Satış',sale.satisNo,sale.tarih);
            }
            stok[field] = roundMoney(before - quantity);
            sale.stockMovementId = addStokMovement(stok, { tip: 'Hızlı Satış', alan: field, miktar: -quantity, onceki: before, sonraki: stok[field], ref: sale.satisNo, tarih: sale.tarih }).id;
        }
        db.hizliSatislar.push(sale);
        if (previous) db.hizliSatislar.find(s => s.id === previous.id).correctedBy = sale.id;
        addAuditLog('Oluşturuldu', 'Hızlı Satış', sale.id, `${sale.satisNo} · ${formatCurrency(tutar)} · ${account.ad}`);
        return { candidate: db, sale };
    } finally { db = live; }
}
async function commitQuickSale(input, editId = '', cancel = false) {
    if (quickSaleSaving || sheetCutSaving) return { success: false, error: 'Bir kayıt işlemi devam ediyor.' };
    if (startupHydrationPending || startupPersistenceBlocked) return { success: false, error: 'Veriler hazır değil. Yükleme durumunu kontrol edin.' };
    quickSaleSaving = true;
    const surfaces = [...document.body.children].filter(el => !['SCRIPT','STYLE'].includes(el.tagName));
    const inertStates = surfaces.map(el => [el,el.inert]);
    surfaces.forEach(el => { el.inert = true; });
    const notice = document.createElement('div');
    notice.className = 'quick-sale-saving'; notice.setAttribute('role','status'); notice.textContent = 'Satış ve tahsilat kaydediliyor…'; document.body.append(notice);
    try {
        const prepared = prepareQuickSaleCandidate(input,editId,cancel);
        const result = await replaceDatabaseSafely(prepared.candidate);
        return { ...result, sale: result.success ? prepared.sale : null };
    } catch(error) { return { success: false, error: error.message }; }
    finally {
        quickSaleSaving = false;
        notice.remove(); inertStates.forEach(([el,inert]) => { el.inert = inert; });
    }
}
function openQuickSale(id = '') {
    if (quickSaleSaving || sheetCutSaving) return;
    const sale = id ? getDBArray('hizliSatislar').find(s => String(s.id) === String(id)) : null;
    if (id && (!sale || sale.status !== 'active')) return alert('Yalnızca geçerli satışlar düzeltilebilir.');
    const set = (name,value) => { document.getElementById('quick-sale-'+name).value = value; };
    const accounts = getDBArray('kasaHesaplari').filter(isCashAccountActive);
    document.getElementById('quick-sale-cash').innerHTML = '<option value="">Hesap seçin</option>' + accounts.map(k => `<option value="${k.id}">${escapeHTML(k.ad)}</option>`).join('');
    document.getElementById('quick-sale-stock').innerHTML = '<option value="">Stok düşme</option>' + getDBArray('stoklar').filter(s => s.sahibiTipi !== 'musteri' && !s.isPasif && !s.cutVoided && (Number(s.miktar)>0 || Number(s.kg)>0 || String(sale?.stokId)===String(s.id))).map(s => `<option value="${s.id}">${escapeHTML([getStockDisplayCode(s),s.cinsi,s.mm ? s.mm+' mm' : '', s.ebat || (s.en && s.boy ? s.en+' × '+s.boy : ''), 'Stok: '+roundMoney(s.miktar||0).toLocaleString('tr-TR')+' plaka / '+roundMoney(s.kg||0).toLocaleString('tr-TR')+' KG', s.originCutId ? 'Kalan Parça' : ''].filter(Boolean).join(' · '))}</option>`).join('');
    const taxSelect = document.getElementById('quick-sale-tax');
    taxSelect.innerHTML = '<option value="20">%20</option><option value="0">%0</option>';
    if (sale && [1,10].includes(Number(sale.kdvOrani))) {
        taxSelect.add(new Option(`%${Number(sale.kdvOrani)} (kayıtlı oran)`, String(Number(sale.kdvOrani))));
    }
    set('edit-id', sale?.id || ''); set('token', crypto.randomUUID());
    set('description',sale?.aciklama || ''); set('name',sale?.customerName || ''); set('total',sale?.tutar || '');
    set('cash',sale?.kasaId || ''); set('date',sale?.date || toDateInputValue(new Date())); set('tax',sale?.kdvOrani ?? 20);
    set('stock',sale?.stokId || ''); set('quantity',sale?.stokMiktar || ''); set('unit',sale?.stokAlan || 'miktar');
    set('mode', sale?.sheetCutId ? 'cut' : 'whole');
    set('cut-en', sale?.cut?.en || ''); set('cut-boy', sale?.cut?.boy || '');
    set('cut-density',sale?.cut?.density || '');set('cut-remaining-kg',sale?.cut?.remainingKg ?? '');
    set('remainder-mode',sale?.cut ? (sale.cut.remainderMode || 'manual') : 'auto');
    document.getElementById('quick-sale-cut-rows').innerHTML = '';
    (sale?.cut?.pieces || []).forEach(p => addQuickSaleCutRow(p));
    document.getElementById('quick-sale-stock-details').open = true;
    document.getElementById('quick-sale-title').textContent = sale ? `Satışı Düzelt · ${sale.satisNo}` : 'Yeni Hızlı Satış';
    document.getElementById('quick-sale-error').hidden = true;
    updateQuickSaleStockHint(); updateQuickSaleSummary(); openModal('modal-quick-sale');
    document.getElementById('quick-sale-description').focus();
}
function updateQuickSaleStockHint() {
    const cutting = document.getElementById('quick-sale-mode').value === 'cut';
    document.getElementById('quick-sale-cut-fields').hidden = !cutting;
    document.getElementById('quick-sale-unit').disabled = cutting;
    if (cutting) document.getElementById('quick-sale-unit').value = 'miktar';
    const stock = getDBArray('stoklar').find(s => String(s.id) === document.getElementById('quick-sale-stock').value);
    const field = document.getElementById('quick-sale-unit').value;
    const previous = getDBArray('hizliSatislar').find(s => String(s.id) === document.getElementById('quick-sale-edit-id').value);
    const returned = previous?.status === 'active' && previous.stokId === stock?.id && previous.stokAlan === field ? previous.stokMiktar : 0;
    document.getElementById('quick-sale-stock-hint').textContent = stock ? `Kullanılabilir: ${roundMoney(getAvailableStockQuantity(stock,field) + returned).toLocaleString('tr-TR')} ${field === 'kg' ? 'KG' : 'adet'}${returned ? ' (bu satışın iadesi dahil)' : ''}` : 'Malzeme seçmezseniz stok miktarı değişmez.';
    updateQuickSaleWeight();
    updateQuickSaleSummary();
}
function updateQuickSaleSummary() {
    const total = Math.max(0,roundMoney(document.getElementById('quick-sale-total').value));
    const tax = Number(document.getElementById('quick-sale-tax').value);
    const base = roundMoney(total/(1+tax/100));
    // Selling without a material is valid for services, but must never look like a stock deduction.
    const stock = getDBArray('stoklar').find(s => String(s.id) === document.getElementById('quick-sale-stock').value);
    const cutting = document.getElementById('quick-sale-mode').value === 'cut';
    const quantity = Number(document.getElementById('quick-sale-quantity').value);
    const unit = cutting ? 'plaka (ölçüyle kesim)' : document.getElementById('quick-sale-unit').value === 'kg' ? 'KG' : 'adet';
    const stockLine = !stock ? '<small class="quick-sale-stock-warning" role="note">Malzeme seçilmedi: stok miktarı değişmeyecek.</small>'
        : quantity > 0 ? `<small>Stoktan düşülecek: ${escapeHTML(quantity.toLocaleString('tr-TR'))} ${unit} · ${escapeHTML(getStockDisplayCode(stock))}</small>`
        : '<small class="quick-sale-stock-warning" role="note">Malzeme seçildi ancak miktar girilmedi.</small>';
    document.getElementById('quick-sale-summary').innerHTML = `<div><span>Tahsil edilecek</span><strong>${formatCurrency(total)}</strong></div><small>Matrah ${formatCurrency(base)} · KDV ${formatCurrency(total-base)}</small>${stockLine}`;
}
async function saveQuickSale() {
    const modal = document.getElementById('modal-quick-sale');
    if (!modal.classList.contains('active')) return;
    const unlock = beginModalSubmit('modal-quick-sale'); if (!unlock) return;
    try {
        const get = name => document.getElementById('quick-sale-'+name).value;
        const input = { token: get('token'), description: get('description'), name: get('name'), total: get('total'), cashId: get('cash'), date: get('date'), tax: get('tax'), stockId: get('stock'), quantity: get('quantity'), unit: get('unit') };
        if (get('mode') === 'cut') {
            updateQuickSaleWeight();
            input.cut = { remainderMode:get('remainder-mode'), density:get('cut-density'), remainingKg:get('cut-remaining-kg'), en:get('cut-en'), boy:get('cut-boy'), pieces:[...document.querySelectorAll('#quick-sale-cut-rows .sheet-cut-row')].map(row => ({en:row.querySelector('[data-field="en"]').value,boy:row.querySelector('[data-field="boy"]').value,quantity:row.querySelector('[data-field="quantity"]').value})) };
        }
        const result = await commitQuickSale(input,get('edit-id'));
        if (!result.success) { const error = document.getElementById('quick-sale-error'); error.textContent = result.error; error.hidden = false; return; }
        closeModal('modal-quick-sale');
        location.hash = 'quicksales'; switchView('quicksales'); renderAll();
        showToast({ type: result.backupWarning ? 'warning' : 'success', title: 'Satış kaydedildi', message: `${result.sale.satisNo} · ${formatCurrency(result.sale.tutar)} tahsil edildi.${result.backupWarning ? ' Otomatik yedek alınamadı; yedekleme durumunu kontrol edin.' : ''}` });
    } finally { unlock(); }
}
function cancelQuickSale(id) {
    const sale = getDBArray('hizliSatislar').find(s => s.id == id);
    if (!sale || sale.status !== 'active') return alert('Bu satış daha önce geri alınmış.');
    confirmAction(`${sale.satisNo} iptal edilsin mi? ${formatCurrency(sale.tutar)} tahsilat geri alınacak${sale.stokId ? ' ve malzeme stoğa iade edilecek' : ''}.`, async () => {
        const result = await commitQuickSale(null,id,true);
        if (!result.success) return alert(result.error);
        renderAll(); showToast({ type: result.backupWarning ? 'warning' : 'success', title: 'Satış iptal edildi', message: `${sale.satisNo} hareketleri geri alındı.${result.backupWarning ? ' Otomatik yedek alınamadı.' : ''}` });
    }, { title: 'Satışı İptal Et', confirmLabel: 'Satışı İptal Et' });
}
function filterQuickSales() { quickSalesPage = 1; renderQuickSales(); }
function changeQuickSalesPage(delta) { quickSalesPage += delta; renderQuickSales(); }
function renderQuickSales() {
    const body = document.getElementById('quick-sales-tbody'); if (!body) return;
    const query = normalizeSearchText(document.getElementById('quick-sales-search').value);
    const from = document.getElementById('quick-sales-from').value, to = document.getElementById('quick-sales-to').value;
    const status = document.getElementById('quick-sales-status').value;
    const rows = getDBArray('hizliSatislar').filter(s => (status === 'all' || s.status === status) && (!from || s.date >= from) && (!to || s.date <= to) && normalizeSearchText([s.satisNo,s.aciklama,s.customerName,s.tutar,formatCurrency(s.tutar)].join(' ')).includes(query)).sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
    const active = rows.filter(s => s.status === 'active');
    const sum = items => formatCurrency(items.reduce((n,s) => n+s.tutar,0));
    document.getElementById('quick-sales-summary').innerHTML = financeSummaryCard('Geçerli satış',sum(active),`${active.length} satış · seçilen filtreler`) + financeSummaryCard('Nakit tahsilat',sum(active.filter(s => s.kasaTip === 'nakit')),'Geçerli satışlar') + financeSummaryCard('Banka tahsilatı',sum(active.filter(s => s.kasaTip !== 'nakit')),'Geçerli satışlar');
    const pages = Math.max(1,Math.ceil(rows.length/25)); quickSalesPage = Math.min(pages,Math.max(1,quickSalesPage));
    body.innerHTML = rows.slice((quickSalesPage-1)*25,quickSalesPage*25).map(s => `<tr><td><strong>${escapeHTML(s.satisNo)}</strong><small>${escapeHTML(s.tarih)}</small></td><td><strong>${escapeHTML(s.aciklama)}</strong><small>${escapeHTML(s.customerName || 'İsimsiz satış')}${s.stokId ? ' · '+escapeHTML(s.stokMiktar+' '+(s.stokAlan==='kg'?'KG':'adet')+' '+s.stokAdi) : ''}</small></td><td>${escapeHTML(s.kasaAdi)}</td><td class="number-cell">${formatCurrency(s.tutar)}</td><td><span class="finance-status ${s.status==='active'?'success':'review'}">${quickSaleStatusLabel(s)}</span>${s.correctionOf ? '<small>Önceki satışın düzeltmesi</small>' : ''}</td><td><div class="finance-row-actions"><button type="button" class="btn btn-outline" onclick="printQuickSale(${s.id})" aria-label="${escapeHTML(s.satisNo)} yazdır">Yazdır</button>${s.status==='active' ? `<button type="button" class="btn btn-outline" onclick="openQuickSale(${s.id})" aria-label="${escapeHTML(s.satisNo)} düzelt">Düzelt</button><button type="button" class="btn btn-outline" onclick="cancelQuickSale(${s.id})" aria-label="${escapeHTML(s.satisNo)} iptal et">İptal</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6"><div class="finance-empty"><strong>Bu görünümde satış yok.</strong>Yeni Hızlı Satış ile kayıt ekleyebilir veya filtreleri değiştirebilirsiniz.</div></td></tr>';
    document.getElementById('quick-sales-page-info').textContent = `${rows.length} kayıt · Sayfa ${quickSalesPage} / ${pages}`;
    document.getElementById('quick-sales-prev').disabled = quickSalesPage === 1;
    document.getElementById('quick-sales-next').disabled = quickSalesPage === pages;
}
function getQuickSalePrintHTML(sale) {
    return getPrintBrandHTML('Satış Özeti', getPrintMetaHTML([['Satış No',sale.satisNo],['Tarih',sale.tarih],['Durum',quickSaleStatusLabel(sale)]]),sale.issuer) +
        (sale.customerName ? getPrintPartyHTML('Müşteri',sale.customerName) : '') +
        `<table><thead><tr><th scope="col">Açıklama</th><th scope="col" class="number-cell">Tutar (TL)</th></tr></thead><tbody><tr><td>${escapeHTML(sale.aciklama)}${sale.stokId ? `<div class="document-card-detail">${escapeHTML(sale.stokMiktar+' '+(sale.stokAlan==='kg'?'KG':'adet')+' · '+sale.stokAdi)}</div>` : ''}</td><td class="number-cell">${formatCurrency(sale.matrah)}</td></tr><tr><td>KDV (%${escapeHTML(sale.kdvOrani)})</td><td class="number-cell">${formatCurrency(sale.kdvTutari)}</td></tr><tr class="total-row"><td>TOPLAM</td><td class="number-cell">${formatCurrency(sale.tutar)}</td></tr></tbody></table>` +
        `<p>${sale.status === 'active' ? `Tahsil edildi · ${sale.kasaTip === 'nakit' ? 'Nakit' : 'Banka'}` : 'Bu satış kaydı geri alınmıştır.'}</p>`;
}
function printQuickSale(id) {
    const sale = getDBArray('hizliSatislar').find(s => s.id == id); if (!sale) return;
    openPrintPreview('Satış Özeti',getQuickSalePrintHTML(sale),'',{ paymentFooter: true });
}

// Sheet cutting records transfer whole sheets into individually identifiable remnants.
let sheetCutPage = 1;
function getActiveSheetCutForOrder(id) { return getDBArray('sacKesimleri').find(c => c.status === 'active' && String(c.orderId) === String(id)); }
function isSheetCutStockLinked(id) {
    return getDBArray('stoklar').some(s => s.id == id && s.originCutId) || getDBArray('sacKesimleri').some(c => c.stokId == id);
}
function changeSheetStock(stock, field, delta, type, ref, tarih) {
    const before = Number(stock[field]) || 0;
    const after = roundMoney(before + delta);
    if (after < 0) throw new Error('Stok miktarı negatif olamaz.');
    stock[field] = after;
    return addStokMovement(stock, { alan: field, miktar: delta, onceki: before, sonraki: after, tip: type, ref, tarih }).id;
}
function sheetCutOrderUsage(order) {
    return order?.stokDusuldu ? { field: order.stokDusulenAlan || (order.islemTipi === 'hammadde' ? 'kg' : 'miktar'), quantity: Number(order.stokDusulenMiktar) } : getOrderStockUsage(order);
}
function sheetCutInput() {
    const value = name => document.getElementById('sheet-cut-'+name).value;
    return { estimate:document.getElementById('sheet-cut-weight').dataset.estimate==='true', token: value('token'), stockId: value('stock'), orderId: value('order'), quantity: value('quantity'), weight: value('weight'), scrapKg: value('scrap'), note: value('note'),
        pieces: [...document.querySelectorAll('#sheet-cut-rows .sheet-cut-row')].map(row => ({ en: row.querySelector('[data-field="en"]').value, boy: row.querySelector('[data-field="boy"]').value, quantity: row.querySelector('[data-field="quantity"]').value })) };
}
function validateSheetCutInput(input) {
    const stock = getDBArray('stoklar').find(s => String(s.id) === String(input.stockId));
    if (!stock || stock.isPasif) throw new Error('Kesilecek aktif sacı seçin.');
    const en = Number(stock.en), boy = Number(stock.boy), mm = Number(stock.mm);
    if (![en,boy,mm].every(n => Number.isFinite(n) && n > 0)) throw new Error('Kaynak sacın en, boy ve kalınlığı eksik. Önce stok kartını tamamlayın.');
    const quantity = Number(input.quantity), weight = roundMoney(input.weight), scrapKg = roundMoney(input.scrapKg);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Kesime giren adedi pozitif bir tam sayı olarak girin.');
    if (![Number(input.weight),Number(input.scrapKg)].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Ağırlıklar geçerli ve negatif olmayan sayılar olmalıdır.');
    if (plainText(input.note).length > 300) throw new Error('Not en fazla 300 karakter olabilir.');
    const order = input.orderId ? getDBArray('isEmirleri').find(o => String(o.id) === String(input.orderId)) : null;
    if (input.orderId && (!order || order.durum === 'İptal' || String(order.stokId) !== String(stock.id))) throw new Error('İş emri bu saca bağlı değil veya iptal edilmiş.');
    if (order) {
        if (getActiveSheetCutForOrder(order.id)) throw new Error('Bu iş emrinin kesimi zaten kayıtlı. Kesim Geçmişi bölümünü kontrol edin.');
        const usage = sheetCutOrderUsage(order);
        if (!usage || usage.field !== 'miktar' || usage.quantity !== quantity) throw new Error('Kesim adedi iş emrindeki plaka adediyle aynı olmalıdır.');
    }
    const alreadyDeducted = order?.stokDusuldu === true;
    if (!alreadyDeducted && quantity > getAvailableStockQuantity(stock,'miktar',order?.id ?? null)) throw new Error('Kullanılabilir plaka yetersiz. Başka işlere ayrılan plakalar kullanılamaz.');
    const weightAlreadyDeducted = alreadyDeducted && Number(order?.stokDusulenKg) > 0;
    if (weightAlreadyDeducted && weight !== Number(order.stokDusulenKg)) throw new Error('Kesime giren KG, iş emrinde düşülen KG ile aynı olmalıdır.');
    const availableWeight = weightAlreadyDeducted ? 0 : Number(stock.kg) || 0;
    if (availableWeight > 0 && weight <= 0) throw new Error('Bu stokta ağırlık tutuluyor. Kesime giren toplam KG bilgisini girin.');
    if (!weightAlreadyDeducted && weight > getAvailableStockQuantity(stock,'kg',order?.id ?? null)) throw new Error('Kesime giren KG, kullanılabilir stok ağırlığını aşamaz.');
    if (!Array.isArray(input.pieces) || input.pieces.length > 50) throw new Error('En fazla 50 farklı parça ölçüsü ekleyebilirsiniz.');
    const pieces = input.pieces.map(p => {
        const w = Number(p.en), h = Number(p.boy), count = Number(p.quantity);
        if (![w,h].every(n => Number.isFinite(n) && n > 0) || !Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Her parçaya geçerli en, boy ve tam sayı adet girin.');
        if (!((w <= en && h <= boy) || (w <= boy && h <= en))) throw new Error('Kalan parçanın ölçüleri kaynak plakaya sığmalıdır.');
        if(p.kg!==undefined && (!Number.isFinite(Number(p.kg)) || Number(p.kg)<0))throw new Error('Kalan parça KG geçersiz.');
        return { en:w, boy:h, quantity:count, area:w*h*count, kg:p.kg === undefined ? roundMoney(weight * w*h*count/(en*boy*quantity)) : roundMoney(p.kg), cost:roundMoney(Number(stock.maliyet)||0) };
    });
    if (pieces.some(p=>!Number.isFinite(p.kg)||p.kg<0)) throw new Error('Kalan parça ağırlığı geçersiz.');
    const area = pieces.reduce((n,p) => n+p.area,0), sourceArea=en*boy*quantity;
    if (area >= sourceArea) throw new Error('Kalan parçaların toplam alanı kesime giren alandan küçük olmalıdır.');
    const remainingKg = roundMoney(pieces.reduce((n,p) => n+p.kg,0));
    if (roundMoney(remainingKg + scrapKg) > weight) throw new Error('Kalan parçalar ve hurdanın ağırlığı kesime giren ağırlığı aşamaz.');
    return { stock, order, alreadyDeducted, weightAlreadyDeducted, quantity, weight, scrapKg, pieces, area, sourceArea, remainingKg };
}
function registerSheetCutRemainders(cut, stock, pieces, remainingWeightManual=false) {
        for (const piece of pieces) {
            const root = getRootSheetStock(stock);
            if (!root) throw new Error('Sacın ilk stok kaydı bulunamadı. Kesim kaydedilmedi.');
            const remainder = { id:createRecordId(), kodu:root.kodu, rootStockId:root.id, partNo:nextSheetPartNo(root), codeAliases:[...new Set([...getCodeAliases(root),...getCodeAliases(stock)])], cinsi:stock.cinsi, mm:stock.mm, en:piece.en, boy:piece.boy, ebat:`${piece.en}x${piece.boy}`, miktar:piece.quantity, kg:piece.kg, maliyet:piece.cost, costUnit:'kg',
                sahibiTipi:stock.sahibiTipi || 'biz', sahibi:stock.sahibi || 'Biz', cariId:stock.cariId || '', kritikSeviye:0, weightBasis:remainingWeightManual ? 'manual' : 'estimate', weightDensity:stock.weightDensity || null, originCutId:cut.id, sourceStockId:stock.id, tarih:cut.tarih, isPasif:false };
            db.stoklar.push(remainder);
            const movement=addStokMovement(remainder,{tip:'Kesimden Kalan Parça',alan:'miktar',miktar:piece.quantity,onceki:0,sonraki:piece.quantity,ref:cut.kesimNo});
            cut.pieces.push({ ...piece, stockId:remainder.id, code:remainder.kodu, partNo:remainder.partNo, movementId:movement.id });
            if (piece.kg) addStokMovement(remainder,{tip:'Kesimden Kalan Parça',alan:'kg',miktar:piece.kg,onceki:0,sonraki:piece.kg,ref:cut.kesimNo});
        }
}
function prepareSheetCutCandidate(input, undoId = '') {
    const live = db;
    try {
        db = JSON.parse(JSON.stringify(live));
        if (!Array.isArray(db.sacKesimleri)) db.sacKesimleri = [];
        if (undoId) return { candidate: db, cut: undoSheetCutRecords(undoId) };
        if (!input.token || db.sacKesimleri.some(c => c.submitToken === input.token)) throw new Error('Bu kesim zaten kaydedildi veya form geçersiz. Kesim Geçmişi bölümünü kontrol edin.');
        if(input.estimate && !input.orderId) {
            const source=db.stoklar.find(s=>String(s.id)===String(input.stockId));
            if(source && !(Number(source.kg)>0)) {
                const basis=sheetWeightBasis(source);
                changeSheetStock(source,'kg',basis.total,'Ölçüden Tahmini Ağırlık',input.token);
                source.weightBasis='estimate';source.weightDensity=basis.density;
            }
        }
        const v=validateSheetCutInput(input), {stock,order}=v;
        const cut = { id:createRecordId(), kesimNo:generateSerialNo('sacKesim'), submitToken:input.token, status:'active', tarih:new Date().toLocaleDateString('tr-TR'),
            stokId:stock.id, sourceCode:stock.kodu, sourcePartNo:stock.partNo || null, sourceName:stock.cinsi, sourceEn:Number(stock.en), sourceBoy:Number(stock.boy), sourceMm:Number(stock.mm), quantity:v.quantity, consumedKg:v.weight,
            orderId:order?.id || null, orderNo:order?.orderNo || '', alreadyDeducted:v.alreadyDeducted, weightAlreadyDeducted:v.weightAlreadyDeducted, note:plainText(input.note), pieces:[], scrapKg:v.scrapKg, movements:[],
            orderStockBefore:order ? { stokDusuldu:!!order.stokDusuldu, stokDusulenMiktar:order.stokDusulenMiktar || 0, stokDusulenAlan:order.stokDusulenAlan || '', stokDusulenKg:order.stokDusulenKg || 0 } : null };
        if (!v.alreadyDeducted) cut.movements.push(changeSheetStock(stock,'miktar',-v.quantity,'Sac Kesimi',cut.kesimNo));
        if (v.weight && !v.weightAlreadyDeducted) cut.movements.push(changeSheetStock(stock,'kg',-v.weight,'Sac Kesimi',cut.kesimNo));
        if (order && !v.alreadyDeducted) Object.assign(order,{stokDusuldu:true,stokDusulenMiktar:v.quantity,stokDusulenAlan:'miktar',stokDusulenKg:v.weight});
        if (order) order.sheetCutId = cut.id;
        registerSheetCutRemainders(cut,stock,v.pieces,input.remainingWeightManual);
        if (v.scrapKg > 0) {
            const scrap = { id:createRecordId(), cutId:cut.id, cinsi:stock.cinsi, mm:Number(stock.mm), en:0, boy:0, miktar:0, kg:v.scrapKg, tur:'hurda', sahibi:stock.sahibi || 'Biz', sahibiTipi:stock.sahibiTipi || 'biz', cariId:stock.cariId || '', isEmriId:order?.id || null, isEmriNo:order?.orderNo || '', neden:cut.kesimNo+' · Kesim hurdası', tarih:cut.tarih };
            db.fireler.push(scrap);cut.scrapId=scrap.id;
        }
        db.sacKesimleri.push(cut);addAuditLog('Oluşturuldu','Sac Kesimi',cut.id,`${cut.kesimNo} · ${cut.sourceCode} · ${cut.quantity} adet · ${cut.pieces.length} parça ölçüsü`);
        return { candidate:db, cut };
    } finally { db=live; }
}
function sheetCutUndoError(cut, saleId = '') {
    if (cut?.quickSaleId && String(cut.quickSaleId) !== String(saleId)) return 'Bu kesim hızlı satışa bağlı. Hızlı Satış geçmişinden satışı düzeltin veya iptal edin.';
    if (!cut || cut.status !== 'active') return 'Bu kesim daha önce geri alınmış veya bulunamıyor.';
    const linkError=getSheetCutLinkError(cut); if(linkError)return linkError;
    if (!getDBArray('stoklar').some(s => s.id === cut.stokId)) return 'Kaynak stok bulunamadı.';
    if (cut.orderId) {
        const order=getDBArray('isEmirleri').find(o => o.id === cut.orderId);
        if (!order || order.sheetCutId !== cut.id || !order.stokDusuldu || String(order.stokId) !== String(cut.stokId) || Number(order.stokDusulenMiktar) !== cut.quantity) return 'Bağlı iş emrinin stok bilgisi değişmiş. Kesim geri alınamaz.';
    }
    if ((cut.movements || []).some(id => !getDBArray('stokHareketleri').some(m => m.id === id))) return 'Kesimin stok hareketi eksik. Önce kayıtları kontrol edin.';
    for (const p of cut.pieces) {
        const stock=getDBArray('stoklar').find(s => s.id === p.stockId);
        if (!stock || stock.originCutId !== cut.id || stock.miktar !== p.quantity || roundMoney(stock.kg) !== p.kg || stock.isPasif) return `${p.code}: parça miktarı değişmiş veya kayıt eksik. Önce bağlı işlemleri geri alın.`;
        if (getDBArray('sacKesimleri').some(c => c.status === 'active' && c.stokId === stock.id) || getDBArray('isEmirleri').some(o => String(o.stokId) === String(stock.id) && o.durum !== 'İptal') || getDBArray('teklifler').some(q => String(q.stokId) === String(stock.id)) || getDBArray('hizliSatislar').some(s => s.stokId === stock.id && s.status === 'active')) return `${p.code} başka bir işe, teklife veya satışa bağlı. Önce bağlı işlemleri kaldırın veya geri alın.`;
    }
    if (cut.scrapId && !getDBArray('fireler').some(f => f.id === cut.scrapId && f.cutId === cut.id && f.kg === cut.scrapKg)) return 'Kesime bağlı hurda kaydı eksik veya değiştirilmiş.';
    return '';
}
function undoSheetCutRecords(id, saleId = '') {
    const cut=getDBArray('sacKesimleri').find(c => String(c.id) === String(id));
    const error=sheetCutUndoError(cut, saleId); if (error) throw new Error(error);
    const stock=db.stoklar.find(s => s.id === cut.stokId), order=db.isEmirleri.find(o => o.id === cut.orderId);
    const keepDeduction = !cut.alreadyDeducted && order?.durum === 'Teslim Edildi';
    for (const p of cut.pieces) {
        const remainder=db.stoklar.find(s => s.id === p.stockId);
        changeSheetStock(remainder,'miktar',-p.quantity,'Kesim Geri Alma',cut.kesimNo);
        if (p.kg) changeSheetStock(remainder,'kg',-p.kg,'Kesim Geri Alma',cut.kesimNo);
        remainder.isPasif=true;remainder.cutVoided=true;
    }
    if (!cut.alreadyDeducted && !keepDeduction) changeSheetStock(stock,'miktar',cut.quantity,'Kesim Geri Alma',cut.kesimNo);
    if (cut.consumedKg && !cut.weightAlreadyDeducted && !keepDeduction) changeSheetStock(stock,'kg',cut.consumedKg,'Kesim Geri Alma',cut.kesimNo);
    if (order) {
        if (!keepDeduction) Object.assign(order,cut.orderStockBefore);
        delete order.sheetCutId;
    }
    if (cut.scrapId) db.fireler=db.fireler.filter(f => f.id !== cut.scrapId);
    cut.status='cancelled';cut.undoKeptOrderDeduction=keepDeduction;cut.closedAt=new Date().toISOString();
    addAuditLog('Geri Alındı','Sac Kesimi',cut.id,cut.kesimNo+(keepDeduction ? ' · Teslim edilmiş işin stok düşümü korundu.' : ''));
    return cut;
}
async function commitSheetCut(input, undoId='') {
    if (sheetCutSaving || quickSaleSaving || startupHydrationPending || startupPersistenceBlocked) return {success:false,error:'Kayıt işlemi şu anda hazır değil. Lütfen tekrar deneyin.'};
    sheetCutSaving=true;
    const states=[...document.body.children].filter(el => !['SCRIPT','STYLE'].includes(el.tagName)).map(el => [el,el.inert]);
    states.forEach(([el])=>el.inert=true);
    const notice=document.createElement('div');notice.className='quick-sale-saving';notice.setAttribute('role','status');notice.textContent='Sac ve parça stokları kaydediliyor…';document.body.append(notice);
    try { const prepared=prepareSheetCutCandidate(input,undoId);const result=await replaceDatabaseSafely(prepared.candidate);return {...result,cut:result.success?prepared.cut:null}; }
    catch(e) { return {success:false,error:e.message}; }
    finally {sheetCutSaving=false;notice.remove();states.forEach(([el,inert])=>el.inert=inert);}
}
function openSheetCut(stockId='', orderId='') {
    if (sheetCutSaving || quickSaleSaving) return;
    document.getElementById('sheet-cut-stock').innerHTML='<option value="">Sac / parça seçin</option>'+getDBArray('stoklar').filter(s=>!s.isPasif).map(s=>`<option value="${s.id}">${escapeHTML(`${getStockDisplayCode(s)} · ${s.cinsi} · ${s.mm} mm · ${s.ebat}${s.originCutId?' · Kalan Parça':''}`)}</option>`).join('');
    document.getElementById('sheet-cut-stock').value=stockId;
    document.getElementById('sheet-cut-token').value=crypto.randomUUID();
    document.getElementById('sheet-cut-rows').innerHTML='';addSheetCutRow();
    document.getElementById('sheet-cut-scrap').value=0;document.getElementById('sheet-cut-note').value='';document.getElementById('sheet-cut-error').hidden=true;
    updateSheetCutOrders();
    if(orderId){document.getElementById('sheet-cut-order').value=orderId;updateSheetCutSource();}
    openModal('modal-sheet-cut');
}
function updateSheetCutOrders() {
    const id=document.getElementById('sheet-cut-stock').value;
    const orders=getDBArray('isEmirleri').filter(o=>String(o.stokId)===id && o.durum!=='İptal' && sheetCutOrderUsage(o)?.field==='miktar' && !getActiveSheetCutForOrder(o.id));
    document.getElementById('sheet-cut-order').innerHTML='<option value="">Bağımsız kesim (iş emrine bağlı değil)</option>'+orders.map(o=>`<option value="${o.id}">${escapeHTML(`${o.orderNo} · ${o.customerName || ''} · ${sheetCutOrderUsage(o).quantity} adet${o.stokDusuldu?' · Stok daha önce düşüldü':''}`)}</option>`).join('');
    updateSheetCutSource();
}
function updateSheetCutSource() {
    const id=document.getElementById('sheet-cut-stock').value, orderId=document.getElementById('sheet-cut-order').value;
    const stock=getDBArray('stoklar').find(s=>String(s.id)===id), order=getDBArray('isEmirleri').find(o=>String(o.id)===orderId);
    const count=sheetCutOrderUsage(order)?.quantity || 1;
    document.getElementById('sheet-cut-quantity').value=count;document.getElementById('sheet-cut-quantity').readOnly=!!order;
    document.getElementById('sheet-cut-weight').value=Number(order?.stokDusulenKg)>0 ? order.stokDusulenKg : stock && !order?.stokDusuldu && Number(stock.miktar)>0 ? roundMoney((Number(stock.kg)||0)*count/Number(stock.miktar)) : '';
    const weightField=document.getElementById('sheet-cut-weight');weightField.dataset.estimate='false';
    if(stock && !order && !(Number(stock.kg)>0)) {
        try {weightField.value=roundMoney(sheetWeightBasis(stock).total*count/Number(stock.miktar));weightField.dataset.estimate='true';} catch(_) {}
    }
    document.getElementById('sheet-cut-weight').dataset.manual='false';
    document.getElementById('sheet-cut-weight').readOnly=Number(order?.stokDusulenKg)>0;
    document.getElementById('sheet-cut-source-info').textContent=stock ? `${stock.ebat} mm · ${stock.mm} mm kalınlık · Kullanılabilir: ${getAvailableStockQuantity(stock,'miktar',order?.id??null)} adet · Kayıtlı ağırlık: ${stock.kg || 0} KG. ${order?.stokDusuldu ? 'Plaka adedi yeniden düşülmez. Kesime giren KG bilgisini kontrol ederek girin.' : 'Kesilen adet stoktan düşülür. Önerilen KG miktarını kontrol edin.'}` : 'Kesime giren sacı seçin.';
    if(weightField.dataset.estimate==='true')document.getElementById('sheet-cut-source-info').textContent+=' KG ölçülerden tahmini hesaplandı.';
    updateSheetCutSummary();
}
function addSheetCutRow() {
    const container=document.getElementById('sheet-cut-rows');if(container.children.length>=50)return;
    const row=document.createElement('div');row.className='sheet-cut-row';
    row.innerHTML='<label>En (mm)<input data-field="en" type="number" min="0.01" step="0.01" class="form-control" oninput="updateSheetCutSummary()"></label><label>Boy (mm)<input data-field="boy" type="number" min="0.01" step="0.01" class="form-control" oninput="updateSheetCutSummary()"></label><label>Adet<input data-field="quantity" type="number" min="1" step="1" value="1" class="form-control" oninput="updateSheetCutSummary()"></label><button type="button" class="btn btn-outline" aria-label="Parça satırını kaldır" onclick="this.closest(\'.sheet-cut-row\').remove();updateSheetCutSummary()">Kaldır</button>';
    container.append(row);updateSheetCutSummary();
}
function updateSheetCutSummary() {
    const output=document.getElementById('sheet-cut-summary');if(!output)return;
    try {const v=validateSheetCutInput(sheetCutInput());output.textContent=`${v.alreadyDeducted?'Önceden düşülen':'Stoktan düşülecek'}: ${v.quantity} adet · Kalan: ${v.pieces.reduce((n,p)=>n+p.quantity,0)} parça / ${(v.area/1e6).toLocaleString('tr-TR',{maximumFractionDigits:3})} m² · Hurda: ${v.scrapKg} KG`;}
    catch(e){output.textContent=e.message;}
}
async function saveSheetCut() {
    if(!document.getElementById('modal-sheet-cut').classList.contains('active'))return;
    const unlock=beginModalSubmit('modal-sheet-cut');if(!unlock)return;
    try {const result=await commitSheetCut(sheetCutInput());if(!result.success){const error=document.getElementById('sheet-cut-error');error.textContent=result.error;error.hidden=false;error.scrollIntoView?.({block:'nearest'});return;}
        closeModal('modal-sheet-cut');location.hash='scraps';switchView('scraps');renderAll();
        showToast({type:result.backupWarning?'warning':'success',title:'Kesim kaydedildi',message:`${result.cut.kesimNo} · Kalan parçalar stokta kullanıma hazır.${result.backupWarning?' Otomatik yedek alınamadı.':''}`});
    }finally{unlock();}
}
function undoSheetCut(id) {
    const cut=getDBArray('sacKesimleri').find(c=>c.id==id),error=sheetCutUndoError(cut);if(error)return alert(error);
    confirmAction(`${cut.kesimNo} geri alınsın mı? Oluşan parça kayıtları geri alınacak. Teslim edilmiş işin plaka düşümü korunur.`,async()=>{
        const result=await commitSheetCut(null,id);if(!result.success)return alert(result.error);renderAll();showToast({type:result.backupWarning?'warning':'success',title:'Kesim geri alındı',message:result.cut.kesimNo+(result.backupWarning?' · Otomatik yedek alınamadı.':'')});
    },{title:'Kesimi Geri Al',confirmLabel:'Geri Al'});
}
function renderSheetCuts() {
    const body=document.getElementById('sheet-cut-history');if(!body)return;
    const query=normalizeSearchText(document.getElementById('sheet-cut-search').value);
    const rows=getDBArray('sacKesimleri').filter(c=>normalizeSearchText([c.kesimNo,c.sourceCode,codeSearchText(getDBArray('stoklar').find(s=>s.id===c.stokId)),c.sourceName,c.orderNo,...c.pieces.map(p=>p.code+' '+codeSearchText(getDBArray('stoklar').find(s=>s.id===p.stockId)))].join(' ')).includes(query)).slice().reverse();
    const pages=Math.max(1,Math.ceil(rows.length/20));sheetCutPage=Math.max(1,Math.min(pages,sheetCutPage));
    body.innerHTML=rows.slice((sheetCutPage-1)*20,sheetCutPage*20).map(c=>`<tr><td><strong>${escapeHTML(c.kesimNo)}</strong><br>${escapeHTML(c.tarih)}${c.note?'<br>'+escapeHTML(c.note):''}</td><td>${escapeHTML(getStockDisplayCode(getDBArray('stoklar').find(s=>s.id===c.stokId) || {kodu:c.sourceCode,originCutId:c.sourcePartNo,partNo:c.sourcePartNo}))} · ${escapeHTML(c.sourceName)}<br>${escapeHTML(c.quantity)} adet · ${escapeHTML(c.sourceEn)}×${escapeHTML(c.sourceBoy)} mm${c.orderNo?'<br>'+escapeHTML(c.orderNo):''}</td><td>${c.pieces.map(p=>{const stock=getDBArray('stoklar').find(s=>s.id===p.stockId);return `${escapeHTML(getStockDisplayCode(stock || {kodu:p.code,originCutId:p.partNo,partNo:p.partNo}))} · ${escapeHTML(p.en)}×${escapeHTML(p.boy)} mm · ${escapeHTML(p.quantity)} adet <small>(şu an ${stock?.cutVoided?0:stock?.miktar??'—'} adet)</small>`;}).join('<br>')||'Kalan parça yok'}${c.scrapKg?'<br>Hurda: '+escapeHTML(c.scrapKg)+' KG':''}</td><td>${c.status==='active'?`<span class="badge success">Kayıtlı</span><br><button type="button" class="btn btn-outline" onclick="undoSheetCut(${c.id})">Geri Al</button>`:'Geri alındı'}</td></tr>`).join('')||'<tr><td colspan="4" class="finance-empty">Henüz kesim kaydı yok. Kesim / Kalan Parça ile başlayın.</td></tr>';
    document.getElementById('sheet-cut-page').textContent=`${rows.length} kayıt · Sayfa ${sheetCutPage} / ${pages}`;document.getElementById('sheet-cut-prev').disabled=sheetCutPage===1;document.getElementById('sheet-cut-next').disabled=sheetCutPage===pages;
}
function openOrderSheetCut(id) {
    const cut=getActiveSheetCutForOrder(id);
    if(cut)return showSheetCutHistory(cut.id);
    const order=getDBArray('isEmirleri').find(o=>o.id==id);if(order)openSheetCut(order.stokId,order.id);
}
function showSheetCutHistory(id) {
    const cut=getDBArray('sacKesimleri').find(c=>c.id==id);
    document.getElementById('sheet-cut-search').value=cut?.kesimNo || '';
    sheetCutPage=1;location.hash='scraps';switchView('scraps');renderSheetCuts();
}
function getSheetCutLinkError(cut,database=db) {
    if(!Array.isArray(cut.pieces)||!Array.isArray(cut.movements))return 'Kesim parça veya hareket bilgileri eksik.';
    const stock=(database.stoklar || []).find(s=>s.id===cut.stokId);
    if(!stock)return 'Kesimin kaynak stoğu bulunamadı.';
    if(cut.status!=='active')return '';
    const movements=cut.movements.map(id=>(database.stokHareketleri || []).find(m=>m.id===id));
    if(movements.some(m=>!m||m.stokId!==cut.stokId))return 'Kesimin kaynak stok hareketi eksik veya farklı stoğa bağlı.';
    const total=field=>roundMoney(movements.filter(m=>m.alan===field).reduce((n,m)=>n+m.miktar,0));
    if(total('miktar')!==(cut.alreadyDeducted?0:-cut.quantity)||total('kg')!==(cut.weightAlreadyDeducted?0:-cut.consumedKg))return 'Kesimde düşülen adet veya KG kayıtla eşleşmiyor.';
    if(cut.orderId){const order=(database.isEmirleri || []).find(o=>o.id===cut.orderId);if(!order||order.sheetCutId!==cut.id||!order.stokDusuldu||String(order.stokId)!==String(cut.stokId)||Number(order.stokDusulenMiktar)!==cut.quantity)return 'Kesimin iş emri bağlantısı veya stok düşümü tutarsız.';}
    for(const p of cut.pieces){
        const remainder=(database.stoklar || []).find(s=>s.id===p.stockId), movement=(database.stokHareketleri || []).find(m=>m.id===p.movementId);
        if(!remainder||remainder.originCutId!==cut.id||!movement||movement.stokId!==p.stockId||movement.alan!=='miktar'||movement.miktar!==p.quantity)return 'Kalan parçanın stok kaydı veya giriş hareketi eksik.';
        if(p.kg>0 && !(database.stokHareketleri||[]).some(m=>m.stokId===p.stockId&&m.alan==='kg'&&m.ref===cut.kesimNo&&m.miktar===p.kg))return 'Kalan parçanın KG giriş hareketi eksik veya farklı.';
    }
    if(cut.scrapId&&!(database.fireler||[]).some(f=>f.id===cut.scrapId&&f.cutId===cut.id&&f.kg===cut.scrapKg))return 'Kesime bağlı hurda kaydı eksik veya miktarı farklı.';
    return '';
}
function updateSheetCutQuantity() {
    const weight=document.getElementById('sheet-cut-weight');
    const stock=getDBArray('stoklar').find(s=>String(s.id)===document.getElementById('sheet-cut-stock').value);
    if(weight.dataset.manual!=='true'&&!weight.readOnly&&stock&&Number(stock.miktar)>0) {let total=Number(stock.kg)||0;if(weight.dataset.estimate==='true'){try{total=sheetWeightBasis(stock).total;}catch(_){}}weight.value=roundMoney(total*Number(document.getElementById('sheet-cut-quantity').value)/Number(stock.miktar));}
    updateSheetCutSummary();
}

// Rectangular corner cutting yields two non-overlapping remnants per source sheet.
function rectangularSheetRemainders(stock, cutEn, cutBoy, quantity) {
    const width=Number(stock.en),height=Number(stock.boy);
    let en=Number(cutEn),boy=Number(cutBoy);quantity=Number(quantity);
    if (![width,height,en,boy].every(n=>Number.isFinite(n)&&n>0) || !Number.isSafeInteger(quantity) || quantity<1) throw new Error('Önce malzeme, plaka adedi ve kesilen ölçüleri girin.');
    if (!(en<=width && boy<=height)) [en,boy]=[boy,en];
    if (!(en<=width && boy<=height)) throw new Error('Kesilen ölçüler kaynak saca sığmıyor.');
    const pieces=[];
    if(height>boy)pieces.push({en:width,boy:height-boy,quantity});
    if(width>en)pieces.push({en:width-en,boy,quantity});
    return pieces;
}
// A measured sale consumes whole source sheets and registers usable remnants atomically.
function quickSaleCutInput(input, stock) {
    const en=Number(input.cut.en), boy=Number(input.cut.boy), count=Number(input.quantity);
    if (![en,boy].every(n => Number.isFinite(n) && n>0) || !Number.isSafeInteger(count) || count<1) throw new Error('Kesilen ölçüleri ve kullanılan plaka adedini girin.');
    if (!((en<=Number(stock.en) && boy<=Number(stock.boy)) || (boy<=Number(stock.en) && en<=Number(stock.boy)))) throw new Error('Kesilen ölçü kaynak saca sığmıyor.');
    const mode=input.cut.remainderMode || 'manual';
    if(!['auto','manual','none'].includes(mode))throw new Error('Kalan parçanın nasıl kaydedileceğini seçin.');
    let pieces=mode==='auto' ? rectangularSheetRemainders(stock,en,boy,count) : input.cut.pieces;
    if (!Array.isArray(pieces)) throw new Error('Kalan parçaları kontrol edin.');
    if(mode==='none' && pieces.length)throw new Error('Kalan yok seçiliyken kalan parça satırı bulunamaz.');
    if(mode!=='none' && !pieces.length && en*boy<Number(stock.en)*Number(stock.boy))throw new Error('Kalan parçalar boş. Otomatik hesaplamayı seçin veya gerçek kalan ölçüleri girin. Kullanılabilir parça kalmadıysa bunu ayrıca seçin.');
    const remainderArea=pieces.reduce((n,p)=>n+Number(p.en)*Number(p.boy)*Number(p.quantity),0);
    if (!Number.isFinite(remainderArea) || remainderArea+en*boy*count>Number(stock.en)*Number(stock.boy)*count) throw new Error('Kesilen alan ve kalan parçalar kaynak sacın alanını aşıyor.');
    const basis=sheetWeightBasis(stock,input.cut.density),weight=roundMoney(basis.total*count/Number(stock.miktar));
    const manual=input.cut.remainingKg !== undefined && input.cut.remainingKg !== '';
    if (manual) {
        const kg=Number(input.cut.remainingKg);
        if(!Number.isFinite(kg)||kg<=0||kg>weight||!pieces.length||!(remainderArea>0))throw new Error('Tartılan kalan KG, kesime giren ağırlığı aşamaz. Önce kalan parçaları ekleyin.');
        let assigned=0;
        pieces=pieces.map((p,i)=>{const share=i===pieces.length-1?roundMoney(kg-assigned):roundMoney(kg*Number(p.en)*Number(p.boy)*Number(p.quantity)/remainderArea);assigned=roundMoney(assigned+share);return {...p,kg:share};});
    }
    return { token:input.token+'-cut',stockId:stock.id,quantity:count,weight,remainingWeightManual:manual,scrapKg:0,pieces,note:`Hızlı satış · ${en} × ${boy} mm · ${plainText(input.description)}` };
}
function addQuickSaleCutRow(piece={}, refresh=true) {
    const row=document.createElement('div');row.className='sheet-cut-row';
    row.innerHTML='<label>En (mm)<input class="form-control" type="number" min="0.01" step="any" data-field="en"></label><label>Boy (mm)<input class="form-control" type="number" min="0.01" step="any" data-field="boy"></label><label>Adet<input class="form-control" type="number" min="1" step="1" data-field="quantity"></label><button type="button" class="btn btn-outline" aria-label="Kalan parçayı kaldır">×</button>';
    for(const key of ['en','boy','quantity'])row.querySelector(`[data-field="${key}"]`).value=piece[key] || (key==='quantity'?1:'');
    row.oninput=updateQuickSaleWeight;row.querySelector('button').onclick=()=>{row.remove();updateQuickSaleWeight();};document.getElementById('quick-sale-cut-rows').append(row);if(refresh)updateQuickSaleWeight();
}
function suggestQuickSaleRemainders() {
    document.getElementById('quick-sale-remainder-mode').value='auto';
    updateQuickSaleWeight();
}
function updateQuickSaleRemainderMode() {
    if(document.getElementById('quick-sale-remainder-mode').value==='none') {
        document.getElementById('quick-sale-cut-rows').innerHTML='';
        document.getElementById('quick-sale-cut-remaining-kg').value='';
    }
    updateQuickSaleWeight();
}

// Density presets are approximate: SSAB structural steel, Outokumpu cold rolled stainless,
// Hydro aluminium. Units: all dimensions mm, density kg/m³, result kg.
function sheetDensity(material, selected='') {
    if(selected !== '') {
        const value=Number(selected);
        if(![7850,7900,2700].includes(value)) throw new Error('Geçerli malzeme grubu seçin.');
        return value;
    }
    const name=String(material||'').toLocaleLowerCase('tr-TR');
    if(/alüminyum|aluminyum|aluminium|aluminum/.test(name))return 2700;
    if(/paslanmaz|inox|stainless|\b(?:304|316|430)\b/.test(name))return 7900;
    if(/\bst\s*(?:37|44|52)\b|\bs(?:235|275|355)\b|dkp|hrp|siyah sac|galvaniz|karbon|çelik/.test(name))return 7850;
    throw new Error('Malzeme cinsi tanınmadı. Hesap için malzeme grubunu seçin.');
}
function sheetWeightBasis(stock, selected='') {
    if(!stock)throw new Error('Önce sacı seçin.');
    const dims=[stock.en,stock.boy,stock.mm,stock.miktar].map(Number);
    if(!dims.every(n=>Number.isFinite(n)&&n>0))throw new Error('Stok kartında en, boy, kalınlık ve plaka adedi bulunmalıdır.');
    if(Number(stock.kg)>0)return {total:Number(stock.kg),label:stock.weightBasis==='estimate'?'Tahmini KG üzerinden':'Kayıtlı KG üzerinden',density:stock.weightDensity||null};
    const density=sheetDensity(stock.cinsi,selected);
    const total=roundMoney(dims.reduce((a,b)=>a*b,1)*density/1e9);
    if(!Number.isFinite(total)||total<=0)throw new Error('Ölçülerden hesaplanan ağırlık çok küçük veya geçersiz.');
    return {total,label:'Ölçüden tahmini',density};
}
function updateQuickSaleWeight() {
    const target=document.getElementById('quick-sale-weight-summary');if(!target)return;
    const get=n=>document.getElementById('quick-sale-'+n).value;
    const mode=get('remainder-mode'),container=document.getElementById('quick-sale-cut-rows');
    document.getElementById('quick-sale-add-remainder').hidden=mode!=='manual';
    document.getElementById('quick-sale-cut-remaining-kg').disabled=mode==='none';
    if(mode==='auto')container.innerHTML='';
    if(mode==='none')container.innerHTML='';
    try {
        let stock=getDBArray('stoklar').find(s=>String(s.id)===get('stock'));
        const old=getDBArray('hizliSatislar').find(s=>String(s.id)===get('edit-id')&&s.status==='active');
        // Editing previews the same restored source quantities as the atomic commit.
        if(stock&&old?.stokId===stock.id){stock={...stock};if(old.sheetCutId){const c=getDBArray('sacKesimleri').find(c=>c.id===old.sheetCutId);if(c){stock.miktar+=c.quantity;stock.kg+=c.consumedKg;}}else{stock[old.stokAlan]=Number(stock[old.stokAlan]||0)+old.stokMiktar;if(old.stockKg)stock.kg+=old.stockKg;if(old.stockPlateQty)stock.miktar+=old.stockPlateQty;}}
        const basis=sheetWeightBasis(stock,get('cut-density')),qty=Number(get('quantity')),en=Number(get('cut-en')),boy=Number(get('cut-boy'));
        if(!Number.isSafeInteger(qty)||qty<1||en<=0||boy<=0)throw new Error('Kesilen en, boy ve plaka adedini girin; KG hesabı burada görünecek.');
        const weight=roundMoney(basis.total*qty/Number(stock.miktar)),area=Number(stock.en)*Number(stock.boy)*qty;
        if(!((en<=stock.en&&boy<=stock.boy)||(boy<=stock.en&&en<=stock.boy)))throw new Error('Kesilen ölçü kaynak saca sığmıyor.');
        const cut=roundMoney(weight*en*boy*qty/area);
        if(mode==='auto') {
            rectangularSheetRemainders(stock,en,boy,qty).forEach(p=>addQuickSaleCutRow(p,false));
            container.querySelectorAll('input').forEach(el=>el.readOnly=true);
            container.querySelectorAll('button').forEach(el=>el.hidden=true);
        }else container.querySelectorAll('input').forEach(el=>el.readOnly=false);
        if(mode==='manual')container.querySelectorAll('button').forEach(el=>el.hidden=false);
        const rows=[...document.querySelectorAll('#quick-sale-cut-rows .sheet-cut-row')];
        const remainderArea=rows.reduce((sum,row)=>sum+['en','boy','quantity'].reduce((a,k)=>a*Number(row.querySelector('[data-field="'+k+'"]').value),1),0);
        if(!Number.isFinite(remainderArea)||remainderArea+en*boy*qty>area)throw new Error('Kesilen ve kalan alan kaynak sacı aşıyor.');
        const manual=get('cut-remaining-kg')!=='';
        const remain=mode==='none'?0:manual?Number(get('cut-remaining-kg')):rows.length?roundMoney(weight*remainderArea/area):0;
        if(!Number.isFinite(remain)||remain<0||remain>weight)throw new Error('Kalan KG, kesime giren KG aralığında olmalıdır.');
        const kg=n=>n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kg';
        target.textContent=`${basis.label}${basis.density?' · '+basis.density+' kg/m³':''}\nKesime giren: ${kg(weight)} · Kesilen bölüm (tahmini): ${kg(cut)}\nStoğa dönecek kalan: ${kg(remain)}${manual?' (elle girilen tartım)':' (tahmini)'}${mode==='none'?' — kullanılabilir kalan yok olarak kaydedilecek.':!rows.length&&cut<weight?' — kalan ölçülerini girmeden satış kaydedilemez.':''}\nDelikler ve kesim kaybı kesilen bölüm tahmininden ayrıca düşülmez.`;
    }catch(e){target.textContent=e.message;}
}

function calculateNewSheetWeight(apply=false) {
    const get=n=>document.getElementById('input-stok-'+n).value;
    const target=document.getElementById('new-sheet-weight-info');
    try {
        const basis=sheetWeightBasis({en:get('en'),boy:get('boy'),mm:get('mm'),miktar:get('miktar'),cinsi:get('cinsi'),kg:0});
        target.textContent='Ölçüden tahmini toplam: '+basis.total.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' KG. Tartım varsa ağırlık alanına onu yazın.';
        const field=document.getElementById('input-stok-kg');
        if(apply || field.dataset.basis==='estimate'){field.value=basis.total;field.dataset.basis='estimate';}
        return true;
    }catch(e){target.textContent=e.message;return false;}
}

// Physical pieces keep distinct IDs for stock usage, but share their original stock card code.
function getRootSheetStock(stock, database = db) {
    const byId = new Map((database.stoklar || []).map(s => [String(s.id), s]));
    const cuts = new Map((database.sacKesimleri || []).map(c => [String(c.id), c]));
    const seen = new Set();
    while (stock?.originCutId) {
        if (seen.has(String(stock.id))) return null;
        seen.add(String(stock.id));
        stock = byId.get(String(stock.sourceStockId || cuts.get(String(stock.originCutId))?.stokId));
    }
    return stock?.kodu ? stock : null;
}
function nextSheetPartNo(root, database = db) {
    return 1 + (database.stoklar || []).reduce((max, stock) =>
        stock.kodu === root.kodu ? Math.max(max, Number(stock.partNo) || 0) : max, 0);
}
function getStockDisplayCode(stock) {
    return stock ? (stock.kodu || '-') + (stock.originCutId && stock.partNo ? ` · Parça ${stock.partNo}` : '') : '-';
}
function migrateStockIdentity(database) {
    const stocks = database.stoklar || [];
    for (const stock of stocks) {
        if (!stock.originCutId) continue;
        const root = getRootSheetStock(stock, database);
        if (!root) { stock.identityReviewRequired = true; continue; }
        if (!stock.identityMigration) stock.identityMigration = {version:8, previousCode:stock.kodu};
        stock.kodu = root.kodu;
        stock.rootStockId = root.id;
        if (!Number.isSafeInteger(stock.partNo) || stock.partNo < 1) stock.partNo = nextSheetPartNo(root, database);
        stock.identityReviewRequired = false;
    }
    const byId = new Map(stocks.map(s => [String(s.id), s]));
    for (const cut of database.sacKesimleri || []) {
        const source = byId.get(String(cut.stokId));
        if (source && !source.identityReviewRequired) {
            if (cut.sourceCode !== source.kodu && cut.previousSourceCode === undefined) cut.previousSourceCode = cut.sourceCode;
            cut.sourceCode = source.kodu;
            cut.sourcePartNo = source.partNo || null;
        }
        for (const piece of cut.pieces || []) {
            const stock = byId.get(String(piece.stockId));
            if (!stock || stock.identityReviewRequired) continue;
            if (piece.code !== stock.kodu && piece.previousCode === undefined) piece.previousCode = piece.code;
            piece.code = stock.kodu;
            piece.partNo = stock.partNo;
        }
    }
}

// Legacy root values were entered by this business as TL/kg, despite the former plate label.
// Retain original values for traceability and repair generated remnants via their source chain.
function migrateStockKgCosts(database) {
    const stocks=database.stoklar || [], byId=new Map(stocks.map(s=>[String(s.id),s]));
    const resolved=new Set(), visiting=new Set();
    function resolve(stock) {
        const key=String(stock.id);if(resolved.has(key))return !stock.costReviewRequired;
        if(visiting.has(key))return false;
        visiting.add(key);
        const previous=stock.maliyet;
        let valid=true;
        if(stock.originCutId) {
            const cut=(database.sacKesimleri||[]).find(c=>String(c.id)===String(stock.originCutId));
            const parent=byId.get(String(stock.sourceStockId || cut?.stokId));
            valid=!!parent && parent!==stock && resolve(parent);
            if(valid)stock.maliyet=parent.maliyet;
        }
        stock.costUnit='kg';stock.costReviewRequired=!valid;
        stock.costMigration={version:7,previousValue:previous,sourceStockId:stock.sourceStockId || null};
        visiting.delete(key);resolved.add(key);return valid;
    }
    stocks.forEach(resolve);
    for(const cut of database.sacKesimleri || []) {
        for(const piece of cut.pieces || []) {
            const stock=byId.get(String(piece.stockId));
            if(stock && !stock.costReviewRequired){piece.previousCost=piece.cost;piece.cost=stock.maliyet;piece.costUnit='kg';}
        }
    }
}
function getStockPlateWeight(stock) {
    if(!stock)return 0;
    if(Number(stock.miktar)>0 && Number(stock.kg)>0)return Number(stock.kg)/Number(stock.miktar);
    const ownCut=getDBArray('sacKesimleri').find(c=>String(c.id)===String(stock.originCutId));
    const piece=ownCut?.pieces?.find(p=>String(p.stockId)===String(stock.id));
    if(Number(piece?.quantity)>0 && Number(piece.kg)>0)return Number(piece.kg)/Number(piece.quantity);
    const cut=getDBArray('sacKesimleri').find(c=>String(c.stokId)===String(stock.id)&&Number(c.quantity)>0&&Number(c.consumedKg)>0);
    if(cut)return Number(cut.consumedKg)/Number(cut.quantity);
    try{return sheetWeightBasis({...stock,kg:0,miktar:1}).total;}catch(_){return 0;}
}
function getStockPlateCost(stock) {
    return !stock || stock.sahibiTipi==='musteri' ? 0 : roundMoney((Number(stock.maliyet)||0)*getStockPlateWeight(stock));
}
function getStockTotalCost(stock) {
    return stock.sahibiTipi==='musteri' ? 0 : roundMoney((Number(stock.maliyet)||0)*(Number(stock.kg)||0));
}

function resetSheetPurchaseForm() {
    const set=(n,v='')=>document.getElementById('sheet-purchase-'+n).value=v;
    document.querySelectorAll('#sheet-purchase-lines .sheet-purchase-line:not([data-first])').forEach(row=>row.remove());
    for(const key of ['material','mm','en','boy','weight','price','paid'])set(key);
    set('total-mode','calculated');set('document-total','');set('quantity',1);set('tax',0);set('payment','none');set('date',toDateInputValue(new Date()));set('token',crypto.randomUUID());
    document.getElementById('sheet-purchase-weight').dataset.basis='manual';
    document.querySelector('#sheet-purchase-lines .sheet-purchase-line').dataset.stockId='';
    document.getElementById('sheet-purchase-cash').innerHTML='<option value="">Hesap seçin</option>'+getDBArray('kasaHesaplari').filter(isCashAccountActive).map(k=>`<option value="${k.id}">${escapeHTML(k.ad)}</option>`).join('');
    document.getElementById('sheet-purchase-error').hidden=true;
}
function sheetPurchaseInput() {
    const get=n=>document.getElementById('sheet-purchase-'+n).value;
    return {totalMode:get('total-mode'),documentTotal:get('document-total'),lines:readSheetPurchaseLines(),token:get('token'),cariId:document.getElementById('input-islem-cari-id').value,material:get('material'),mm:get('mm'),en:get('en'),boy:get('boy'),quantity:get('quantity'),weight:get('weight'),price:get('price'),tax:get('tax'),date:get('date'),payment:get('payment'),paid:get('paid'),cashId:get('cash'),weightBasis:document.getElementById('sheet-purchase-weight').dataset.basis,description:document.getElementById('input-islem-aciklama').value,attachment:getAttachmentFromInputs('input-islem-ek','input-islem-ek-not')};
}
function updateSheetPurchaseSummary(preserveAmountInput=false) {
    const get=n=>document.getElementById('sheet-purchase-'+n).value;
    renderPurchaseCodeHints();
    const lines=readSheetPurchaseLines(),base=roundMoney(lines.reduce((sum,line)=>sum+roundMoney(Number(line.weight)*Number(line.price)),0)),tax=roundMoney(lines.reduce((sum,line)=>sum+roundMoney(roundMoney(Number(line.weight)*Number(line.price))*Number(line.tax)/100),0)),calculatedTotal=roundMoney(base+tax),manual=get('total-mode')==='document',parsed=manual?parseSheetPurchaseDocumentTotal(get('document-total')):calculatedTotal,total=Number.isFinite(parsed)?parsed:0,mode=get('payment'),paid=mode==='none'?0:mode==='full'?total:roundMoney(get('paid'));
    document.getElementById('sheet-purchase-document-total-label').hidden=true;
    document.getElementById('sheet-purchase-paid-label').hidden=mode!=='partial';document.getElementById('sheet-purchase-cash-label').hidden=mode==='none';
    document.getElementById('sheet-purchase-summary').textContent=`${lines.length} kalem · ${roundMoney(lines.reduce((sum,line)=>sum+Number(line.weight||0),0))} KG · Kalem hesabı (KDV dahil): ${formatCurrency(calculatedTotal)}${manual?' · Belge toplamı: '+(Number.isFinite(parsed)?formatCurrency(total):'Tutar girin')+' · Tutar farkı: '+(Number.isFinite(parsed)?formatCurrency(roundMoney(total-calculatedTotal)):'—'):''} · Ödenecek kalan: ${manual&&!Number.isFinite(parsed)?'—':formatCurrency(total-paid)}`;
    if(document.getElementById('input-islem-tipi').value==='sac_alimi'&&!preserveAmountInput)document.getElementById('input-islem-tutar').value=manual?(Number.isFinite(parsed)?String(total):get('document-total')):total||'';
}
function calculateSheetPurchaseWeight(button) {
    const row=button?.closest('.sheet-purchase-line');
    const field=n=>row&&!row.dataset.first?row.querySelector('[data-field="'+n+'"]'):document.getElementById('sheet-purchase-'+n);
    try{const get=n=>field(n).value;
        const basis=sheetWeightBasis({cinsi:get('material'),mm:get('mm'),en:get('en'),boy:get('boy'),miktar:get('quantity'),kg:0});
        field('weight').value=basis.total;field('weight').dataset.basis='estimate';updateSheetPurchaseSummary();
    }catch(e){alert(e.message);}
}
function sheetPurchaseUndoError(movement) {
    if(!movement?.sheetPurchase || movement.reversedBy)return 'Bu alım bulunamadı veya daha önce geri alındı.';
    const linkError=getSheetPurchaseLinkError(movement);if(linkError)return linkError;
    const p=movement.sheetPurchase;
    for(const line of sheetPurchaseLines(p)) {
        const stock=getDBArray('stoklar').find(s=>s.id===line.stockId);
        if(!stock || stock.purchaseMovementId!==movement.id || stock.isPasif || Number(stock.miktar)!==line.quantity || roundMoney(stock.kg)!==line.weight)return 'Alınan sacın miktarı değişmiş. Önce bağlı kullanımları geri alın.';
        if(getDBArray('sacKesimleri').some(c=>c.status==='active'&&c.stokId===stock.id)||getDBArray('isEmirleri').some(o=>String(o.stokId)===String(stock.id)&&o.durum!=='İptal')||getDBArray('teklifler').some(q=>String(q.stokId)===String(stock.id))||getDBArray('hizliSatislar').some(q=>q.status==='active'&&q.stokId===stock.id))return 'Sac kesime, satışa, teklife veya iş emrine bağlı. Önce bağlı işlemleri geri alın.';
    }
    if(movement.bakiyeDegisimi!==-p.total||roundMoney(movement.tutar)!==p.total)return 'Alımın cari tutarı tutarsız.';
    if(p.paid>0){const payment=getDBArray('islemler').find(m=>m.id===p.paymentId),cash=getDBArray('kasaHareketleri').find(m=>m.id===p.cashMovementId);
        if(!payment||payment.reversedBy||payment.bakiyeDegisimi!==p.paid||payment.sheetPurchasePaymentFor!==movement.id||!cash||cash.reversedBy||cash.tip!=='cikis'||cash.tutar!==p.paid||cash.refId!==payment.id)return 'Alıma bağlı ödeme kaydı eksik veya değiştirilmiş.';}
    return '';
}
function reverseSheetPurchaseRecords(original) {
    const error=sheetPurchaseUndoError(original);if(error)throw Error(error);
    const p=original.sheetPurchase,cari=db.cariler.find(c=>c.id===original.cariId);if(!cari)throw Error('Tedarikçi bulunamadı.');
    const reversal=addCariMovement(cari,{tip:'Sac Alımı Geri Alma',tutar:p.total,bakiyeDegisimi:p.total,reversalOf:original.id,aciklama:p.code});original.reversedBy=reversal.id;
    if(p.paid>0){const payment=db.islemler.find(m=>m.id===p.paymentId);const rev=addCariMovement(cari,{tip:'Sac Alımı Ödemesi Geri Alma',tutar:p.paid,bakiyeDegisimi:-p.paid,reversalOf:payment.id,aciklama:p.code});payment.reversedBy=rev.id;const cash=reverseCashMovement(p.cashMovementId,p.code+' alımı geri alındı');if(!cash)throw Error('Ödeme geri alınamadı.');rev.kasaHareketId=cash.id;}
    for(const line of sheetPurchaseLines(p)){const stock=db.stoklar.find(s=>s.id===line.stockId);changeSheetStock(stock,'miktar',-line.quantity,'Sac Alımı Geri Alma',p.code);changeSheetStock(stock,'kg',-line.weight,'Sac Alımı Geri Alma',p.code);stock.isPasif=true;stock.purchaseVoided=true;}
    addAuditLog('Geri Alındı','Sac Alımı',original.id,p.code);
}
function prepareSheetPurchaseCandidate(input,editId='',cancel=false) {
    const live=db;try{
        db=JSON.parse(JSON.stringify(live));const previous=editId?db.islemler.find(m=>String(m.id)===String(editId)):null;
        if(editId&&!previous)throw Error('Alım kaydı bulunamadı.');
        if(cancel){reverseSheetPurchaseRecords(previous);return {candidate:db,movement:previous};}
        if(!input?.token||db.islemler.some(m=>m.sheetPurchase?.token===input.token))throw Error('Bu alım zaten kaydedildi. Cari geçmişini kontrol edin.');
        const cari=db.cariler.find(c=>String(c.id)===String(input.cariId)&&!c.isPasif&&!c.systemRole);if(!cari)throw Error('Aktif tedarikçi carisi seçin.');
        const rawLines=input.lines===undefined?[input]:input.lines;
        if(!Array.isArray(rawLines)||rawLines.length<1||rawLines.length>100)throw Error('1 ile 100 arasında sac kalemi girin.');
        const lines=rawLines.map((line,index)=>validateSheetPurchaseLine(line,index));
        if(plainText(input.description).length>300)throw Error('Açıklamayı kontrol edin.');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date||'')||financeDay(input.date)===null)throw Error('Geçerli alış tarihi girin.');
        const base=roundMoney(lines.reduce((sum,line)=>sum+line.base,0)),taxAmount=roundMoney(lines.reduce((sum,line)=>sum+line.taxAmount,0)),calculatedTotal=roundMoney(base+taxAmount);
        const totalMode=input.totalMode||'calculated';if(!['calculated','document'].includes(totalMode))throw Error('Alış toplamının nasıl belirleneceğini seçin.');
        const total=totalMode==='document'?parseSheetPurchaseDocumentTotal(input.documentTotal):calculatedTotal,totalAdjustment=roundMoney(total-calculatedTotal);
        if(!Number.isFinite(total)||total<=0||total>1e12)throw Error('Alış tutarı geçersiz.');
        if(!['none','partial','full'].includes(input.payment))throw Error('Ödeme durumunu seçin.');
        const paid=input.payment==='none'?0:input.payment==='full'?total:roundMoney(input.paid);
        if(input.payment==='partial'&&(!Number.isFinite(Number(input.paid))||paid<=0||paid>=total))throw Error('Kısmi ödeme toplamdan küçük ve sıfırdan büyük olmalıdır.');
        const account=paid>0?db.kasaHesaplari.find(k=>String(k.id)===String(input.cashId)&&isCashAccountActive(k)):null;if(paid>0&&!account)throw Error('Ödemenin çıktığı aktif kasa/banka hesabını seçin.');
        if(previous)reverseSheetPurchaseRecords(previous);
        const previousLines=previous ? sheetPurchaseLines(previous.sheetPurchase) : [];
        const reusedStockIds=new Set();
        const stocks=lines.map((line,index)=>{
            const raw=rawLines[index];
            const existingId=raw.existingStockId === undefined ? previousLines[index]?.stockId : raw.existingStockId;
            const priorLine=existingId ? previousLines.find(p=>String(p.stockId)===String(existingId)) : null;
            if(existingId && (!priorLine || reusedStockIds.has(String(existingId))))throw Error('Düzeltilen sac kaleminin stok bağlantısı geçersiz.');
            if(priorLine)reusedStockIds.add(String(existingId));
            const oldStock=priorLine ? db.stoklar.find(s=>s.id===priorLine.stockId) : null;
            const stock={id:createRecordId(),kodu:oldStock && thicknessCodeKey(oldStock.mm)===thicknessCodeKey(line.mm) ? oldStock.kodu : stockCodeForThickness(line.mm, true),cinsi:line.material,mm:line.mm,en:line.en,boy:line.boy,ebat:line.en+'x'+line.boy,miktar:line.quantity,kg:line.weight,maliyet:line.price,costUnit:'kg',weightBasis:line.weightBasis,sahibiTipi:'biz',sahibi:'Biz',cariId:'',supplierId:cari.id,kritikSeviye:0,tarih:toTRDateFromInput(input.date),isPasif:false};
            if(oldStock){stock.codeAliases=getCodeAliases(oldStock);rememberDisplayCode(stock,oldStock.kodu);}
            db.stoklar.push(stock);line.stockId=stock.id;line.stockCode=stock.kodu;return stock;
        });
        const code='ALM-'+stocks[0].kodu;
        const purchase={...lines[0],lines,token:input.token,code,base,taxAmount,total,calculatedTotal,totalMode,totalAdjustment,documentTotal:totalMode==='document'?total:null,paid,payment:input.payment,cashId:account?.id||null,date:input.date,description:plainText(input.description)};
        const details=lines.map(line=>`${line.material} ${line.mm} mm ${line.en}×${line.boy} · ${line.quantity} plaka · ${line.weight} KG × ${formatCurrency(line.price)}/KG`).join(' / ');
        const movement=addCariMovement(cari,{tip:'Sac Mal Alımı',tutar:total,bakiyeDegisimi:-total,isSuccess:false,isGelir:false,tarih:stocks[0].tarih,aciklama:`${code} · ${details}${totalMode==='document'?' · Belge toplamı '+formatCurrency(total)+' · Tutar farkı '+formatCurrency(totalAdjustment):''}${input.description?' · '+plainText(input.description):''}`,sheetPurchase:purchase,ek:input.attachment||previous?.ek||null});
        lines.forEach((line,index)=>{const stock=stocks[index];stock.purchaseMovementId=movement.id;line.stockMovements=['miktar','kg'].map(alan=>addStokMovement(stock,{alan,miktar:stock[alan],onceki:0,sonraki:stock[alan],tip:'Sac Alımı',ref:code,tarih:stocks[0].tarih}).id);});
        purchase.stockMovements=lines[0].stockMovements;
        if(paid>0){const payment=addCariMovement(cari,{tip:'Ödeme Yaptık (Sac Alımı)',tutar:paid,bakiyeDegisimi:paid,isSuccess:true,isGelir:false,tarih:stocks[0].tarih,aciklama:code,sheetPurchasePaymentFor:movement.id});const cash=addCashMovement(account.id,{tip:'cikis',tutar:paid,kaynak:'sac-alimi',refId:payment.id,tarih:stocks[0].tarih,aciklama:cari.adi+' · '+code});if(!cash)throw Error('Ödeme kaydedilemedi.');payment.kasaHareketId=cash.id;purchase.paymentId=payment.id;purchase.cashMovementId=cash.id;}
        if(previous)previous.correctedBy=movement.id;addAuditLog('Oluşturuldu','Sac Alımı',movement.id,code+' · '+formatCurrency(total));return {candidate:db,movement};
    }finally{db=live;}
}
async function commitSheetPurchase(input,editId='',cancel=false) {
    if(sheetCutSaving||quickSaleSaving||startupHydrationPending||startupPersistenceBlocked)return {success:false,error:'Bir kayıt işlemi devam ediyor veya veriler hazır değil.'};
    sheetCutSaving=true;const surfaces=[...document.body.children].filter(e=>!['SCRIPT','STYLE'].includes(e.tagName)),states=surfaces.map(e=>[e,e.inert]);surfaces.forEach(e=>e.inert=true);const notice=document.createElement('div');notice.className='quick-sale-saving';notice.textContent='Sac alımı ve stok kaydediliyor…';notice.setAttribute('role','status');document.body.append(notice);
    try{const prepared=prepareSheetPurchaseCandidate(input,editId,cancel);const result=await replaceDatabaseSafely(prepared.candidate);return {...result,movement:result.success?prepared.movement:null};}catch(e){return {success:false,error:e.message};}finally{sheetCutSaving=false;notice.remove();states.forEach(([e,value])=>e.inert=value);}
}
async function saveSheetPurchase() {
    const unlock=beginModalSubmit('modal-islem');if(!unlock)return;
    try{const input=sheetPurchaseInput();const previous=getDBArray('islemler').find(m=>String(m.id)===document.getElementById('input-islem-edit-id').value);if(previous?.ek&&!document.getElementById('input-islem-ek').files?.length)input.attachment={...previous.ek,note:plainText(document.getElementById('input-islem-ek-not').value)};const result=await commitSheetPurchase(input,document.getElementById('input-islem-edit-id').value);if(!result.success){const el=document.getElementById('sheet-purchase-error');el.textContent=result.error;el.hidden=false;el.scrollIntoView?.({block:'nearest'});return;}
        scheduleAttachmentArchive(input.attachment,'Cari Islemler',getDBArray('cariler').find(c=>c.id===result.movement.cariId)?.adi||'Tedarikçi');closeModal('modal-islem');renderAll();showToast({type:result.backupWarning?'warning':'success',title:'Sac alımı kaydedildi',message:result.movement.sheetPurchase.code+' · Stok ve tedarikçi hesabı güncellendi.'+(result.backupWarning?' Otomatik yedek alınamadı.':'')});
    }finally{unlock();}
}
function openEditSheetPurchase(movement) {
    if(movement.reversedBy)return alert('Bu alım daha önce geri alındı.');const cari=getDBArray('cariler').find(c=>c.id===movement.cariId);if(!cari)return alert('Tedarikçi bulunamadı.');
    openIslemModal(cari.id,cari.adi);document.getElementById('input-islem-edit-id').value=movement.id;document.getElementById('input-islem-tipi').value='sac_alimi';const p=movement.sheetPurchase;
    const lines=sheetPurchaseLines(p);document.querySelector('#sheet-purchase-lines .sheet-purchase-line').dataset.stockId=lines[0].stockId;for(const key of ['material','mm','en','boy','quantity','weight','price','tax'])document.getElementById('sheet-purchase-'+key).value=lines[0][key];for(const line of lines.slice(1))addSheetPurchaseLine(line);for(const key of ['date','payment','paid'])document.getElementById('sheet-purchase-'+key).value=p[key];document.getElementById('sheet-purchase-total-mode').value=p.totalMode||'calculated';document.getElementById('sheet-purchase-document-total').value=p.totalMode==='document'?Number(p.total).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';document.getElementById('sheet-purchase-cash').value=p.cashId||'';document.getElementById('sheet-purchase-weight').dataset.basis=p.weightBasis;document.getElementById('input-islem-aciklama').value=p.description||'';document.getElementById('input-islem-ek-not').value=movement.ek?.note||'';document.getElementById('islem-existing-attachment-note').hidden=!movement.ek;document.getElementById('islem-edit-notice').hidden=false;document.getElementById('btn-islem-save').textContent='Düzeltmeyi Kaydet';document.getElementById('input-islem-tipi').disabled=true;document.getElementById('modal-islem-title').textContent=cari.adi+' · Sac Alımını Düzelt';updateIslemTipiInfo();markModalFormClean('modal-islem');
}
function cancelSheetPurchase(id) {
    const original=getDBArray('islemler').find(m=>String(m.id)===String(id));const error=sheetPurchaseUndoError(original);if(error)return alert(error);
    confirmAction('Sac alımı geri alınsın mı? Alınan stok kaldırılacak; tedarikçi borcu ve bu alımda yapılan ödeme geri alınacak.',async()=>{const result=await commitSheetPurchase(null,id,true);if(!result.success)return alert(result.error);renderAll();showToast({type:result.backupWarning?'warning':'success',title:'Sac alımı geri alındı',message:original.sheetPurchase.code+(result.backupWarning?' · Otomatik yedek alınamadı.':'')});},{title:'Sac Alımını Geri Al',confirmLabel:'Geri Al'});
}

// Validate purchase links independently of current stock usage: purchased plates may already be cut.
function getSheetPurchaseLinkError(movement,database=db) {
    const p=movement?.sheetPurchase;if(!p)return 'Sac alım bilgisi eksik.';
    if(!(database.cariler||[]).some(c=>c.id===movement.cariId))return 'Sac alımının tedarikçisi bulunamadı.';
    const lines=sheetPurchaseLines(p);if(!lines.length||lines.length>100||new Set(lines.map(line=>line.stockId)).size!==lines.length)return 'Sac alımı kalemleri eksik veya tekrarlı.';
    let base=0,tax=0;
    for(const line of lines){
        const stock=(database.stoklar||[]).find(s=>s.id===line.stockId);
        if(!stock||stock.purchaseMovementId!==movement.id||stock.supplierId!==movement.cariId||stock.sahibiTipi!=='biz')return 'Sac alımının stok veya tedarikçi bağlantısı tutarsız.';
        let checked;try{checked=validateSheetPurchaseLine(line);}catch(_){return 'Sac alımı kaleminin KG, ölçü veya fiyatı geçersiz.';}
        if(line.base!==checked.base||line.taxAmount!==checked.taxAmount||line.total!==checked.total)return 'KG, KG fiyatı ve KDV tutarı eşleşmiyor.';
        base=roundMoney(base+line.base);tax=roundMoney(tax+line.taxAmount);
        if(!Array.isArray(line.stockMovements)||line.stockMovements.length!==2)return 'Sac alımının stok giriş hareketleri eksik.';
        for(const [index,field] of ['miktar','kg'].entries()){
            const row=(database.stokHareketleri||[]).find(r=>r.id===line.stockMovements[index]),amount=field==='kg'?line.weight:line.quantity;
            if(!row||row.stokId!==stock.id||row.alan!==field||row.miktar!==amount||row.onceki!==0||row.sonraki!==amount||row.ref!==p.code)return 'Sac alımının stok giriş hareketleri tutarsız.';
        }
        if(movement.reversedBy&&(!stock.purchaseVoided||!stock.isPasif||stock.miktar!==0||stock.kg!==0))return 'Geri alınan alımın stoku hâlâ aktif.';
        if(!movement.reversedBy&&(stock.purchaseVoided||stock.isPasif))return 'Sac alımının stok kartı pasif.';
    }
    const calculatedTotal=roundMoney(base+tax),mode=p.totalMode||'calculated',adjustment=p.totalAdjustment??0;
    if(!['calculated','document'].includes(mode)||!Number.isFinite(adjustment)||!Number.isFinite(p.total)||p.total<=0||p.total>1e12||(p.calculatedTotal!==undefined&&p.calculatedTotal!==calculatedTotal)||(mode==='calculated'&&adjustment!==0)||(mode==='document'&&p.documentTotal!==p.total)||p.base!==base||p.taxAmount!==tax||p.total!==roundMoney(calculatedTotal+adjustment)||movement.tutar!==p.total||movement.bakiyeDegisimi!==-p.total)return 'Kalem hesabı, belge tutarı farkı ve cari toplamı eşleşmiyor.';
    if(!Number.isFinite(p.paid)||p.paid<0||p.paid>p.total||!['none','partial','full'].includes(p.payment)||(p.payment==='none'&&p.paid!==0)||(p.payment==='full'&&p.paid!==p.total)||(p.payment==='partial'&&(p.paid<=0||p.paid>=p.total)))return 'Sac alımının ödeme tutarı tutarsız.';
    if(p.paid>0){
        const payment=(database.islemler||[]).find(m=>m.id===p.paymentId),cash=(database.kasaHareketleri||[]).find(m=>m.id===p.cashMovementId);
        if(!payment||payment.cariId!==movement.cariId||payment.tutar!==p.paid||payment.bakiyeDegisimi!==p.paid||payment.sheetPurchasePaymentFor!==movement.id||payment.kasaHareketId!==p.cashMovementId||!cash||cash.kaynak!=='sac-alimi'||cash.tip!=='cikis'||cash.tutar!==p.paid||cash.refId!==payment.id||cash.kasaId!==p.cashId||!(database.kasaHesaplari||[]).some(k=>k.id===p.cashId))return 'Sac alımının ödeme ve kasa bağlantısı tutarsız.';
        if(Boolean(payment.reversedBy)!==Boolean(movement.reversedBy)||Boolean(cash.reversedBy)!==Boolean(movement.reversedBy))return 'Sac alımının geri alınan ödeme bağlantısı tutarsız.';
    }else if(p.paymentId||p.cashMovementId)return 'Ödenmeyen sac alımında ödeme bağlantısı var.';
    return '';
}

// Legacy purchases contain a single line directly on the purchase object.
function sheetPurchaseLines(purchase) { return Array.isArray(purchase.lines)?purchase.lines:[purchase]; }
function validateSheetPurchaseLine(line,index=0) {
    const quantity=Number(line.quantity),weight=roundMoney(line.weight),price=roundMoney(line.price),mm=Number(line.mm),en=Number(line.en),boy=Number(line.boy),tax=Number(line.tax),material=plainText(line.material);
    if(!thicknessCodeKey(line.mm)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||![mm,en,boy,Number(line.weight),Number(line.price)].every(n=>Number.isFinite(n)&&n>0)||weight<=0||price<=0)throw Error(`${index+1}. kalem: Geçerli ölçüler, tam plaka adedi, KG ve KG alış fiyatı girin.`);
    if(![0,20].includes(tax))throw Error(`${index+1}. kalem: KDV %0 veya %20 olmalıdır.`);
    if(!material||material.length>120)throw Error(`${index+1}. kalem: Sac cinsini girin.`);
    const base=roundMoney(weight*price),taxAmount=roundMoney(base*tax/100),total=roundMoney(base+taxAmount);
    if(!Number.isFinite(total)||total<=0||total>1e12)throw Error(`${index+1}. kalem: Alış tutarı geçersiz.`);
    return {material,quantity,weight,price,mm,en,boy,tax,base,taxAmount,total,weightBasis:line.weightBasis==='estimate'?'estimate':'manual'};
}
function readSheetPurchaseLines() {
    return [...document.querySelectorAll('#sheet-purchase-lines .sheet-purchase-line')].map(row=>{
        const field=n=>row.dataset.first?document.getElementById('sheet-purchase-'+n):row.querySelector(`[data-field="${n}"]`);
        return {existingStockId:row.dataset.stockId || '',...Object.fromEntries(['material','mm','en','boy','quantity','weight','price','tax'].map(n=>[n,field(n).value])),weightBasis:field('weight').dataset.basis||'manual'};
    });
}
function addSheetPurchaseLine(values={}) {
    const container=document.getElementById('sheet-purchase-lines');if(container.children.length>=100)return alert('En fazla 100 sac kalemi eklenebilir.');
    const row=document.createElement('section');row.className='sheet-purchase-line';row.dataset.stockId=values.stockId || '';
    const input=(key,label,placeholder='',wide=false)=>`<label class="${wide?'quick-sale-wide':''}">${label}<input data-field="${key}" class="form-control" ${key==='material'?'maxlength="120"':'type="number" min="0.01" step="'+(key==='quantity'?'1':'any')+'"'} placeholder="${placeholder}" oninput="${key==='weight'?"this.dataset.basis='manual';":''}updateSheetPurchaseSummary()"></label>`;
    row.innerHTML=`<p class="stock-code-hint" aria-live="polite"></p><div class="sheet-purchase-line-heading"><strong></strong><button type="button" class="btn btn-outline" onclick="this.closest('.sheet-purchase-line').remove();renumberSheetPurchaseLines();updateSheetPurchaseSummary()" aria-label="Bu sac kalemini kaldır">Kalemi kaldır</button></div><div class="quick-sale-fields">${input('material','Sac cinsi / kalite','ST37',true)}${input('mm','Kalınlık (mm)')}${input('quantity','Plaka adedi')}${input('en','En (mm)','1500')}${input('boy','Boy (mm)','3000')}${input('weight','Bu kalemin toplam ağırlığı (KG)')}${input('price','KG alış fiyatı (₺, KDV hariç)')}<label>KDV<select data-field="tax" class="form-control" onchange="updateSheetPurchaseSummary()"><option value="0">%0</option><option value="20">%20</option></select></label></div><button type="button" class="btn btn-outline" onclick="calculateSheetPurchaseWeight(this)">Bu kalemin tahmini KG değerini hesapla</button>`;
    const first=readSheetPurchaseLines()[0];
    for(const key of ['material','mm','en','boy','quantity','weight','price','tax'])row.querySelector(`[data-field="${key}"]`).value=values[key]??(key==='quantity'?1:['material','en','boy','price','tax'].includes(key)?first[key]:'');
    row.querySelector('[data-field="weight"]').dataset.basis=values.weightBasis||'manual';container.append(row);renumberSheetPurchaseLines();updateSheetPurchaseSummary();
}
function renumberSheetPurchaseLines() {document.querySelectorAll('#sheet-purchase-lines .sheet-purchase-line').forEach((row,index)=>row.querySelector('.sheet-purchase-line-heading strong').textContent=`${index+1}. Sac kalemi`);}

// Accept Turkish thousands/decimal notation without treating 47.287 as 47 TL.
function parseSheetPurchaseDocumentTotal(value) {
    if(typeof value==='number')return Number.isFinite(value)?roundMoney(value):NaN;
    const text=String(value??'').trim();let normalized;
    if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text))normalized=text.replaceAll('.','').replace(',','.');
    else if(/^\d+(,\d{1,2})?$/.test(text))normalized=text.replace(',','.');
    else if(/^\d+\.\d{1,2}$/.test(text))normalized=text;
    else return NaN;
    return roundMoney(Number(normalized));
}

function handleCariAmountInput() {
    if(document.getElementById('input-islem-tipi').value!=='sac_alimi')return updateTahsilatSummary();
    document.getElementById('sheet-purchase-total-mode').value='document';
    document.getElementById('sheet-purchase-document-total').value=document.getElementById('input-islem-tutar').value;
    updateSheetPurchaseSummary(true);
}
function useCalculatedSheetPurchaseTotal() {
    document.getElementById('sheet-purchase-total-mode').value='calculated';
    document.getElementById('sheet-purchase-document-total').value='';
    updateSheetPurchaseSummary();
}

// Record IDs remain the links between modules. Display codes have independent, durable counters.
function getCodeAliases(record) {
    return [...new Set([...(Array.isArray(record?.codeAliases) ? record.codeAliases : []), record?.identityMigration?.previousCode].filter(value => typeof value === 'string' && value))];
}
function rememberDisplayCode(record, code) {
    if (code && code !== record.kodu) record.codeAliases = [...new Set([...getCodeAliases(record), code])];
}
function codeSearchText(record) { return [record?.kodu, ...getCodeAliases(record)].join(' '); }
function thicknessCodeKey(value) {
    const text = String(value ?? '').trim().replace(',', '.');
    const n = Number(text);
    return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n) && n > 0 && n < 10000 && !String(n).includes('e') ? String(n) : null;
}
function numberingBucket(config, year = new Date().getFullYear()) {
    return config.prefix + (config.useYear ? '-' + year : '');
}
function nextDisplaySequence(database, type, config, bucket) {
    const source = NUMBERING_RECORD_SOURCES[type];
    const pattern = new RegExp('^' + escapeRegExp(bucket) + '-(\\d+)$');
    let next = Number(config.series?.[bucket]) || 1;
    // Import the older single counter only for the series it actually belongs to.
    if (!config.activeSeries || config.activeSeries === bucket) next = Math.max(next, config.next || 1);
    for (const record of database[source.collection] || []) {
        for (const code of [record[source.field], ...getCodeAliases(record)]) {
            const match = String(code || '').match(pattern);
            if (match && Number.isSafeInteger(Number(match[1]))) next = Math.max(next, Number(match[1]) + 1);
        }
    }
    if (!Number.isSafeInteger(next) || next < 1 || next >= Number.MAX_SAFE_INTEGER) throw Error('Numara sınırına ulaşıldı.');
    return next;
}
function formatDatabaseSerial(database, type, increment = false, prefixOverride = '') {
    database.ayarlar ||= {};
    const settings = mergeNumberingSettings(database.ayarlar.numaralandirma);
    const config = settings[type];
    if (!config || type === 'stok') throw Error('Stok kodu için sac kalınlığı gereklidir.');
    if (prefixOverride) config.prefix = prefixOverride;
    const bucket = numberingBucket(config), next = nextDisplaySequence(database, type, config, bucket);
    const code = bucket + '-' + String(next).padStart(config.pad, '0');
    if (increment) {
        config.series[bucket] = next + 1;
        config.activeSeries = bucket;
        config.next = next + 1;
        database.ayarlar.numaralandirma = settings;
    }
    return code;
}
function stockCodeForThickness(mm, increment = false, database = db, prefixOverride = '') {
    const key = thicknessCodeKey(mm);
    if (!key) throw Error('Stok kodu için sıfırdan büyük bir sac kalınlığı girin.');
    database.ayarlar ||= {};
    const settings = mergeNumberingSettings(database.ayarlar.numaralandirma), config = settings.stok;
    const bucket = (prefixOverride || config.prefix) + '-' + key + 'MM';
    const pattern = new RegExp('^' + escapeRegExp(bucket) + '-(\\d+)$');
    let next = Number(config.series[bucket]) || 1;
    for (const stock of database.stoklar || []) {
        for (const code of [stock.kodu, ...getCodeAliases(stock)]) {
            const match = String(code || '').match(pattern);
            if (match && Number.isSafeInteger(Number(match[1]))) next = Math.max(next, Number(match[1]) + 1);
        }
    }
    if (!Number.isSafeInteger(next) || next < 1 || next >= Number.MAX_SAFE_INTEGER) throw Error('Stok numara sınırına ulaşıldı.');
    if (increment) {
        config.series[bucket] = next + 1;
        config.next += 1;
        database.ayarlar.numaralandirma = settings;
    }
    return bucket + '-' + String(next).padStart(2, '0');
}
function migrateReadableCodes(database) {
    database.ayarlar ||= {};
    const old = mergeNumberingSettings(database.ayarlar.numaralandirma);
    for (const [type, defaults] of Object.entries(defaultNumberingSettings)) {
        const config = old[type], previousBucket = numberingBucket(config);
        config.series[previousBucket] = Math.max(config.series[previousBucket] || 1, config.next);
        Object.assign(config, {prefix:defaults.prefix, pad:defaults.pad, useYear:defaults.useYear});
        if (previousBucket !== numberingBucket(config)) { config.activeSeries = previousBucket; config.next = 1; }
    }
    database.ayarlar.numaralandirma = old;
    const mappings = [], roots = new Map();
    const sortedStocks = [...(database.stoklar || [])].sort((a,b) => Number(a.id)-Number(b.id));
    for (const stock of sortedStocks) {
        if (stock.originCutId) continue;
        const key = thicknessCodeKey(stock.mm);
        if (!key) { stock.codeReviewRequired = true; continue; }
        const from = stock.kodu || '', family = key + '|' + (from || 'id:' + stock.id);
        const alreadyFormatted = new RegExp('^STK-' + escapeRegExp(key) + 'MM-\\d+$').test(from);
        const to = roots.get(family) || (alreadyFormatted ? from : stockCodeForThickness(key, true, database));
        roots.set(family, to); stock.kodu = to; stock.codeReviewRequired = false;
        rememberDisplayCode(stock, from);
        if (from !== to) mappings.push({type:'stok', id:stock.id, from, to});
    }
    for (const stock of sortedStocks) {
        if (!stock.originCutId) continue;
        const root = getRootSheetStock(stock, database);
        if (!root || root.codeReviewRequired) { stock.codeReviewRequired = true; continue; }
        const from = stock.kodu || '';
        stock.kodu = root.kodu; stock.rootStockId = root.id; stock.codeReviewRequired = false;
        rememberDisplayCode(stock, from);
        stock.codeAliases = [...new Set([...getCodeAliases(stock), ...getCodeAliases(root)])];
        if (from !== stock.kodu) mappings.push({type:'stok', id:stock.id, from, to:stock.kodu});
    }
    for (const cari of [...(database.cariler || [])].sort((a,b) => Number(a.id)-Number(b.id))) {
        if (/^CAR-\d+$/.test(cari.kodu || '')) continue;
        const from = cari.kodu || '';
        cari.kodu = formatDatabaseSerial(database, 'cari', true);
        rememberDisplayCode(cari, from);
        mappings.push({type:'cari', id:cari.id, from, to:cari.kodu});
    }
    database.codeMigration = {version:9, mappings};
}
function renderStockCodeHint(edit = false) {
    const input = document.getElementById(edit ? 'input-duzenle-stok-mm' : 'input-stok-mm');
    const output = document.getElementById(edit ? 'edit-stock-code-hint' : 'new-stock-code-hint');
    if (!input || !output) return;
    const stock = edit ? getDBArray('stoklar').find(s => String(s.id) === document.getElementById('input-duzenle-stok-id').value) : null;
    try {
        const changed = stock && thicknessCodeKey(stock.mm) !== thicknessCodeKey(input.value);
        output.textContent = stock && !changed ? 'Stok kodu: ' + stock.kodu : stock ?
            `Kalınlık düzeltmesi: ${stock.kodu} → ${stockCodeForThickness(input.value)}. Eski kodla arama korunur.` :
            'Otomatik stok kodu: ' + stockCodeForThickness(input.value);
    } catch (_) { output.textContent = 'Stok kodu kalınlığa göre otomatik oluşturulur.'; }
}
function renderPurchaseCodeHints() {
    const previewDB = {stoklar:getDBArray('stoklar'), ayarlar:JSON.parse(JSON.stringify(db.ayarlar || {}))};
    document.querySelectorAll('#sheet-purchase-lines .sheet-purchase-line').forEach(row => {
        const output = row.querySelector('.stock-code-hint');
        if (!output) return;
        const input = row.dataset.first ? document.getElementById('sheet-purchase-mm') : row.querySelector('[data-field="mm"]');
        const previous = getDBArray('stoklar').find(s => String(s.id) === row.dataset.stockId);
        try {
            const changed = previous && thicknessCodeKey(previous.mm) !== thicknessCodeKey(input.value);
            const code = previous && !changed ? previous.kodu : stockCodeForThickness(input.value, true, previewDB);
            output.textContent = changed ? `Kalınlık düzeltmesi: ${previous.kodu} → ${code}. Eski kod korunur.` : 'Stok kodu: ' + code;
        } catch (_) { output.textContent = 'Kalınlık girildiğinde stok kodu oluşur.'; }
    });
}
function renderNumberingExamples() {
    document.querySelectorAll('[data-numbering-preview]').forEach(output => {
        const type = output.dataset.numberingPreview, prefix = document.getElementById(output.dataset.prefixInput)?.value.trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9]{0,11}$/.test(prefix || '')) { output.textContent = 'En fazla 12 harf/rakam kullanın.'; return; }
        output.textContent = type === 'stok' ? 'Örnek: ' + stockCodeForThickness(10, false, db, prefix) + ' · her kalınlığa ayrı sıra' : 'Sıradaki: ' + formatDatabaseSerial(db, type, false, prefix);
    });
    const body = document.getElementById('code-migration-list');
    if (body) body.innerHTML = (db.codeMigration?.mappings || []).map(m => `<tr><td>${m.type==='stok'?'Stok':'Cari'}</td><td>${escapeHTML(m.from || '—')}</td><td>${escapeHTML(m.to)}</td></tr>`).join('') || '<tr><td colspan="3">Dönüştürülen eski kod yok.</td></tr>';
}

async function backupBeforeReadableCodes(data) {
    const raw = typeof data === 'string' ? JSON.parse(data) : data;
    if (!raw || Number(raw.schemaVersion) >= 9 || !((raw.stoklar || []).length || (raw.cariler || []).length)) return;
    const original = typeof data === 'string' ? data : JSON.stringify(data);
    if (window.electronAPI?.sendBackup) {
        const result = await createSafetyBackup(original);
        if (!result.success) throw Error('Kod düzenlemesi öncesi güvenlik yedeği alınamadı. Veriler değiştirilmedi. ' + (result.error || ''));
    } else {
        localStorage.setItem(DB_KEY + '-before-readable-codes', original);
    }
}
