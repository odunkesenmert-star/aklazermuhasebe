window.onerror = function(msg, url, line, col, error) {
   const errDiv = document.createElement('div');
   errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999;padding:20px;font-size:16px;box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
   errDiv.innerHTML = `<strong>Kritik Hata:</strong> ${String(msg).replace(/[<>&"']/g, '')} <br><small>Satır: ${line}</small><br><button onclick="this.parentElement.remove()" style="margin-top:10px;padding:5px 10px;color:black;">Kapat</button>`;
   document.body.appendChild(errDiv);
};

// --- Database & Local Storage Logic ---
const DB_KEY = 'AkLazerDB';
const CURRENT_SCHEMA_VERSION = 3;
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
        resolveConfirmation(false);
    }
});

if (!IS_AUTOMATED_UI_TEST) {
    window.alert = message => showToast(String(message ?? ''));
}

const defaultNumberingSettings = {
    cari: { prefix: 'C', next: 1, pad: 3, useYear: false },
    stok: { prefix: 'STK', next: 1, pad: 4, useYear: false },
    teklif: { prefix: 'TEK', next: 1, pad: 4, useYear: true },
    isEmri: { prefix: 'EMR', next: 1, pad: 6, useYear: false },
    fatura: { prefix: 'FTR', next: 1, pad: 4, useYear: true },
    cekSenet: { prefix: 'CS', next: 1, pad: 4, useYear: true },
    odemePlani: { prefix: 'VP', next: 1, pad: 4, useYear: true },
    kasa: { prefix: 'KASA', next: 2, pad: 3, useYear: false }
};

const defaultDB = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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

const DB_ARRAY_KEYS = ['cariler', 'stoklar', 'islemler', 'teklifler', 'giderler', 'faturalar', 'isEmirleri', 'fireler', 'personeller', 'personelPuantajlari', 'cekSenetler', 'odemePlanlari', 'kasaHesaplari', 'kasaHareketleri', 'stokHareketleri', 'denetimKayitlari'];

function createEmptyDatabase() {
    const fresh = JSON.parse(JSON.stringify(defaultDB));
    DB_ARRAY_KEYS.forEach(key => { fresh[key] = []; });
    fresh.kasaHesaplari = JSON.parse(JSON.stringify(defaultDB.kasaHesaplari));
    fresh.schemaVersion = CURRENT_SCHEMA_VERSION;
    return fresh;
}

const DB_NUMERIC_FIELDS = {
    cariler: ['bakiye'],
    stoklar: ['miktar', 'kg', 'maliyet', 'kritikSeviye'],
    islemler: ['tutar', 'bakiyeDegisimi'],
    teklifler: ['minutes', 'rate', 'kgAmount', 'kgPrice', 'stokQty', 'operationCost', 'materialCost', 'subTotalBeforeDiscount', 'discountPercent', 'discountAmount', 'subTotal', 'taxRate', 'tax', 'total'],
    giderler: ['tutar'],
    faturalar: ['tutar', 'cariBakiyeDegisimi'],
    isEmirleri: [
        'minutes', 'rate', 'kgAmount', 'kgPrice', 'stokQty', 'operationCost', 'materialCost',
        'subTotalBeforeDiscount', 'discountPercent', 'discountAmount', 'subTotal', 'taxRate', 'tax', 'total',
        'profitNetRevenue', 'costMaterial', 'costMachineMinutes', 'costMachineRate', 'costMachine',
        'costLaborHours', 'costLaborRate', 'costLabor', 'costExternal', 'costShipping', 'costOther',
        'costScrapRecovery', 'costTotal', 'grossProfit', 'profitMargin'
    ],
    personeller: ['maas'],
    personelPuantajlari: ['geldiGun', 'izinGun', 'eksikGun', 'mesaiSaat', 'mesaiSaatUcreti', 'avans', 'prim', 'brutMaas', 'kesinti', 'ekOdeme', 'netMaas'],
    cekSenetler: ['tutar', 'cariBakiyeDegisimi'],
    odemePlanlari: ['tutar'],
    kasaHesaplari: ['bakiye'],
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
    });
    return merged;
}

const NUMBERING_RECORD_SOURCES = Object.freeze({
    cari: Object.freeze({ collection: 'cariler', field: 'kodu' }),
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
    Object.entries(NUMBERING_RECORD_SOURCES).forEach(([type, source]) => {
        const config = reconciled[type];
        const highestSequence = (database[source.collection] || []).reduce((highest, record) => {
            const sequence = getSerialSequence(record?.[source.field], config);
            return sequence === null ? highest : Math.max(highest, sequence);
        }, 0);
        config.next = Math.max(config.next, highestSequence + 1);
    });
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
    if (!normalized.kasaHesaplari.length) {
        normalized.kasaHesaplari = JSON.parse(JSON.stringify(defaultDB.kasaHesaplari));
    }

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

function triggerAutoBackup(data = '') {
    if (window.electronAPI && window.electronAPI.sendBackup) {
        if (data) {
            return window.electronAPI.sendBackup(data);
        }
    }
    return Promise.resolve({ success: true, skipped: true });
}

function saveDB(skipRender = false) {
    let data = '';
    let persistencePromise = Promise.resolve({ success: true, localOnly: true });
    try {
        if (startupPersistenceBlocked) {
            throw new Error('Diskteki veri okunamadığı için otomatik kayıt güvenlik amacıyla durduruldu. Yedek geri yükleyin veya uygulamayı yeniden başlatın.');
        }
        data = JSON.stringify(validateAndNormalizeDB(db));
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
        const result = await triggerAutoBackup(data);
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

    const plateCost = Math.max(0, Number(stok.maliyet) || 0);
    if (order.islemTipi === 'hammadde') {
        const stockPlateCount = Math.max(0, Number(stok.miktar) || 0);
        const stockWeight = Math.max(0, Number(stok.kg) || 0);
        const costPerKg = stockPlateCount > 0 && stockWeight > 0
            ? (plateCost * stockPlateCount) / stockWeight
            : 0;
        return roundMoney(costPerKg * Math.max(0, Number(order.kgAmount) || 0));
    }

    return roundMoney(plateCost * Math.max(0, Number(order.stokQty) || 0));
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
    const cfg = getNumberingConfig(type);
    const current = Math.max(1, parseInt(cfg.next, 10) || 1);
    const number = String(current).padStart(cfg.pad || 3, '0');
    const parts = [cfg.prefix || defaultNumberingSettings[type]?.prefix || type.toUpperCase()];
    if (cfg.useYear) parts.push(String(new Date().getFullYear()));
    parts.push(number);
    if (increment) cfg.next = current + 1;
    return parts.join('-');
}

function previewSerialNo(type) {
    return formatSerialNo(type, false);
}

function generateSerialNo(type) {
    return formatSerialNo(type, true);
}

function updateCariStatus(cari) {
    if (!cari) return;
    if (cari.bakiye > 0) cari.durum = 'Müşteri Borçlu';
    else if (cari.bakiye < 0) cari.durum = 'Müşteri Alacaklı';
    else cari.durum = 'Temiz';
}

function normalizeLookupText(value) {
    return plainText(value).toLocaleLowerCase('tr-TR');
}

function findCariByReference(cariId, fallbackName = '') {
    if (cariId && cariId !== 'internal') {
        const byId = getDBArray('cariler').find(c => c.id == cariId);
        if (byId) return byId;
    }

    const normalizedName = normalizeLookupText(fallbackName);
    if (!normalizedName) return null;
    return getDBArray('cariler').find(c => normalizeLookupText(c.adi) === normalizedName) || null;
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

function addCariMovement(cari, movement) {
    if (!cari) return null;

    const delta = roundMoney(movement.bakiyeDegisimi);
    cari.bakiye = roundMoney((Number(cari.bakiye) || 0) + delta);
    updateCariStatus(cari);

    const transaction = {
        id: movement.id || createRecordId(),
        tarih: movement.tarih || new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        cariId: cari.id,
        firma: cari.adi,
        tip: movement.tip,
        aciklama: movement.aciklama || '',
        faturaNo: movement.faturaNo || '',
        orderId: movement.orderId || null,
        orderNo: movement.orderNo || '',
        faturaId: movement.faturaId || null,
        tutar: Math.abs(roundMoney(movement.tutar ?? delta)),
        bakiyeDegisimi: delta,
        isSuccess: !!movement.isSuccess,
        isGelir: !!movement.isGelir,
        ek: movement.ek || null,
        reversalOf: movement.reversalOf || null,
        reversedBy: movement.reversedBy || null
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

function scheduleAttachmentArchive(ek, category, ownerName) {
    if (!ek || ek.archivedPath || !ek.path || !window.electronAPI?.archiveAttachment) return;
    window.electronAPI.archiveAttachment({
        sourcePath: ek.path,
        category: category || 'Belgeler',
        ownerName: ownerName || 'Genel',
        fileName: ek.name || 'belge'
    }).then(result => {
        if (result?.success && result.path) {
            ek.archivedPath = result.path;
            ek.archiveStatus = 'Arşivlendi';
            saveDB(true);
        } else {
            ek.archiveStatus = 'Arşivlenemedi';
            ek.archiveError = result?.error || 'Kaynak dosya bulunamadı.';
            saveDB(true);
            alert(`Belge eki arşivlenemedi: ${ek.name || 'Belge'}\n\n${ek.archiveError}`);
        }
    }).catch(error => {
        ek.archiveStatus = 'Arşivlenemedi';
        ek.archiveError = error?.message || String(error);
        saveDB(true);
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

function getPrintBrandHTML(title, metaHTML = '') {
    const firmaAdi = getCompanyName();
    const contactItems = [db.ayarlar?.telefon, db.ayarlar?.adres]
        .map(item => plainText(item))
        .filter(Boolean);
    return `
        <div class="brand-header">
            <div class="brand-mark">
                <img class="brand-logo" src="${APP_LOGO_PATH}" alt="${escapeHTML(firmaAdi)}">
            </div>
            <div class="brand-copy">
                <h1>${escapeHTML(title)}</h1>
                <div class="company-name">${escapeHTML(firmaAdi)}</div>
                ${contactItems.length ? `<div class="company-contact">${contactItems.map(item => `<span>${escapeHTML(item)}</span>`).join('')}</div>` : ''}
            </div>
            <div class="meta">${metaHTML}</div>
        </div>
    `;
}

function getPrintBaseStyles(options = {}) {
    const isLandscape = options.orientation === 'landscape';
    const pageSize = isLandscape ? 'A4 landscape' : 'A4 portrait';
    const pageMargin = isLandscape ? '13mm 14mm 17mm' : '15mm 16mm 19mm';
    const screenMinHeight = isLandscape ? '210mm' : '297mm';
    const screenPadding = isLandscape ? '13mm 14mm 17mm' : '15mm 16mm 19mm';
    return `
        @page {
            size: ${pageSize};
            margin: ${pageMargin};
            @bottom-left {
                content: "AK LAZER ERP";
                color: #64748b;
                font: 9px Arial, sans-serif;
            }
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
        body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); margin: 0; font-size: 11px; line-height: 1.45; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media screen {
            body { min-height: ${screenMinHeight}; padding: ${screenPadding}; }
        }
        @media print {
            body { padding: 0; }
        }
        .brand-header { position: relative; display: grid; grid-template-columns: 190px minmax(0, 1fr) 175px; align-items: stretch; gap: 16px; margin-bottom: 22px; padding: 10px 0 16px; border-bottom: 1px solid var(--line-strong); break-inside: avoid; page-break-inside: avoid; }
        .brand-header::before { content: ""; position: absolute; top: 0; left: 0; width: 42px; height: 3px; background: var(--accent); }
        .brand-mark { display: flex; align-items: center; padding-right: 12px; border-right: 1px solid var(--line); }
        .brand-copy { display: flex; min-width: 0; flex-direction: column; justify-content: center; }
        .brand-logo { display: block; width: 100%; max-height: 78px; object-fit: contain; object-position: left center; }
        h1 { margin: 0 0 4px; font-size: 22px; line-height: 1.08; color: var(--primary); letter-spacing: -.015em; overflow-wrap: anywhere; }
        .company-name { color: var(--ink-soft); font-size: 10.5px; line-height: 1.3; font-weight: 700; }
        .company-contact { display: flex; flex-wrap: wrap; gap: 2px 8px; color: var(--muted); font-size: 8px; line-height: 1.35; margin-top: 3px; }
        .company-contact span + span::before { content: "/"; margin-right: 8px; color: #94a3b8; }
        .meta { align-self: stretch; display: flex; flex-direction: column; justify-content: center; padding: 8px 10px; border-left: 3px solid var(--primary); background: var(--surface); min-width: 0; }
        .meta-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 7px; align-items: baseline; padding: 2px 0; }
        .meta-label { color: var(--muted); font-size: 7.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .meta-value { color: var(--ink); font-size: 9px; line-height: 1.25; text-align: right; overflow-wrap: anywhere; }
        .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin: 22px 0 9px; padding-bottom: 6px; border-bottom: 1px solid var(--line); break-after: avoid; page-break-after: avoid; }
        .section-heading h2 { margin: 0; color: var(--primary); font-size: 11px; line-height: 1.2; letter-spacing: .06em; text-transform: uppercase; }
        .section-heading span { color: var(--muted); font-size: 8.5px; }
        .document-intro-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 28px; margin: 0 0 18px; break-inside: avoid; page-break-inside: avoid; }
        .document-card { min-width: 0; padding: 0 0 10px; border-bottom: 1px solid var(--line-strong); }
        .document-card-label { margin-bottom: 5px; color: var(--accent); font-size: 8px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
        .document-card-value { color: var(--ink); font-size: 14px; line-height: 1.25; font-weight: 700; overflow-wrap: anywhere; }
        .document-card-detail { margin-top: 4px; color: var(--muted); font-size: 9.5px; line-height: 1.45; }
        .metric-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: 0 0 18px; border: 1px solid var(--line); background: var(--line); break-inside: avoid; page-break-inside: avoid; }
        .metric-item { padding: 10px 12px; background: var(--surface); }
        .metric-label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 7.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .metric-value { display: block; color: var(--primary); font-size: 14px; line-height: 1.15; }
        .metric-item.is-accent { background: var(--primary); }
        .metric-item.is-accent .metric-label { color: #c9d9ec; }
        .metric-item.is-accent .metric-value { color: #fff; }
        table { width: 100%; border-collapse: collapse; font-size: ${isLandscape ? '9.5px' : '10.25px'}; break-inside: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tbody tr, tfoot tr { break-inside: avoid; page-break-inside: avoid; }
        th, td { padding: ${isLandscape ? '6px 7px' : '7px 8px'}; border: 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: break-word; }
        th { padding-top: 7px; padding-bottom: 7px; border-top: 1px solid var(--primary); border-bottom: 1px solid var(--primary); background: var(--surface-blue); color: var(--primary); font-size: 7.5px; line-height: 1.25; font-weight: 700; letter-spacing: .045em; text-transform: uppercase; }
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
        .document-note { padding: 11px 13px; border-left: 3px solid var(--accent); background: var(--surface); color: var(--ink-soft); font-size: 9.5px; line-height: 1.55; }
        .document-note-title { display: block; margin-bottom: 4px; color: var(--primary); font-size: 8px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .totals-panel { width: 100%; border-collapse: collapse; }
        .totals-panel td { padding: 5px 8px; border-bottom: 1px solid var(--line); background: #fff !important; }
        .totals-panel td:first-child { color: var(--muted); font-size: 8.5px; font-weight: 700; }
        .totals-panel td:last-child { color: var(--ink); font-size: 9.5px; font-weight: 700; text-align: right; white-space: nowrap; }
        .totals-panel .total-row td { padding-top: 9px; padding-bottom: 9px; border: 0; background: var(--primary) !important; color: #fff; }
        .totals-panel .total-row td:first-child { font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
        .totals-panel .total-row td:last-child { font-size: 13px; }
        .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 34px; margin-top: 30px; break-inside: avoid; page-break-inside: avoid; }
        .signature-box { min-height: 54px; padding-top: 8px; border-top: 1px solid var(--line-strong); color: var(--ink-soft); font-size: 9px; line-height: 1.45; text-align: center; }
        .bank-details { display: grid; grid-template-columns: .8fr 1.7fr; gap: 24px; margin-top: 22px; padding-top: 12px; border-top: 1px solid var(--line); break-inside: avoid; page-break-inside: avoid; }
        .bank-field { display: grid; grid-template-columns: 48px 1fr; align-items: end; gap: 8px; min-height: 28px; }
        .bank-field span { color: var(--muted); font-size: 7.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .bank-field strong { display: block; min-height: 18px; border-bottom: 1px solid var(--line-strong); }
        .muted { color: var(--muted); font-size: 9px; line-height: 1.4; }
        @media print {
            .brand-header { grid-template-columns: 185px minmax(0, 1fr) 172px; }
            .brand-logo { max-height: 74px; }
        }
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
    if (fileInput) fileInput.value = '';
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
                alert(`PDF kaydedildi:\n${result.path}`);
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
        (c.kodu || '').toLowerCase().includes(search)
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
    const filtered = getDBArray('stoklar').filter(s =>
        (s.cinsi || '').toLowerCase().includes(searchVal) ||
        (s.kodu || '').toLowerCase().includes(searchVal)
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
    inventory: { tbodyId: 'inventory-tbody', columns: { 'Kod': 'code', 'Cinsi / Kalite': 'material', 'Kalınlık (mm)': 'thickness', 'Ebat (EnxBoy)': 'size', 'Miktar (Plaka)': 'quantity', 'Ağırlık (KG)': 'weight', 'Sahibi': 'owner', 'Maliyet': 'cost' } },
    scraps: { tbodyId: 'scraps-tbody', columns: { 'Cinsi': 'material', 'Kalınlık (mm)': 'thickness', 'Ebat (EnxBoy)': 'size', 'Sahibi': 'owner', 'Tarih': 'date' } },
    expenses: { tbodyId: 'expenses-tbody', columns: { 'Tarih': 'date', 'Kategori': 'category', 'Açıklama': 'description', 'Tutar': 'amount' } },
    profitability: { tbodyId: 'profitability-tbody', columns: { 'İş Emri': 'number', 'Tarih': 'date', 'Müşteri / İş': 'customer', 'Net Satış': 'revenue', 'Maliyet': 'cost', 'Kâr': 'profit', 'Marj': 'margin', 'Maliyet Durumu': 'status' } },
    personnel: { tbodyId: 'personnel-tbody', columns: { 'Dönem': 'period', 'Personel': 'person', 'Gün / İzin / Eksik': 'attendance', 'Net Maaş': 'salary', 'Durum': 'status', 'Telefon': 'phone', 'Görev': 'role', 'Maaş': 'salary', 'Son Puantaj': 'period' } },
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
        <span class="high-volume-list-hint"><i class="fa-solid fa-database" aria-hidden="true"></i> 200+ kayıt için hızlı arama</span>
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
            headers: ['Kod', 'Tarih', 'Cinsi / Kalite', 'Kalınlık (mm)', 'Ebat', 'Miktar', 'Kritik Seviye', 'Ağırlık (KG)', 'Sahibi', 'Maliyet'],
            rows: getFilteredStoklarForReport().map(s => ({
                id: String(s.id),
                values: [
                    s.kodu || '-',
                    s.tarih || '-',
                    s.cinsi || '-',
                    s.mm || '-',
                    s.ebat || '-',
                    s.miktar || 0,
                    s.kritikSeviye || 0,
                    s.kg || 0,
                    s.sahibi || 'Biz',
                    s.sahibiTipi === 'musteri' ? '-' : formatCurrency(s.maliyet || 0)
                ]
            }))
        }),
        scraps: () => ({
            type: 'scraps',
            title: 'Fireler ve Artık Parçalar',
            dateRangeLabel: getReportDateRangeLabel('scraps'),
            headers: ['Cinsi', 'Kalınlık (mm)', 'Ebat', 'Sahibi', 'Tarih'],
            rows: [...getFilteredFirelerForReport()].reverse().map(f => ({
                id: String(f.id),
                values: [
                    f.cinsi || '-',
                    f.mm || '-',
                    `${f.en || '-'}x${f.boy || '-'}`,
                    f.sahibi || 'Biz',
                    f.tarih || '-'
                ]
            }))
        }),
        expenses: () => ({
            type: 'expenses',
            title: 'Gider Kayıtları',
            dateRangeLabel: getReportDateRangeLabel('expenses'),
            headers: ['Tarih', 'Kategori', 'Açıklama', 'Tutar'],
            rows: [...getFilteredExpensesForReport()].reverse().map(g => ({
                id: String(g.id),
                values: [
                    g.tarih || '-',
                    g.kategori || '-',
                    g.aciklama || '-',
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
                headers: ['Fatura No', 'Tarih', 'Firma', 'Açıklama', 'Tutar', 'Ek'],
                rows: [...filtered].reverse().map(f => ({
                    id: String(f.id),
                    values: [
                        f.faturaNo || '-',
                        f.tarih || '-',
                        f.firma || '-',
                        f.aciklama || '-',
                        `${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar || 0)}`,
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
        cheques: () => ({
            type: 'cheques',
            title: 'Çek / Senet Takibi',
            dateRangeLabel: getReportDateRangeLabel('cheques'),
            headers: ['Vade', 'Tip', 'Firma', 'Belge No', 'Banka', 'Tutar', 'Durum', 'Ek'],
            rows: [...getFilteredCekSenetlerForReport()].reverse().map(record => ({
                id: String(record.id),
                values: [
                    record.vadeTarihi || '-',
                    getCekSenetTypeLabel(record.tip),
                    record.firma || '-',
                    record.belgeNo || '-',
                    record.banka || '-',
                    formatCurrency(record.tutar || 0),
                    getCekSenetStatusLabel(record.durum),
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
        title: 'Fire ve Artık Parçalar',
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
    root.querySelectorAll('table.data-table thead th').forEach(th => th.setAttribute('scope', 'col'));
}

function enhanceModalLayout(modal) {
    const content = modal?.querySelector('.modal-content');
    if (!content) return;
    content.querySelector(':scope > .flex-between.mb-4:first-child')?.classList.add('modal-titlebar');
    content.querySelectorAll('.form-group .form-control').forEach(control => {
        const label = control.closest('.form-group')?.querySelector('label');
        if (label && control.id && !label.htmlFor) label.htmlFor = control.id;
    });
}

function enhanceContentPageLayouts() {
    Object.entries(INNER_PAGE_LAYOUTS).forEach(([page, meta]) => {
        const view = document.getElementById(`view-${page}`);
        if (!view || view.dataset.pageLayoutEnhanced === 'true') return;
        view.dataset.pageLayoutEnhanced = 'true';
        view.style.setProperty('--page-accent-rgb', meta.accent);

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

function getCariStatementTaxRateLabel(lines) {
    const rates = [...new Set(lines
        .map(line => Number(line.taxRate))
        .filter(rate => Number.isFinite(rate))
        .map(rate => formatPercentLabel(rate)))];
    return rates.length ? rates.join(', ') : '-';
}

function getCariStatementDiscountRateLabel(lines) {
    const rates = [...new Set(lines
        .map(line => Number(line.discountPercent))
        .filter(rate => Number.isFinite(rate))
        .map(rate => formatPercentLabel(rate)))];
    return rates.length ? rates.join(', ') : '-';
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
    const normalizedCariName = normalizeLookupText(cari.adi);
    const matchesCari = item =>
        item.cariId == cari.id ||
        item.customerId == cari.id ||
        normalizeLookupText(item.firma) === normalizedCariName ||
        normalizeLookupText(item.customerName) === normalizedCariName;

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
    const normalizedCariName = normalizeLookupText(cari.adi);
    const saleOrderIds = new Set(saleLines
        .filter(line => line.source === 'order')
        .map(line => String(line.sourceId)));
    const saleInvoiceIds = new Set(saleLines
        .filter(line => line.source === 'invoice')
        .map(line => String(line.sourceId)));

    return getDBArray('islemler')
        .filter(islem =>
            islem.cariId == cari.id ||
            normalizeLookupText(islem.firma) === normalizedCariName
        )
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
            faturaNo: islem.faturaNo || '',
            tutar: roundMoney(islem.tutar || 0),
            delta: Number.isFinite(Number(islem.bakiyeDegisimi))
                ? roundMoney(islem.bakiyeDegisimi)
                : roundMoney((islem.isGelir === true || normalizeLookupText(islem.tip).includes('tahsilat')) ? -(islem.tutar || 0) : (islem.tutar || 0))
        }))
        .filter(islem => islem.delta !== 0 || islem.tutar > 0)
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
    const ledgerLines = allLedgerLines.filter(line => isDateInRange(line.date, dateRange));

    if (Math.abs(visibleOpeningBalance) >= 0.01) {
        ledgerLines.unshift({
            id: 'opening-balance',
            date: '-',
            type: 'Devir',
            description: dateRange?.startValue ? 'Seçilen tarih öncesi bakiye' : 'Önceki bakiye / kayıt dışı devir',
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
    const visibleLines = allLines.filter(line => isDateInRange(getCariStatementDate(line), dateRange));
    const totals = visibleLines.reduce((acc, line) => {
        acc.gross += roundMoney(line.gross || 0);
        acc.discount += roundMoney(line.discountAmount || 0);
        acc.subTotal += roundMoney(line.subTotal || 0);
        acc.tax += roundMoney(line.tax || 0);
        acc.total += roundMoney(line.total || 0);
        return acc;
    }, { gross: 0, discount: 0, subTotal: 0, tax: 0, total: 0 });
    Object.keys(totals).forEach(key => totals[key] = roundMoney(totals[key]));

    const remainingBalance = roundMoney(cari.bakiye || 0);
    const ledgerLines = getCariLedgerLines(cari, allLines, remainingBalance, dateRange);
    const periodClosingBalance = roundMoney(ledgerLines.length ? (ledgerLines[ledgerLines.length - 1].balance || 0) : 0);
    const collectionTotal = roundMoney(ledgerLines
        .filter(line => line.type !== 'Devir')
        .reduce((total, line) => total + roundMoney(line.credit || 0), 0));
    const periodDebitTotal = roundMoney(ledgerLines
        .filter(line => line.type !== 'Devir')
        .reduce((total, line) => total + roundMoney(line.debit || 0), 0));
    const taxRateLabel = getCariStatementTaxRateLabel(visibleLines);
    const discountRateLabel = getCariStatementDiscountRateLabel(visibleLines);
    const emptyRow = `
        <tr>
            <td colspan="6" class="statement-empty">Bu cari için yazdırılacak hareket bulunamadı.</td>
        </tr>
    `;
    const ledgerRows = ledgerLines.map(line => `
        <tr>
            <td>${escapeHTML(line.date || '-')}</td>
            <td>
                <strong class="statement-movement">${escapeHTML(line.type || '-')}</strong>
                <div class="statement-description">${escapeHTML(line.description || '-')}</div>
            </td>
            <td class="number-cell">${line.debit ? escapeHTML(formatCurrency(line.debit)) : '—'}</td>
            <td class="number-cell">${line.credit ? escapeHTML(formatCurrency(line.credit)) : '—'}</td>
            <td class="statement-detail-cell">
                ${line.taxRate === null ? '' : `<span>KDV ${escapeHTML(formatPercentLabel(line.taxRate))}</span>`}
                ${line.discountAmount ? `<span>İsk. ${escapeHTML(formatPercentLabel(line.discountPercent))}: <strong>-${escapeHTML(formatCurrency(line.discountAmount))}</strong></span>` : ''}
                ${line.taxRate === null && !line.discountAmount ? '—' : ''}
            </td>
            <td class="number-cell statement-balance"><strong>${escapeHTML(formatCurrency(line.balance || 0))}</strong></td>
        </tr>
    `).join('');

    const contentHTML = `
        ${getPrintBrandHTML('Cari Hesap Ekstresi', getPrintMetaHTML([
            ['Düzenleme', new Date().toLocaleDateString('tr-TR')],
            ['Kapsam', 'Seçilen kayıtlar'],
            ['Aralık', formatDateRangeLabel(dateRange)],
            ['Cari Kodu', cari.kodu || '-']
        ]))}
        <div class="document-intro-grid">
            <div class="document-card">
                <div class="document-card-label">Hesap Sahibi</div>
                <div class="document-card-value">${escapeHTML(cari.adi || '-')}</div>
                <div class="document-card-detail">Cari Kodu: ${escapeHTML(cari.kodu || '-')}</div>
            </div>
            <div class="document-card">
                <div class="document-card-label">İletişim</div>
                <div class="document-card-value">${escapeHTML(cari.tel || cari.telefon || '-')}</div>
                <div class="document-card-detail">Seçilen tarih aralığındaki hesap hareketleri</div>
            </div>
        </div>
        <div class="metric-strip" aria-label="Cari hesap özeti">
            <div class="metric-item"><span class="metric-label">Dönem Borç / Satış</span><strong class="metric-value">${escapeHTML(formatCurrency(periodDebitTotal))}</strong></div>
            <div class="metric-item"><span class="metric-label">Tahsilat / Ödeme</span><strong class="metric-value">${escapeHTML(formatCurrency(collectionTotal))}</strong></div>
            <div class="metric-item is-accent"><span class="metric-label">Kalan Bakiye</span><strong class="metric-value">${escapeHTML(formatCurrency(periodClosingBalance))}</strong></div>
        </div>
        <div class="section-heading">
            <h2>Hesap Hareketleri</h2>
            <span>${ledgerLines.length} hareket · ${escapeHTML(formatDateRangeLabel(dateRange))}</span>
        </div>
        <table class="statement-table">
            <thead>
                <tr>
                    <th>Tarih</th>
                    <th>Hareket / Açıklama</th>
                    <th class="text-right">Borç / Satış</th>
                    <th class="text-right">Tahsilat / Ödeme</th>
                    <th>Vergi / İskonto</th>
                    <th class="text-right">Kalan Bakiye</th>
                </tr>
            </thead>
            <tbody>${ledgerLines.length ? ledgerRows : emptyRow}</tbody>
        </table>
        <div class="statement-summary-wrap">
            <table class="totals-panel" aria-label="Cari dönem özeti">
                <tbody>
                    <tr><td>Satış Tutarı</td><td>${escapeHTML(formatCurrency(totals.gross))}</td></tr>
                    <tr><td>İskonto Oranı</td><td>${escapeHTML(discountRateLabel)}</td></tr>
                    <tr><td>İskonto Toplamı</td><td>-${escapeHTML(formatCurrency(totals.discount))}</td></tr>
                    <tr><td>Ara Toplam</td><td>${escapeHTML(formatCurrency(totals.subTotal))}</td></tr>
                    <tr><td>KDV Oranı</td><td>${escapeHTML(taxRateLabel)}</td></tr>
                    <tr><td>KDV Toplamı</td><td>${escapeHTML(formatCurrency(totals.tax))}</td></tr>
                    <tr><td>Genel Toplam</td><td>${escapeHTML(formatCurrency(totals.total))}</td></tr>
                    <tr><td>Tahsilat / Ödeme Toplamı</td><td>-${escapeHTML(formatCurrency(collectionTotal))}</td></tr>
                    <tr class="total-row"><td>Dönem Sonu Bakiye</td><td>${escapeHTML(formatCurrency(periodClosingBalance))}</td></tr>
                </tbody>
            </table>
        </div>
    `;

    openPrintPreview('Cari Hesap Ekstresi', contentHTML, `
        .statement-table { table-layout: fixed; }
        .statement-table th:nth-child(1) { width: 12%; }
        .statement-table th:nth-child(2) { width: 30%; }
        .statement-table th:nth-child(3) { width: 14%; }
        .statement-table th:nth-child(4) { width: 14%; }
        .statement-table th:nth-child(5) { width: 15%; }
        .statement-table th:nth-child(6) { width: 15%; }
        .statement-movement { display: block; color: var(--ink); font-size: 9.5px; }
        .statement-description { margin-top: 2px; color: var(--muted); font-size: 8.5px; line-height: 1.4; }
        .statement-detail-cell { color: var(--muted); font-size: 8px; line-height: 1.35; }
        .statement-detail-cell span { display: block; }
        .statement-detail-cell strong { color: var(--ink-soft); }
        .statement-balance { color: var(--primary); }
        .statement-empty { text-align: center; color: var(--muted); padding: 24px; }
        .statement-summary-wrap { width: 285px; margin: 20px 0 0 auto; break-inside: avoid; page-break-inside: avoid; }
    `, { orientation: 'portrait' });
}

function printOrderStatement(orderId) {
    const order = getDBArray('isEmirleri').find(o => String(o.id) === String(orderId));
    if (!order) return alert('Yazdırılacak iş emri bulunamadı.');

    const amounts = getOrderStatementAmounts(order);
    const orderDate = order.faturaTarihi || order.tarih || new Date().toLocaleDateString('tr-TR');
    const customerName = order.customerName || findCariByReference(order.customerId)?.adi || '-';
    const description = order.description || (order.islemTipi === 'hammadde' ? `${order.kgAmount || 0} KG hammadde satışı` : 'Teslim edilen iş');

    const contentHTML = `
        ${getPrintBrandHTML('İş Emri Dökümü', getPrintMetaHTML([
            ['İş Emri No', order.orderNo || '-'],
            ['İş Emri Tarihi', orderDate],
            ['Düzenleme', new Date().toLocaleDateString('tr-TR')]
        ]))}
        <div class="document-intro-grid">
            <div class="document-card">
                <div class="document-card-label">Müşteri</div>
                <div class="document-card-value">${escapeHTML(customerName)}</div>
                <div class="document-card-detail">${escapeHTML(order.orderNo || 'Numarasız iş emri')}</div>
            </div>
            <div class="document-card">
                <div class="document-card-label">İş Emri Durumu</div>
                <div class="document-card-value">${escapeHTML(order.durum || 'Planlandı')}</div>
                <div class="document-card-detail">İş Emri Tarihi: ${escapeHTML(orderDate)}</div>
            </div>
        </div>
        <div class="section-heading">
            <h2>İş ve Tutar Bilgileri</h2>
            <span>Seçilen iş emri dökümü</span>
        </div>
        <table class="statement-table">
            <thead>
                <tr>
                    <th>İş Açıklaması</th>
                    <th class="text-right">Satış</th>
                    <th class="text-right">İskonto / İsk. Oranı</th>
                    <th class="text-right">KDV</th>
                    <th class="text-right">Toplam</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${escapeHTML(description)}</td>
                    <td class="number-cell">${escapeHTML(formatCurrency(amounts.gross || 0))}</td>
                    <td class="number-cell">
                        ${escapeHTML(amounts.discountAmount ? `-${formatCurrency(amounts.discountAmount)}` : formatCurrency(0))}
                        <div class="muted">${escapeHTML(formatPercentLabel(amounts.discountPercent))}</div>
                    </td>
                    <td class="number-cell">
                        ${escapeHTML(formatCurrency(amounts.tax || 0))}
                        <div class="muted">${escapeHTML(formatPercentLabel(amounts.taxRate))}</div>
                    </td>
                    <td class="number-cell"><strong>${escapeHTML(formatCurrency(amounts.total || 0))}</strong></td>
                </tr>
            </tbody>
        </table>
        <div class="document-footer-grid">
            <div class="document-note">
                <span class="document-note-title">Belge Açıklaması</span>
                Bu çıktı seçilen iş emrinin müşteri, iş tanımı ve satış tutarlarını gösterir.
            </div>
            <table class="totals-panel" aria-label="İş emri tutar özeti">
                <tbody>
                    <tr><td>Satış Tutarı</td><td>${escapeHTML(formatCurrency(amounts.gross || 0))}</td></tr>
                    <tr><td>İskonto Oranı</td><td>${escapeHTML(formatPercentLabel(amounts.discountPercent))}</td></tr>
                    <tr><td>İskonto Toplamı</td><td>-${escapeHTML(formatCurrency(amounts.discountAmount || 0))}</td></tr>
                    <tr><td>Ara Toplam</td><td>${escapeHTML(formatCurrency(amounts.subTotal || 0))}</td></tr>
                    <tr><td>KDV Oranı</td><td>${escapeHTML(formatPercentLabel(amounts.taxRate))}</td></tr>
                    <tr><td>KDV Toplamı</td><td>${escapeHTML(formatCurrency(amounts.tax || 0))}</td></tr>
                    <tr class="total-row"><td>Genel Toplam</td><td>${escapeHTML(formatCurrency(amounts.total || 0))}</td></tr>
                </tbody>
            </table>
        </div>
    `;

    openPrintPreview('İş Emri Dökümü', contentHTML, `
        .statement-table { table-layout: fixed; }
        .statement-table th:nth-child(1) { width: 43%; }
        .statement-table th:nth-child(2) { width: 14%; }
        .statement-table th:nth-child(3) { width: 14%; }
        .statement-table th:nth-child(4) { width: 14%; }
        .statement-table th:nth-child(5) { width: 15%; }
    `);
}

function getInvoiceDocumentLine(fatura) {
    const linkedOrder = fatura.orderId
        ? getDBArray('isEmirleri').find(order => order.id == fatura.orderId)
        : null;

    if (linkedOrder) {
        const amounts = getOrderStatementAmounts(linkedOrder);
        return {
            description: linkedOrder.description || (linkedOrder.islemTipi === 'hammadde' ? `${linkedOrder.kgAmount || 0} KG hammadde satışı` : 'Teslim edilen iş'),
            orderNo: linkedOrder.orderNo || fatura.orderNo || '',
            ...amounts
        };
    }

    const total = roundMoney(fatura.tutar || 0);
    return {
        description: fatura.aciklama || 'Fatura kalemi',
        orderNo: fatura.orderNo || '',
        gross: total,
        discountPercent: null,
        discountAmount: 0,
        subTotal: total,
        taxRate: null,
        tax: 0,
        total
    };
}

window.printInvoiceDocument = function(faturaId) {
    const fatura = getDBArray('faturalar').find(f => String(f.id) === String(faturaId));
    if (!fatura) return alert('Yazdırılacak fatura bulunamadı.');

    const line = getInvoiceDocumentLine(fatura);
    const cari = findCariByReference(fatura.cariId, fatura.firma);
    const title = fatura.tur === 'kesilen' ? 'Fatura Belgesi' : 'Alınan Fatura Kaydı';
    const directionLabel = fatura.tur === 'kesilen' ? 'Müşteriye Kesilen' : 'Tedarikçiden Alınan';

    const contentHTML = `
        ${getPrintBrandHTML(title, getPrintMetaHTML([
            ['Fatura No', fatura.faturaNo || '-'],
            ['Tarih', fatura.tarih || new Date().toLocaleDateString('tr-TR')],
            ['Belge Tipi', directionLabel]
        ]))}
        <div class="document-intro-grid">
            <div class="document-card">
                <div class="document-card-label">${fatura.tur === 'kesilen' ? 'Fatura Kesilen' : 'Faturayı Düzenleyen'}</div>
                <div class="document-card-value">${escapeHTML(fatura.firma || cari?.adi || '-')}</div>
                <div class="document-card-detail">
                    ${cari?.kodu ? `Cari Kodu: ${escapeHTML(cari.kodu)}` : 'Cari kodu bulunmuyor'}
                    ${cari?.tel || cari?.telefon ? ` · ${escapeHTML(cari.tel || cari.telefon)}` : ''}
                </div>
            </div>
            <div class="document-card">
                <div class="document-card-label">Belge Referansı</div>
                <div class="document-card-value">${escapeHTML(line.orderNo || directionLabel)}</div>
                <div class="document-card-detail">
                    ${line.orderNo ? `Bağlı İş Emri: ${escapeHTML(line.orderNo)}` : 'Bağlı iş emri bulunmuyor'}
                </div>
                ${renderAttachmentPrintLine(fatura)}
            </div>
        </div>
        <div class="section-heading">
            <h2>Fatura Kalemleri</h2>
            <span>${escapeHTML(directionLabel)}</span>
        </div>
        <table class="invoice-lines">
            <thead>
                <tr>
                    <th>Açıklama</th>
                    <th class="text-right">Satış Tutarı</th>
                    <th class="text-right">İskonto</th>
                    <th class="text-right">KDV</th>
                    <th class="text-right">Toplam</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${escapeHTML(line.description || '-')}</td>
                    <td class="number-cell">${escapeHTML(formatCurrency(line.gross || 0))}</td>
                    <td class="number-cell">
                        ${line.discountAmount ? escapeHTML(`-${formatCurrency(line.discountAmount)}`) : escapeHTML(formatCurrency(0))}
                        <div class="muted">${escapeHTML(formatPercentLabel(line.discountPercent))}</div>
                    </td>
                    <td class="number-cell">
                        ${escapeHTML(formatCurrency(line.tax || 0))}
                        <div class="muted">${escapeHTML(formatPercentLabel(line.taxRate))}</div>
                    </td>
                    <td class="number-cell"><strong>${escapeHTML(formatCurrency(line.total || 0))}</strong></td>
                </tr>
            </tbody>
        </table>
        <div class="document-footer-grid">
            <div class="document-note">
                <span class="document-note-title">Belge Niteliği</span>
                Bu çıktı uygulama içi fatura/proforma belgesidir. Resmi e-Fatura/e-Arşiv işlemleri için GİB veya özel entegratör sistemi kullanılmalıdır.
            </div>
            <table class="totals-panel" aria-label="Fatura tutar özeti">
                <tbody>
                    <tr><td>Satış Tutarı</td><td>${escapeHTML(formatCurrency(line.gross || 0))}</td></tr>
                    <tr><td>İskonto Oranı</td><td>${escapeHTML(formatPercentLabel(line.discountPercent))}</td></tr>
                    <tr><td>İskonto Toplamı</td><td>-${escapeHTML(formatCurrency(line.discountAmount || 0))}</td></tr>
                    <tr><td>Ara Toplam</td><td>${escapeHTML(formatCurrency(line.subTotal || 0))}</td></tr>
                    <tr><td>KDV Oranı</td><td>${escapeHTML(formatPercentLabel(line.taxRate))}</td></tr>
                    <tr><td>KDV Toplamı</td><td>${escapeHTML(formatCurrency(line.tax || 0))}</td></tr>
                    <tr class="total-row"><td>Genel Toplam</td><td>${escapeHTML(formatCurrency(line.total || 0))}</td></tr>
                </tbody>
            </table>
        </div>
    `;

    openPrintPreview(title, contentHTML, `
        .invoice-lines { table-layout: fixed; }
        .invoice-lines th:nth-child(1) { width: 43%; }
        .invoice-lines th:nth-child(2) { width: 14%; }
        .invoice-lines th:nth-child(3) { width: 14%; }
        .invoice-lines th:nth-child(4) { width: 14%; }
        .invoice-lines th:nth-child(5) { width: 15%; }
    `);
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

    const tableHead = report.headers.map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const tableBody = rows.map(row => {
        const result = profitabilityResults.get(String(row.id));
        const values = reportRowValues(row);
        const cells = values.map((cell, index) => {
            const classes = [];
            if (isProfitabilityReport && index >= 4 && index <= 7) classes.push('number-cell');
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
            ...(report.dateRangeLabel ? [['Aralık', report.dateRangeLabel]] : []),
            ['Kayıt Sayısı', String(rows.length)]
        ]))}
        ${profitabilitySummaryHTML}
        <div class="section-heading report-section-heading">
            <h2>Rapor Detayı</h2>
            <span>${rows.length} kayıt · ${escapeHTML(scopeLabel)}</span>
        </div>
        <table class="report-list-table report-list-${escapeHTML(type)}">
            <thead><tr>${tableHead}</tr></thead>
            <tbody>${tableBody}</tbody>
        </table>
    `;

    const landscapeReports = new Set(['inventory', 'profitability', 'cheques']);
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
    if(el) {
        enhanceModalLayout(el);
        el.classList.add('active');
    }
}

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
}

window.saveCari = function() {
    try {
        const adi = plainText(document.getElementById('input-cari-adi').value);
        const tel = plainText(document.getElementById('input-cari-tel').value);
        if (!adi) return alert("Firma adı zorunludur!");

        db.cariler.push({
            id: createRecordId(),
            kodu: generateSerialNo('cari'),
            adi: adi,
            tel: tel || '-',
            bakiye: 0,
            durum: 'Temiz'
        });
        saveDB();
        closeModal('modal-cari');
        renderCariler();
        updateQuoteMaterials();
        
        document.getElementById('input-cari-adi').value = '';
        document.getElementById('input-cari-tel').value = '';
    } catch(e) {
        alert("Cari kaydedilirken hata oluştu: " + e.message);
    }
}

window.editCari = function(id) {
    const cari = db.cariler.find(c => c.id == id);
    if (!cari) return;

    document.getElementById('input-duzenle-id').value = cari.id;
    document.getElementById('input-duzenle-adi').value = cari.adi;
    document.getElementById('input-duzenle-tel').value = cari.tel;
    document.getElementById('input-duzenle-pasif').checked = !!cari.isPasif;
    
    openModal('modal-cari-duzenle');
}

window.updateCari = function() {
    try {
        const id = document.getElementById('input-duzenle-id').value;
        const adi = plainText(document.getElementById('input-duzenle-adi').value);
        const tel = plainText(document.getElementById('input-duzenle-tel').value);
        const isPasif = document.getElementById('input-duzenle-pasif').checked;
        
        if (!adi) return alert("Firma adı zorunludur!");
        
        const cari = db.cariler.find(c => c.id == id);
        if (cari) {
            if (isPasif && cari.bakiye !== 0) {
                return alert("Dikkat: Bu müşterinin aktif bir bakiyesi (borcu/alacağı) var! Hesap sıfırlanmadan pasife alamazsınız.");
            }

            const oldName = cari.adi;
            if (oldName !== adi) {
                (db.islemler || []).forEach(islem => {
                    if (islem.firma === oldName) {
                        islem.firma = adi;
                    }
                });
            }

            cari.adi = adi;
            cari.tel = tel;
            cari.isPasif = isPasif;
            saveDB();
            closeModal('modal-cari-duzenle');
            renderCariler();
            updateQuoteMaterials();
        }
    } catch(e) {
        alert("Cari güncellenirken hata oluştu: " + e.message);
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

window.saveStok = function() {
    try {
        const sahibi = document.getElementById('input-stok-sahibi').value;
        const cariId = document.getElementById('input-stok-cari').value;
        const cinsi = plainText(document.getElementById('input-stok-cinsi').value);
        const mm = document.getElementById('input-stok-mm').value;
        const miktar = Number(document.getElementById('input-stok-miktar').value || 0);
        const kgRaw = document.getElementById('input-stok-kg').value;
        const kg = Number(kgRaw);
        const en = document.getElementById('input-stok-en').value;
        const boy = document.getElementById('input-stok-boy').value;
        const girilenMaliyet = Number(document.getElementById('input-stok-maliyet').value || 0);
        const maliyet = sahibi === 'musteri' ? 0 : girilenMaliyet;
        const kritikSeviye = Number(document.getElementById('input-stok-kritik')?.value || 0);

        if (!cinsi || !plainText(kgRaw)) return alert("Lütfen Cinsi ve Ağırlık (KG) alanlarını doldurun!");
        if (![miktar, kg, girilenMaliyet, kritikSeviye].every(Number.isFinite)) return alert('Stok alanlarına geçerli sayılar girin!');
        if ([miktar, kg, girilenMaliyet, kritikSeviye].some(value => value < 0)) return alert('Stok miktarı, ağırlık, maliyet ve kritik seviye negatif olamaz!');
        if (sahibi === 'musteri' && !cariId) return alert("Lütfen bir müşteri seçin!");

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        const stok = {
            id: createRecordId(),
            kodu: generateSerialNo('stok'),
            cinsi: cinsi,
            mm: mm,
            ebat: `${en}x${boy}`,
            miktar: miktar,
            kg: kg,
            maliyet: maliyet,
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
        
        saveDB();
        closeModal('modal-stok');
        renderStoklar();
        
        // Reset form
        document.getElementById('input-stok-cinsi').value = '';
        document.getElementById('input-stok-mm').value = '';
        document.getElementById('input-stok-miktar').value = '';
        document.getElementById('input-stok-kg').value = '';
        document.getElementById('input-stok-en').value = '';
        document.getElementById('input-stok-boy').value = '';
        document.getElementById('input-stok-maliyet').value = '0';
        const kritikEl = document.getElementById('input-stok-kritik');
        if (kritikEl) kritikEl.value = '0';
    } catch(e) {
        alert("Stok kaydedilirken hata oluştu: " + e.message);
    }
}

window.openStokDuzenleModal = function(id) {
    const stok = db.stoklar.find(s => s.id === id);
    if (!stok) return;

    document.getElementById('input-duzenle-stok-id').value = stok.id;
    document.getElementById('input-duzenle-stok-cinsi').value = stok.cinsi;
    document.getElementById('input-duzenle-stok-mm').value = stok.mm || '';
    document.getElementById('input-duzenle-stok-miktar').value = stok.miktar;
    document.getElementById('input-duzenle-stok-ebat').value = stok.ebat || '';
    document.getElementById('input-duzenle-stok-maliyet').value = stok.maliyet || 0;
    const kritikEl = document.getElementById('input-duzenle-stok-kritik');
    if (kritikEl) kritikEl.value = stok.kritikSeviye || 0;

    const maliyetContainer = document.getElementById('duzenle-stok-maliyet-container');
    if (maliyetContainer) {
        maliyetContainer.style.display = stok.sahibiTipi === 'musteri' ? 'none' : 'block';
    }

    openModal('modal-stok-duzenle');
};

window.updateStok = function() {
    try {
        const id = parseInt(document.getElementById('input-duzenle-stok-id').value);
        const cinsi = plainText(document.getElementById('input-duzenle-stok-cinsi').value);
        const mm = document.getElementById('input-duzenle-stok-mm').value;
        const miktar = Number(document.getElementById('input-duzenle-stok-miktar').value || 0);
        const ebat = document.getElementById('input-duzenle-stok-ebat').value;
        const maliyet = Number(document.getElementById('input-duzenle-stok-maliyet').value || 0);
        const kritikSeviye = Number(document.getElementById('input-duzenle-stok-kritik')?.value || 0);

        if (!cinsi) return alert('Malzeme cinsi zorunludur!');
        if (![miktar, maliyet, kritikSeviye].every(Number.isFinite)) return alert('Stok alanlarına geçerli sayılar girin!');
        if ([miktar, maliyet, kritikSeviye].some(value => value < 0)) return alert('Stok miktarı, maliyet ve kritik seviye negatif olamaz!');

        const stok = db.stoklar.find(s => s.id === id);
        if (!stok) return;
        const reservedQuantity = getReservedStockQuantity(stok.id, 'miktar');
        if (miktar < reservedQuantity) {
            return alert(`Bu malzemeden ${reservedQuantity} adet/plaka aktif iş emirlerine rezerve edildi. Fiziki miktar rezervasyonun altına düşürülemez.`);
        }
        const eskiMiktar = Number(stok.miktar) || 0;

        stok.cinsi = cinsi;
        stok.mm = mm;
        stok.miktar = miktar;
        stok.ebat = ebat;
        stok.kritikSeviye = kritikSeviye;
        if (stok.sahibiTipi !== 'musteri') {
            stok.maliyet = maliyet;
        }
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

        saveDB();
        closeModal('modal-stok-duzenle');
        renderStoklar();
    } catch(e) {
        alert("Stok güncellenirken hata oluştu: " + e.message);
    }
};

window.deleteStok = function(id) {
    const stok = db.stoklar.find(s => s.id === id);
    if (!stok) return alert('Stok kaydı bulunamadı.');

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
        addStokMovement(stok, {
            tip: 'Stok Silindi',
            alan: 'miktar',
            miktar: -(Number(stok.miktar) || 0),
            onceki: Number(stok.miktar) || 0,
            sonraki: 0,
            aciklama: 'Malzeme kaydı silindi',
            ref: stok.kodu || ''
        });
        db.stoklar = db.stoklar.filter(s => s.id !== id);
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

window.saveFire = function() {
    try {
        const sahibi = document.getElementById('input-fire-sahibi').value;
        const cariId = document.getElementById('input-fire-cari').value;
        const cinsi = document.getElementById('input-fire-cinsi').value;
        const mm = document.getElementById('input-fire-mm').value;
        const en = document.getElementById('input-fire-en').value;
        const boy = document.getElementById('input-fire-boy').value;

        if (!cinsi || !mm || !en || !boy) return alert("Lütfen tüm alanları doldurun!");
        if (sahibi === 'musteri' && !cariId) return alert("Lütfen müşteri seçin!");

        let sahibiText = "Biz";
        if (sahibi === 'musteri') {
            const cari = db.cariler.find(c => c.id == cariId);
            sahibiText = cari ? cari.adi : "Müşteri";
        }

        db.fireler.push({
            id: createRecordId(),
            cinsi, mm, en, boy,
            sahibi: sahibiText,
            sahibiTipi: sahibi,
            cariId: cariId,
            tarih: new Date().toLocaleDateString('tr-TR')
        });

        saveDB();
        closeModal('modal-fire');
        renderFireler();
        
        // Reset
        document.getElementById('input-fire-cinsi').value = '';
        document.getElementById('input-fire-mm').value = '';
        document.getElementById('input-fire-en').value = '';
        document.getElementById('input-fire-boy').value = '';
    } catch(e) {
        alert("Fire kaydedilirken hata oluştu: " + e.message);
    }
}

window.deleteFire = function(id) {
    const fire = db.fireler.find(f => f.id === id);
    if (!fire) return alert('Fire kaydı bulunamadı.');
    confirmAction('Bu fire/parça kaydı silinsin mi?', () => {
        db.fireler = db.fireler.filter(f => f.id !== id);
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
                <td>${escapeHTML(f.cinsi || '-')}</td>
                <td>${escapeHTML(f.mm || '-')} mm</td>
                <td>${escapeHTML(f.en || '-')}x${escapeHTML(f.boy || '-')}</td>
                <td><span class="badge ${f.sahibiTipi === 'musteri' ? 'info' : 'success'}">${escapeHTML(f.sahibi || 'Biz')}</span></td>
                <td>${escapeHTML(f.tarih || '-')}</td>
                <td><div class="table-actions destructive-actions">
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
    setSettingsTab('company');
    openModal('modal-ayarlar');
}

window.setSettingsTab = function(tab = 'company') {
    const validTab = ['company', 'numbering', 'backup'].includes(tab) ? tab : 'company';
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
    if (footer) footer.hidden = validTab === 'backup';
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

    const currentNumbering = mergeNumberingSettings(db.ayarlar?.numaralandirma);
    [
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

window.openIslemModal = function(id, adi) {
    document.getElementById('input-islem-cari-id').value = id;
    document.getElementById('input-islem-firma-adi').value = adi;
    document.getElementById('modal-islem-title').textContent = adi + " - İşlem Ekle";
    document.getElementById('input-islem-tutar').value = '';
    const orderSelect = document.getElementById('input-islem-order-id');
    if (orderSelect) {
        orderSelect.value = '';
        renderInvoiceOrderOptions(id);
    }
    const paymentOrderEl = document.getElementById('input-islem-payment-order-id');
    if (paymentOrderEl) paymentOrderEl.value = '';
    populateKasaOptions();
    updateIslemTipiInfo();
    openModal('modal-islem');
}

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
    return roundMoney(Math.max(Number(cari?.bakiye) || 0, 0));
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

window.saveIslem = function() {
    try {
        const cariId = parseInt(document.getElementById('input-islem-cari-id').value);
        const firmaAdi = document.getElementById('input-islem-firma-adi').value;
        const tip = document.getElementById('input-islem-tipi').value;
        const aciklama = document.getElementById('input-islem-aciklama')?.value || '';
        const faturaNo = document.getElementById('input-islem-fatura-no')?.value || '';
        const kasaId = document.getElementById('input-islem-kasa')?.value || '';
        const linkedOrderId = tip === 'fatura_kes' ? (document.getElementById('input-islem-order-id')?.value || '') : '';
        const linkedOrder = linkedOrderId ? getDBArray('isEmirleri').find(o => o.id == linkedOrderId) : null;
        const paymentOrderId = tip === 'tahsilat' ? (document.getElementById('input-islem-payment-order-id')?.value || '') : '';
        const paymentOrder = paymentOrderId ? getDBArray('isEmirleri').find(o => o.id == paymentOrderId) : null;
        const relatedOrder = linkedOrder || paymentOrder;
        const tutar = linkedOrder ? roundMoney(linkedOrder.total) : parseFloat(document.getElementById('input-islem-tutar').value);
        const ek = getAttachmentFromInputs('input-islem-ek', 'input-islem-ek-not');

        if (!Number.isFinite(tutar) || tutar <= 0) return alert("Geçerli bir tutar girin!");
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
            orderNo: relatedOrder?.orderNo || '',
            isSuccess: isSuccess,
            isGelir: isGelir,
            ek
        });
        scheduleAttachmentArchive(ek, 'Cari Islemler', cari.adi);

        let cashMovement = null;
        if (tip === 'tahsilat' || tip === 'odeme_yaptik') {
            cashMovement = addCashMovement(kasaId, {
                tip: tip === 'tahsilat' ? 'giris' : 'cikis',
                tutar,
                aciklama: `${cari.adi} - ${tipText}`,
                kaynak: 'cari-islem',
                refId: hareket?.id || null
            });
            if (!cashMovement) return alert('Kasa/banka hareketi oluşturulamadı. İşlem kaydedilmedi.');
            if (hareket) hareket.kasaHareketId = cashMovement.id;
        }

        if (tip === 'fatura_kes') {
            if (!db.faturalar) db.faturalar = [];
            const faturaId = createRecordId();
            db.faturalar.push({
                id: faturaId,
                tur: 'kesilen',
                faturaNo: faturaNo,
                cariId: cari.id,
                firma: cari.adi,
                aciklama: linkedOrder ? (aciklama || `${linkedOrder.orderNo} faturası`) : aciklama,
                tutar: tutar,
                tarih: new Date().toLocaleDateString('tr-TR'),
                cariYansitildi: true,
                cariBakiyeDegisimi: bakiyeArtisi,
                cariIslemId: hareket?.id || null,
                orderId: linkedOrder?.id || null,
                orderNo: linkedOrder?.orderNo || '',
                ek,
                kaynak: linkedOrder ? 'is-emri-faturasi' : 'cari-islem-faturasi'
            });
        }

        if (linkedOrder) {
            linkedOrder.faturaKesildi = true;
            linkedOrder.faturaNo = faturaNo;
            linkedOrder.faturaTarihi = new Date().toLocaleString('tr-TR');
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
            <td><strong>${escapeHTML(islem.tip)}</strong>${islem.aciklama ? `<br><span style="font-size:11px; color:var(--text-muted);">${escapeHTML(islem.aciklama)}</span>` : ''}</td>
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
                <td>${escapeHTML(s.kodu)}</td>
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
        window.currentStatData = (db.islemler || []).filter(i => i.isGelir).reverse();
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
        ? window.currentStatData.filter(cari => [cari.adi, cari.kodu, cari.tel, cari.telefon]
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
    if (islem.orderId && !isIncomeMovement(islem)) return 'İş Emri';
    if (islem.faturaId || getDBArray('faturalar').some(item => String(item.cariIslemId) === String(islem.id))) return 'Fatura';
    if (getDBArray('cekSenetler').some(item => String(item.cariIslemId) === String(islem.id))) return 'Çek / Senet';
    if (getDBArray('odemePlanlari').some(item => String(item.cariIslemId) === String(islem.id))) return 'Vade Planı';
    return '';
}

function canReverseCariMovement(islem) {
    return !!islem && !islem.reversedBy && !islem.reversalOf && !getCariMovementOwner(islem);
}

window.reverseCariMovement = function(id) {
    const original = getDBArray('islemler').find(item => String(item.id) === String(id));
    if (!original) return alert('Cari hareketi bulunamadı.');
    if (original.reversedBy) return alert('Bu cari hareketi daha önce geri alınmış.');
    if (original.reversalOf) return alert('Ters kayıt yeniden geri alınamaz.');

    const owner = getCariMovementOwner(original);
    if (owner) return alert(`Bu hareket ${owner} kaydına bağlı. İptal veya silme işlemini ilgili modülden yapın.`);

    const cari = findCariByReference(original.cariId, original.firma);
    if (!cari) return alert('Cari bulunamadığı için hareket geri alınamadı.');
    confirmAction(`${original.tip || 'Cari işlemi'} geri alınsın mı?\n\nCari ve kasa/banka etkisi ters kayıtla düzeltilecek.`, () => {
        const originalDelta = roundMoney(Number(original.bakiyeDegisimi) || 0);
        const originalCash = original.kasaHareketId
            ? getDBArray('kasaHareketleri').find(item => String(item.id) === String(original.kasaHareketId))
            : null;
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
    const faturaOrderContainer = document.getElementById('fatura-order-container');
    const kasaContainer = document.getElementById('islem-kasa-container');
    if (!infoEl) return;
    const msgs = {
        'tahsilat': '🟢 Müşteri size ödeme yaptı. Müşterinin borcu azalacak.',
        'fatura_kes': '🟡 Teslim edilmiş iş seçerseniz tutar otomatik gelir ve cari borç ikinci kez artmaz. Serbest fatura seçerseniz yeni borç oluşturur.',
        'mal_alimi': '🔴 Firmadan mal/hizmet aldınız. Siz o firmaya borçlandınız.',
        'odeme_yaptik': '🟢 Firmaya ödeme yaptınız. O firmaya olan borcunuz kapandı.'
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
    const aktifCariler = cariler.filter(c => !c.isPasif);
    const options = '<option value="">Seçiniz...</option>' + 
        '<option value="internal" style="font-weight:bold; color:var(--primary);">--- Kendi İşletmem (Firma İçi Üretim) ---</option>' +
        aktifCariler.map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu)})</option>`).join('');
    
    ['quote-customer', 'input-stok-cari', 'input-fire-cari', 'input-fatura-firma', 'input-ceksenet-cari', 'input-plan-cari'].forEach(id => {
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
            reversed: !!islem.reversedBy
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
                    ? `<button class="btn btn-outline" style="padding:4px 8px; font-size:12px;" onclick="reverseCariMovement(${escapeJSStringForAttr(h.id)})"><i class="fa-solid fa-rotate-left"></i> Geri Al</button>`
                    : (h.reversed ? '<span class="badge warning">Geri Alındı</span>' : '-')}
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

function getReservedStockQuantity(stokId, field = 'miktar', excludeOrderId = null) {
    if (stokId === undefined || stokId === null || String(stokId) === '0') return 0;
    return roundMoney(getDBArray('isEmirleri').reduce((total, order) => {
        if (!orderReservesStock(order) || String(order.stokId) !== String(stokId)) return total;
        if (excludeOrderId !== null && String(order.id) === String(excludeOrderId)) return total;
        const usage = getOrderStockUsage(order);
        return usage?.field === field ? total + usage.quantity : total;
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

window.updateQuoteMaterials = function() {
    const customerId = document.getElementById('quote-customer').value;
    const islemTipi = document.getElementById('quote-type')?.value || 'lazer';
    const stockField = islemTipi === 'hammadde' ? 'kg' : 'miktar';
    const stockUnit = stockField === 'kg' ? 'KG' : 'adet/plaka';
    const selectMaterial = document.getElementById('quote-material');
    if (!selectMaterial) return;
    const previousValue = selectMaterial.value;

    selectMaterial.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '0';
    defaultOption.textContent = 'Malzeme Müşteriden (Sıfır Maliyet)';
    selectMaterial.appendChild(defaultOption);
    
    // Add our materials
    db.stoklar.filter(s => s.sahibiTipi === 'biz' || !s.sahibiTipi).forEach(stok => {
        const option = document.createElement('option');
        option.value = stok.id;
        const available = getAvailableStockQuantity(stok, stockField);
        option.textContent = `[BİZ] ${plainText(stok.cinsi)} (${plainText(stok.mm)}mm) - Kullanılabilir: ${available} ${stockUnit} - ${formatCurrency(stok.maliyet)}/plaka`;
        selectMaterial.appendChild(option);
    });

    // Add this customer's materials
    if (customerId) {
        db.stoklar.filter(s => s.sahibiTipi === 'musteri' && s.cariId == customerId).forEach(stok => {
            const option = document.createElement('option');
            option.value = stok.id;
            const available = getAvailableStockQuantity(stok, stockField);
            option.textContent = `[EMANET] ${plainText(stok.cinsi)} (${plainText(stok.mm)}mm) - Kullanılabilir: ${available} ${stockUnit}`;
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

        const filteredStoklar = applyListSort('inventory', getFilteredStoklarForReport(), {
            code: item => item.kodu || '',
            material: item => item.cinsi || '',
            thickness: item => Number(item.mm) || 0,
            size: item => item.ebat || '',
            quantity: item => Number(item.miktar) || 0,
            weight: item => Number(item.kg) || 0,
            owner: item => item.sahibi || '',
            cost: item => Number(item.maliyet) || 0
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
            return `
            <tr>
                ${renderSelectionCell('inventory', stok.id)}
                <td style="width:80px;"><span class="badge" style="background:rgba(69, 123, 157, 0.2); color:var(--secondary); border:1px solid var(--secondary);">${escapeHTML(stok.kodu || '-')}</span></td>
                <td><strong>${escapeHTML(stok.cinsi || '-')}</strong></td>
                <td style="text-align:center;">${escapeHTML(stok.mm || '-')} mm</td>
                <td style="color:var(--text-muted);">${escapeHTML(stok.ebat || '-')}</td>
                <td style="text-align:center;">
                    <strong style="color:${kritikMi ? 'var(--alert)' : 'var(--text-main)'};">${stok.miktar || 0}</strong>
                    ${reservedPlates > 0 ? `<br><span class="dashboard-muted-text">Rezerve: ${reservedPlates} | Kullanılabilir: ${availablePlates}</span>` : ''}
                    ${kritikSeviye > 0 ? `<br><span class="dashboard-muted-text">Kritik: ${kritikSeviye} ${trackedQuantity.unit}</span>` : ''}
                </td>
                <td style="text-align:center;"><span style="color:var(--success); font-weight:600;">${stok.kg || 0} KG</span></td>
                <td style="text-align:center;"><span class="badge ${stok.sahibiTipi === 'musteri' ? 'info' : 'success'}">${escapeHTML(stok.sahibi || 'Biz')}</span></td>
                <td style="text-align:right; font-weight:600;">${stok.sahibiTipi === 'musteri' ? '-' : formatCurrency(stok.maliyet)}</td>
                <td style="text-align:right;"><div class="table-actions">
                    <button class="btn btn-outline table-action-button" aria-label="Stok kaydını düzenle" title="Düzenle" onclick="openStokDuzenleModal(${stok.id})"><i class="fa-solid fa-pen" aria-hidden="true"></i> Düzenle</button>
                    <button class="btn btn-danger table-action-button" aria-label="Stok kaydını sil" title="Sil" onclick="deleteStok(${stok.id})"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Sil</button>
                </div></td>
            </tr>
        `}).join('') || renderTableEmptyState(10, 'Stok kaydı bulunamadı.', 'Aramayı temizleyin veya yeni bir malzeme girişi yapın.', 'fa-boxes-stacked');
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
        movements = movements.filter(item => [item.stokAdi, item.stokKodu, item.tip, item.aciklama, item.ref, item.tarih]
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
            <td><strong>${escapeHTML(movement.stokAdi || '-')}</strong><br><span class="dashboard-muted-text">${escapeHTML(movement.stokKodu || '-')}</span></td>
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

        const incomeTransactions = (db.islemler || []).filter(isIncomeMovement);
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
                    <td><span class="badge ${badgeClass}">${escapeHTML(islem.tip || '-')}</span></td>
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
    openModal('modal-personel');
    refreshDateInputDisplay();
};

window.savePersonel = function() {
    const id = document.getElementById('input-personel-id')?.value || '';
    const ad = plainText(document.getElementById('input-personel-ad')?.value || '');
    const tel = plainText(document.getElementById('input-personel-tel')?.value || '');
    const gorev = plainText(document.getElementById('input-personel-gorev')?.value || '');
    const maasTipi = document.getElementById('input-personel-maas-tipi')?.value || 'aylik';
    const maas = roundMoney(parseFloat(document.getElementById('input-personel-maas')?.value || '0') || 0);
    const girisTarihiInput = document.getElementById('input-personel-giris')?.value || '';
    const durum = document.getElementById('input-personel-durum')?.value || 'Aktif';

    if (!ad) return alert('Personel adı zorunludur.');
    if (maas <= 0) return alert('Geçerli bir maaş / ücret girin.');

    const payload = {
        ad, tel: tel || '-', gorev: gorev || '-',
        maasTipi, maas, durum,
        girisTarihiInput,
        girisTarihi: girisTarihiInput ? formatDateInputDisplay(girisTarihiInput) : ''
    };

    if (id) {
        const personel = getPersonelById(id);
        if (personel) Object.assign(personel, payload);
    } else {
        db.personeller.push({
            id: createRecordId(),
            kodu: `P-${String(getDBArray('personeller').length + 1).padStart(3, '0')}`,
            ...payload
        });
    }

    saveDB();
    closeModal('modal-personel');
    renderPersonnel();
};

window.deletePersonel = function(id) {
    const hasPayroll = getDBArray('personelPuantajlari').some(record => String(record.personelId) === String(id));
    const personel = getPersonelById(id);
    if (!personel) return alert('Personel kaydı bulunamadı.');
    if (hasPayroll) {
        confirmAction('Bu personelin maaş kayıtları var. Geçmişi korumak için durumu “Ayrıldı” yapılsın mı?', () => {
            personel.durum = 'Ayrıldı';
            saveDB();
            renderPersonnel();
            showToast({ type: 'success', title: 'Personel güncellendi', message: `${personel.ad} “Ayrıldı” durumuna alındı.` });
        }, { title: 'Personel Durumunu Değiştir', confirmLabel: 'Ayrıldı Yap', danger: false });
    } else {
        confirmAction('Bu personel kaydı silinsin mi?', () => {
            db.personeller = getDBArray('personeller').filter(p => String(p.id) !== String(id));
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
    const id = document.getElementById('input-puantaj-id')?.value || '';
    const data = getPayrollInputs();
    const personel = getPersonelById(data.personelId);
    if (!personel) return alert('Personel seçin.');
    if (!data.donem) return alert('Dönem ayı seçin.');
    const numericValues = [data.geldiGun, data.izinGun, data.eksikGun, data.mesaiSaat, data.mesaiSaatUcreti, data.avans, data.prim];
    if (numericValues.some(value => !Number.isFinite(value) || value < 0)) return alert('Puantaj, mesai, avans ve prim değerleri negatif olamaz.');
    const [year, month] = data.donem.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    if (!Number.isFinite(daysInMonth) || data.geldiGun + data.izinGun + data.eksikGun > daysInMonth) {
        return alert(`Geldiği, izinli ve raporlu günlerin toplamı bu ayın ${daysInMonth || 31} gününü aşamaz.`);
    }
    const odendi = !!document.getElementById('input-puantaj-odendi')?.checked;
    const kasaId = document.getElementById('input-puantaj-kasa')?.value || '';
    if (odendi && !getDBArray('kasaHesaplari').some(kasa => kasa.id == kasaId)) {
        return alert('Maaş ödendi olarak kaydedilecekse kasa/banka hesabı seçin.');
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
        if (existing) return alert('Bu personel için seçilen dönemde zaten maaş / puantaj kaydı var. Mevcut kaydı düzenleyin.');
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
                    <td>${escapeHTML(personel.gorev || '-')}</td>
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
        <div class="metric-strip" aria-label="Bordro özeti">
            <div class="metric-item"><span class="metric-label">Brüt Maaş</span><strong class="metric-value">${escapeHTML(formatCurrency(calc.brut))}</strong></div>
            <div class="metric-item"><span class="metric-label">Toplam Kesinti</span><strong class="metric-value">${escapeHTML(formatCurrency(roundMoney(calc.kesinti + calc.avans)))}</strong></div>
            <div class="metric-item is-accent"><span class="metric-label">Net Ödenecek</span><strong class="metric-value">${escapeHTML(formatCurrency(calc.net))}</strong></div>
        </div>
        <div class="section-heading">
            <h2>Puantaj Bilgileri</h2>
            <span>${escapeHTML(formatMonthLabel(record.donem))}</span>
        </div>
        <table>
            <thead><tr><th>Dönem</th><th>Geldiği Gün</th><th>İzin</th><th>Eksik</th><th>Mesai</th><th>Durum</th></tr></thead>
            <tbody><tr><td>${escapeHTML(formatMonthLabel(record.donem))}</td><td>${record.geldiGun || 0}</td><td>${record.izinGun || 0}</td><td>${record.eksikGun || 0}</td><td>${record.mesaiSaat || 0} saat</td><td>${record.odendi ? 'Ödendi' : 'Bekliyor'}</td></tr></tbody>
        </table>
        <div class="document-footer-grid">
            <div class="document-note">
                <span class="document-note-title">Bordro Notu</span>
                ${record.not ? escapeHTML(record.not) : 'Personel maaş ve puantaj dökümüdür.'}
            </div>
            <table class="totals-panel" aria-label="Bordro tutar özeti">
                <tbody>
                    <tr><td>Brüt Maaş</td><td>${escapeHTML(formatCurrency(calc.brut))}</td></tr>
                    <tr><td>Eksik Gün Kesintisi</td><td>-${escapeHTML(formatCurrency(calc.kesinti))}</td></tr>
                    <tr><td>Avans / Kesinti</td><td>-${escapeHTML(formatCurrency(calc.avans))}</td></tr>
                    <tr><td>Fazla Mesai + Prim</td><td>${escapeHTML(formatCurrency(calc.ekOdeme))}</td></tr>
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
                    <td>${escapeHTML(g.aciklama || '-')}</td>
                    <td class="text-alert">${formatCurrency(g.tutar)}</td>
                    <td><div class="table-actions destructive-actions"><button class="btn btn-danger table-action-button" aria-label="Gider kaydını sil" title="Sil" onclick="deleteGider(${g.id})"><i class="fa-solid fa-trash" aria-hidden="true"></i> Sil</button></div></td>
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

window.saveGider = function() {
    try {
        const kategori = document.getElementById('input-gider-kategori').value;
        const aciklama = document.getElementById('input-gider-aciklama').value;
        const tutar = parseFloat(document.getElementById('input-gider-tutar').value);
        const kasaId = document.getElementById('input-gider-kasa')?.value || '';

        if (!Number.isFinite(tutar) || tutar <= 0) return alert('Geçerli bir tutar girin!');
        if (!getDBArray('kasaHesaplari').some(kasa => kasa.id == kasaId)) return alert('Giderin ödendiği kasa/banka hesabını seçin.');

        const gider = {
            id: createRecordId(),
            tarih: new Date().toLocaleDateString('tr-TR'),
            kategori,
            aciklama,
            tutar,
            kasaId
        };
        const cashMovement = addCashMovement(kasaId, {
            tip: 'cikis',
            tutar,
            aciklama: `${kategori || 'Gider'} - ${aciklama || 'Gider ödemesi'}`,
            kaynak: 'gider',
            refId: gider.id
        });
        gider.kasaHareketId = cashMovement?.id || null;
        db.giderler.push(gider);
        addAuditLog('Oluşturuldu', 'Gider', gider.id, `${kategori} / ${formatCurrency(tutar)}`);
        saveDB();
        closeModal('modal-gider');
        document.getElementById('input-gider-aciklama').value = '';
        document.getElementById('input-gider-tutar').value = '';
        showImpactSummary('Gider kaydedildi', [
            { label: 'Kasa', value: -tutar },
            { label: 'Gider', value: tutar }
        ], { message: `${kategori || 'Gider'}${aciklama ? ` / ${aciklama}` : ''}` });
    } catch(e) {
        alert('Gider kaydedilirken hata oluştu: ' + e.message);
    }
}

window.openGiderModal = function() {
    populateKasaOptions();
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
        if (gider.kasaHareketId) reverseCashMovement(gider.kasaHareketId, `Gider silindi: ${gider.aciklama || gider.kategori || ''}`);
        addAuditLog('Silindi', 'Gider', gider.id, `${gider.kategori || ''} / ${formatCurrency(gider.tutar)}`);
        db.giderler = db.giderler.filter(g => g.id !== id);
        saveDB();
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
        const availableQty = getAvailableStockQuantity(stok, stockField, excludeOrderId);
        const physicalQty = Number(stok[stockField]) || 0;
        const reservedQty = getReservedStockQuantity(stok.id, stockField, excludeOrderId);
        const unitLabel = islemTipi === 'hammadde' ? 'KG' : 'adet/plaka';
        if (requiredQty > availableQty) {
            alert(`Yetersiz Stok! Fiziki: ${physicalQty}, rezerve: ${reservedQty}, kullanılabilir: ${availableQty} ${unitLabel}. Lütfen miktarı düşürün.`);
            return null;
        }
    }

    const materialCostPerUnit = stok ? ((stok.sahibiTipi === 'biz' || !stok.sahibiTipi) ? stok.maliyet : 0) : 0;
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
            ['Teklif Tarihi', documentDate],
            ['Geçerlilik', '15 gün']
        ]))}
        <div class="document-intro-grid quote-intro">
            <div class="document-card">
                <div class="document-card-label">Teklif Verilen</div>
                <div class="document-card-value">${escapeHTML(quoteData.customerName || '-')}</div>
                <div class="document-card-detail">${escapeHTML(description)}</div>
            </div>
        </div>
        <div class="section-heading">
            <h2>Teklif Kalemleri</h2>
            <span>${lineItems.length} kalem</span>
        </div>
        <table class="quote-lines">
            <thead>
                <tr>
                    <th>No</th>
                    <th>Açıklama</th>
                    <th>Hesaplama</th>
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
            <table class="totals-panel" aria-label="Teklif tutar özeti">
                <tbody>
                    <tr><td>Brüt Tutar</td><td>${escapeHTML(formatCurrency(quoteData.subTotalBeforeDiscount ?? ((quoteData.operationCost || 0) + (quoteData.materialCost || 0))))}</td></tr>
                    <tr><td>İskonto (%${escapeHTML(quoteData.discountPercent || 0)})</td><td>-${escapeHTML(formatCurrency(quoteData.discountAmount || 0))}</td></tr>
                    <tr><td>Ara Toplam</td><td>${escapeHTML(formatCurrency(subTotal))}</td></tr>
                    <tr><td>KDV (%${escapeHTML(taxRate)})</td><td>${escapeHTML(formatCurrency(quoteData.tax || 0))}</td></tr>
                    <tr class="total-row"><td>Genel Toplam</td><td>${escapeHTML(formatCurrency(quoteData.total || 0))}</td></tr>
                </tbody>
            </table>
        </div>
        <div class="bank-details" aria-label="Banka ve IBAN bilgileri">
            <div class="bank-field"><span>Banka</span><strong>&nbsp;</strong></div>
            <div class="bank-field bank-field-iban"><span>IBAN</span><strong>&nbsp;</strong></div>
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
    `);
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
    
    // Update materials dropdown first
    updateQuoteMaterials();
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
    modal.classList.add('active');
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
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
                <td style="width:100px;"><span class="badge" style="background:rgba(233, 196, 106, 0.2); color:var(--warning); border:1px solid var(--warning); cursor:pointer; text-decoration:underline;" onclick="openOrderHistory(${o.id})" title="Tarihçeyi Gör">${escapeHTML(o.orderNo || '-')}</span></td>
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
        { type: 'stock', icon: 'fa-boxes-stacked', label: 'Stok', value: linked.stock ? `${linked.stock.kodu || ''} ${linked.stock.cinsi || ''}`.trim() : 'Müşteri malzemesi', enabled: !!linked.stock },
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

        if (movingToDelivered && stok && !order.stokDusuldu) {
            const oncekiStok = Number(stok[deductField]) || 0;
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
        if (!isNaN(m) && m <= currentMonth && date.getFullYear() === new Date().getFullYear() && isIncomeMovement(i)) {
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
        incomeGradient.addColorStop(0, 'rgba(6, 214, 160, 0.28)');
        incomeGradient.addColorStop(1, 'rgba(6, 214, 160, 0.015)');
        const expenseGradient = chartContext.createLinearGradient(0, 0, 0, chartHeight);
        expenseGradient.addColorStop(0, 'rgba(239, 71, 111, 0.18)');
        expenseGradient.addColorStop(1, 'rgba(239, 71, 111, 0.01)');
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
                        borderColor: 'rgba(6, 214, 160, 1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.34,
                        pointRadius: 3,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#0d1818',
                        pointBorderColor: 'rgba(6, 214, 160, 1)',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Gider',
                        data: expenseData,
                        backgroundColor: expenseGradient,
                        borderColor: 'rgba(239, 71, 111, 1)',
                        borderWidth: 2.25,
                        borderDash: [7, 5],
                        fill: true,
                        tension: 0.34,
                        pointRadius: 3,
                        pointStyle: 'rectRot',
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#1a1118',
                        pointBorderColor: 'rgba(239, 71, 111, 1)',
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
                        ticks: { color: 'rgba(248,249,250,0.58)', font: { size: 12, weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.045)', drawBorder: false },
                        border: { display: false },
                        ticks: {
                            color: 'rgba(248,249,250,0.55)',
                            callback: value => Number(value).toLocaleString('tr-TR')
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(248,249,250,0.86)',
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
    const accountOptions = getDBArray('kasaHesaplari').map(kasa => `<option value="${kasa.id}">${escapeHTML(kasa.ad)} (${escapeHTML(kasa.kodu || '-')}) - ${formatCurrency(kasa.bakiye || 0)}</option>`).join('');
    const optionMap = {
        'input-islem-kasa': '<option value="">Kasa/banka seçin...</option>' + accountOptions,
        'input-kasa-hareket-hesap': '<option value="">Hesap seçin...</option>' + accountOptions,
        'input-gider-kasa': '<option value="">Kasa/banka seçin...</option>' + accountOptions,
        'input-plan-kasa': '<option value="">Ödeme sırasında seçilecek</option>' + accountOptions,
        'input-puantaj-kasa': '<option value="">Kasa/banka seçin...</option>' + accountOptions,
        'input-ceksenet-kasa': '<option value="">Durum kapatılırken seçilecek</option>' + accountOptions,
        'input-settlement-kasa': '<option value="">Kasa/banka seçin...</option>' + accountOptions
    };
    Object.entries(optionMap).forEach(([id, options]) => {
        const el = document.getElementById(id);
        if (el) {
            const current = selectedId || el.value;
            el.innerHTML = options;
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
        accountBody.innerHTML = accounts.map(account => `
            <tr>
                <td><span class="badge">${escapeHTML(account.kodu || '-')}</span></td>
                <td><strong>${escapeHTML(account.ad || '-')}</strong></td>
                <td><span class="badge ${account.tip === 'banka' ? 'primary' : 'success'}">${account.tip === 'banka' ? 'Banka' : 'Nakit'}</span></td>
                <td style="text-align:right; font-weight:700; color:${(Number(account.bakiye) || 0) < 0 ? 'var(--alert)' : 'var(--success)'};">${formatCurrency(account.bakiye || 0)}</td>
            </tr>
        `).join('') || renderTableEmptyState(4, 'Kasa veya banka hesabı yok.', 'İlk hesabı ekleyerek finans hareketlerini takip etmeye başlayın.', 'fa-building-columns');
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
        movementBody.innerHTML = paginatedMovements.map(record => `
            <tr>
                <td>${escapeHTML(record.tarih || '-')}</td>
                <td>${escapeHTML(record.kasaAdi || '-')}</td>
                <td><span class="badge ${record.tip === 'giris' ? 'success' : 'alert'}">${record.tip === 'giris' ? 'Giriş' : 'Çıkış'}</span></td>
                <td>${escapeHTML(record.aciklama || record.kaynak || '-')}</td>
                <td style="text-align:right; font-weight:700; color:${record.tip === 'giris' ? 'var(--success)' : 'var(--alert)'};">${record.tip === 'giris' ? '+' : '-'}${formatCurrency(record.tutar || 0)}</td>
            </tr>
        `).join('') || renderTableEmptyState(5, 'Henüz kasa hareketi yok.', 'Tahsilat ve ödeme hareketleri burada görünecek.', 'fa-money-bill-transfer');
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
                    ${plan.durum === 'beklemede' ? `<button class="btn btn-outline table-action-button" onclick="openPaymentPlanSettlement('${plan.id}')"><i class="fa-solid fa-check" aria-hidden="true"></i> Ödendi İşle</button>` : ''}
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
            <div class="flex-between mb-4">
                <h3>Vade Planı Ekle</h3>
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
            <button class="btn btn-primary w-100 mt-4" onclick="savePaymentPlan()">Kaydet</button>
        </div>`;
    document.body.appendChild(modal);
}

window.openPaymentPlanModal = function(cariId = '') {
    ensurePaymentPlanModal();
    const select = document.getElementById('input-plan-cari');
    select.innerHTML = '<option value="">Cari seçin...</option>' + getDBArray('cariler').filter(c => !c.isPasif).map(c => `<option value="${c.id}">${escapeHTML(c.adi)} (${escapeHTML(c.kodu || '-')})</option>`).join('');
    if (cariId) select.value = cariId;
    document.getElementById('input-plan-tip').value = 'tahsilat';
    document.getElementById('input-plan-vade').value = toDateInputValue(new Date());
    document.getElementById('input-plan-aciklama').value = '';
    document.getElementById('input-plan-tutar').value = '';
    populateKasaOptions();
    openModal('modal-payment-plan');
};

window.savePaymentPlan = function() {
    const cariId = document.getElementById('input-plan-cari')?.value || '';
    const cari = findCariByReference(cariId);
    const tip = document.getElementById('input-plan-tip')?.value || 'tahsilat';
    const vade = toTRDateFromInput(document.getElementById('input-plan-vade')?.value || '');
    const aciklama = plainText(document.getElementById('input-plan-aciklama')?.value || '');
    const tutar = roundMoney(parseFloat(document.getElementById('input-plan-tutar')?.value || '0') || 0);
    const kasaId = document.getElementById('input-plan-kasa')?.value || '';
    if (!cari) return alert('Vade planı için cari seçin.');
    if (!document.getElementById('input-plan-vade')?.value) return alert('Vade tarihi seçin.');
    if (tutar <= 0) return alert('Geçerli tutar girin.');
    db.odemePlanlari.push({
        id: createRecordId(),
        planNo: generateSerialNo('odemePlani'),
        cariId: cari.id,
        firma: cari.adi,
        tip,
        vadeTarihi: vade,
        aciklama,
        tutar,
        kasaId: kasaId || null,
        durum: 'beklemede',
        tarih: new Date().toLocaleDateString('tr-TR')
    });
    const savedPlan = db.odemePlanlari[db.odemePlanlari.length - 1];
    addAuditLog('Oluşturuldu', 'Vade Planı', savedPlan.id, `${savedPlan.planNo} / ${savedPlan.firma} / ${formatCurrency(savedPlan.tutar)}`);
    saveDB();
    closeModal('modal-payment-plan');
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
    showImpactSummary(plan.tip === 'tahsilat' ? 'Vade tahsil edildi' : 'Vade ödemesi yapıldı', [
        { label: 'Cari', value: delta },
        { label: 'Kasa', value: plan.tip === 'tahsilat' ? plan.tutar : -plan.tutar }
    ], { message: `${plan.planNo} / ${plan.firma}` });
};

window.deletePaymentPlan = function(id) {
    const plan = getDBArray('odemePlanlari').find(p => String(p.id) === String(id));
    if (!plan) return alert('Vade planı bulunamadı.');
    confirmAction('Bu vade planı silinsin mi? Ödenmiş bir plansa cari ve kasa etkileri ters kayıtla düzeltilecek.', () => {
        const originalDelta = plan.tip === 'tahsilat' ? -plan.tutar : plan.tutar;
        if (plan.durum === 'odendi') {
            const cari = findCariByReference(plan.cariId, plan.firma);
            if (!cari) return alert('Cari bulunamadığı için ödenmiş vade planı silinemedi.');
            addCariMovement(cari, {
                tip: `Vade Planı Silindi (${plan.planNo})`,
                aciklama: 'Ödenmiş vade planı silindi; cari etkisi ters kayıtla geri alındı.',
                tutar: plan.tutar,
                bakiyeDegisimi: -originalDelta,
                isSuccess: false,
                isGelir: false
            });
            if (plan.kasaHareketId) reverseCashMovement(plan.kasaHareketId, `Vade planı silindi: ${plan.planNo}`);
        }
        addAuditLog('Silindi', 'Vade Planı', plan.id, `${plan.planNo} / ${plan.firma} / ${plan.durum}`);
        db.odemePlanlari = getDBArray('odemePlanlari').filter(p => String(p.id) !== String(id));
        saveDB();
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
                <div class="flex-between mb-4">
                    <h3>Kasa / Banka Hesabı Ekle</h3>
                    <button class="btn-close" onclick="closeModal('modal-kasa-hesap')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="form-group"><label>Hesap Adı</label><input id="input-kasa-ad" class="form-control" placeholder="Örn: İş Bankası"></div>
                <div class="form-group"><label>Tip</label><select id="input-kasa-tip" class="form-control"><option value="nakit">Nakit Kasa</option><option value="banka">Banka</option></select></div>
                <div class="form-group"><label>Açılış Bakiyesi</label><input id="input-kasa-bakiye" type="number" class="form-control" placeholder="0"></div>
                <button class="btn btn-primary w-100 mt-4" onclick="saveKasaHesap()">Kaydet</button>
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
                <div class="form-group"><label>Açıklama</label><input id="input-kasa-hareket-aciklama" class="form-control" placeholder="Örn: Elden tahsilat"></div>
                <div class="form-group"><label>Tutar</label><input id="input-kasa-hareket-tutar" type="number" class="form-control" placeholder="0"></div>
                <button class="btn btn-primary w-100 mt-4" onclick="saveKasaHareket()">Kaydet</button>
            </div>`;
        document.body.appendChild(modal);
    }
}

window.openKasaHesapModal = function() {
    ensureKasaModals();
    document.getElementById('input-kasa-ad').value = '';
    document.getElementById('input-kasa-tip').value = 'nakit';
    document.getElementById('input-kasa-bakiye').value = '';
    openModal('modal-kasa-hesap');
};

window.saveKasaHesap = function() {
    const ad = plainText(document.getElementById('input-kasa-ad')?.value || '');
    const tip = document.getElementById('input-kasa-tip')?.value || 'nakit';
    const rawBakiye = parseFloat(document.getElementById('input-kasa-bakiye')?.value || '0');
    const bakiye = roundMoney(rawBakiye || 0);
    if (!ad) return alert('Hesap adı zorunludur.');
    if (!Number.isFinite(rawBakiye)) return alert('Geçerli bir açılış bakiyesi girin.');
    const account = { id: createRecordId(), kodu: generateSerialNo('kasa'), ad, tip, bakiye, tarih: new Date().toLocaleDateString('tr-TR') };
    db.kasaHesaplari.push(account);
    if (bakiye !== 0) {
        db.kasaHareketleri.push({ id: createRecordId(), kasaId: account.id, kasaAdi: account.ad, tip: bakiye >= 0 ? 'giris' : 'cikis', tutar: Math.abs(bakiye), aciklama: 'Açılış bakiyesi', kaynak: 'kasa-acilis', tarih: new Date().toLocaleString('tr-TR') });
    }
    saveDB();
    closeModal('modal-kasa-hesap');
};

window.openKasaHareketModal = function() {
    ensureKasaModals();
    populateKasaOptions();
    document.getElementById('input-kasa-hareket-tip').value = 'giris';
    document.getElementById('input-kasa-hareket-aciklama').value = '';
    document.getElementById('input-kasa-hareket-tutar').value = '';
    openModal('modal-kasa-hareket');
};

window.saveKasaHareket = function() {
    const kasaId = document.getElementById('input-kasa-hareket-hesap')?.value || '';
    const tip = document.getElementById('input-kasa-hareket-tip')?.value || 'giris';
    const aciklama = plainText(document.getElementById('input-kasa-hareket-aciklama')?.value || '');
    const tutar = parseFloat(document.getElementById('input-kasa-hareket-tutar')?.value || '0');
    if (!kasaId) return alert('Kasa/banka hesabı seçin.');
    if (!Number.isFinite(tutar) || tutar <= 0) return alert('Geçerli tutar girin.');
    const movement = addCashMovement(kasaId, { tip, tutar, aciklama, kaynak: 'manuel' });
    if (!movement) return alert('Kasa/banka hareketi oluşturulamadı.');
    saveDB();
    closeModal('modal-kasa-hareket');
    showImpactSummary('Kasa hareketi kaydedildi', [
        { label: 'Kasa', value: tip === 'giris' ? tutar : -tutar }
    ], { message: aciklama || (tip === 'giris' ? 'Manuel para girişi' : 'Manuel para çıkışı') });
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
        { name: 'Profitability', fn: renderProfitability },
        { name: 'CashBank', fn: renderCashBank },
        { name: 'Personnel', fn: renderPersonnel },
        { name: 'Orders', fn: renderOrders },
        { name: 'Cheques', fn: renderCekSenetler },
        { name: 'SidebarBadges', fn: updateSidebarBadges },
        { name: 'QuoteMaterials', fn: updateQuoteMaterials },
        { name: 'QuoteHistory', fn: renderQuoteHistory }
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
            if (startupHasValidLocalDB) {
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
                db = validateAndNormalizeDB(response.data);
                try {
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                } catch (error) {
                    console.warn('Disk verisi yüklendi ancak yerel önbellek güncellenemedi:', error);
                }
                startupHasValidLocalDB = true;
                startupPersistenceBlocked = false;
                renderAll();
                return { success: true, source: 'disk' };
            }
            if (response?.missing) {
                const source = startupHasValidLocalDB ? 'local-storage-migrated' : 'new-install';
                const saveResult = await saveDB(true);
                return saveResult.success
                    ? { success: true, source, cacheWarning: !!saveResult.cacheWarning }
                    : saveResult;
            }
            throw new Error(response?.error || 'Kalıcı veri dosyası okunamadı.');
        } catch (error) {
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
    document.querySelectorAll('.nav-group').forEach(group => setNavGroupState(group, willOpen && group === selectedGroup));
};

function openNavGroupForTarget(target) {
    const activeItem = document.querySelector(`.nav-item[data-target="${target}"]`);
    const activeGroup = activeItem?.closest('.nav-group') || null;
    document.querySelectorAll('.nav-group').forEach(group => setNavGroupState(group, group === activeGroup));
}

window.switchView = function(target) {
    if (!target) target = 'dashboard';
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
                    case 'scraps': renderFireler(); break;
                    case 'expenses': renderExpenses(); break;
                    case 'profitability': renderProfitability(); break;
                    case 'cashbank': renderCashBank(); break;
                    case 'personnel': renderPersonnel(); break;
                    case 'cheques': renderCekSenetler(); break;
                    case 'invoices': renderInvoices(); break;
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
    const materialCostPerUnit = stok ? ((stok.sahibiTipi === 'biz' || !stok.sahibiTipi) ? stok.maliyet : 0) : 0;
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
        .filter(c => !c.isPasif)
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
        if (!kasa) return false;
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
        addCariMovement(cari, {
            tip: `${getCekSenetTypeLabel(record.tip)} Geri Alındı`,
            aciklama: `${record.belgeNo || 'Belge'} durumu ${getCekSenetStatusLabel(record.durum)} yapıldı; cari etkisi geri alındı.`,
            tutar: record.tutar,
            bakiyeDegisimi: -oldDelta,
            isSuccess: false,
            isGelir: false,
            ek: record.ek || null
        });
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

window.openCekSenetModal = function() {
    populateCekSenetCariOptions();
    updateCekSenetStatusOptions();
    const noEl = document.getElementById('input-ceksenet-no');
    if (noEl && !noEl.value) noEl.placeholder = previewSerialNo('cekSenet');
    const vadeEl = document.getElementById('input-ceksenet-vade');
    if (vadeEl && !vadeEl.value) vadeEl.value = toDateInputValue(new Date());
    populateKasaOptions();
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
    const ek = getAttachmentFromInputs('input-ceksenet-ek', 'input-ceksenet-ek-not');

    if (!cari) return alert('Çek/senet için cari seçin.');
    if (!tutar || tutar <= 0) return alert('Geçerli bir tutar girin.');
    if (!vadeValue) return alert('Vade tarihi seçin.');
    if (hasDuplicateCekSenetNo(belgeNo)) return alert('Bu çek/senet numarası daha önce kullanılmış. Farklı bir belge numarası girin.');
    const willSettle = (CEK_SENET_TYPES[tip]?.direction === 'incoming' && durum === 'tahsil_edildi') || (CEK_SENET_TYPES[tip]?.direction === 'outgoing' && durum === 'odendi');
    if (willSettle && !getDBArray('kasaHesaplari').some(item => item.id == kasaId)) {
        return alert('Tahsil edilen veya ödenen çek/senet için kasa/banka hesabı seçin.');
    }

    const record = {
        id: createRecordId(),
        tip,
        cariId: cari.id,
        firma: cari.adi,
        belgeNo,
        banka,
        vadeTarihi: toTRDateFromInput(vadeValue),
        tutar,
        durum,
        kasaId: kasaId || null,
        aciklama,
        ek,
        tarih: new Date().toLocaleDateString('tr-TR'),
        cariYansitildi: false,
        cariBakiyeDegisimi: 0
    };

    db.cekSenetler.push(record);
    scheduleAttachmentArchive(ek, 'Cek Senet', cari.adi);
    syncCekSenetCariEffect(record, kasaId);
    addAuditLog('Oluşturuldu', 'Çek / Senet', record.id, `${record.belgeNo} / ${record.firma} / ${getCekSenetStatusLabel(record.durum)}`);
    saveDB();
    closeModal('modal-ceksenet');

    ['input-ceksenet-no', 'input-ceksenet-banka', 'input-ceksenet-tutar', 'input-ceksenet-aciklama', 'input-ceksenet-ek-not'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const ekEl = document.getElementById('input-ceksenet-ek');
    if (ekEl) ekEl.value = '';
    const cariEl = document.getElementById('input-ceksenet-cari');
    if (cariEl) cariEl.value = '';
    if (record.cariYansitildi) {
        showImpactSummary(`${getCekSenetTypeLabel(tip)} kaydedildi`, [
            { label: 'Cari', value: record.cariBakiyeDegisimi },
            { label: 'Kasa', value: getCekSenetDirection(record) === 'incoming' ? tutar : -tutar }
        ], { message: `${getCekSenetStatusLabel(durum)} / ${cari.adi}` });
    } else {
        showToast({ type: 'success', title: `${getCekSenetTypeLabel(tip)} kaydedildi`, message: `${getCekSenetStatusLabel(durum)} / ${cari.adi}` });
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

window.deleteCekSenet = function(id) {
    const record = getDBArray('cekSenetler').find(item => item.id == id);
    if (!record) return alert('Çek/senet kaydı bulunamadı.');
    confirmAction('Bu çek/senet kaydı silinsin mi? Tahsil edilmiş veya ödenmişse cari ve kasa etkileri geri alınacak.', () => {
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
            <td style="color:var(--text-muted); font-size:13px;">${escapeHTML(f.aciklama || '-')}${renderAttachmentBadge(f)}</td>
            <td style="text-align:right; font-weight:600; color:${f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)'};">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}</td>
            <td style="text-align:right;"><div class="table-actions">
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
    const f = (db.faturalar || []).find(x => x.id === id);
    if (!f) return;

    const turLabel = f.tur === 'kesilen' ? 'Kesilen Fatura' : 'Alınan Fatura';
    const turIcon = f.tur === 'kesilen' ? 'fa-arrow-up-from-bracket' : 'fa-arrow-down-to-bracket';
    const turColor = f.tur === 'kesilen' ? 'var(--success)' : 'var(--alert)';

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
                    <tr><td style="color:var(--text-muted);">Firma / Müşteri</td><td><strong>${escapeHTML(f.firma)}</strong></td></tr>
                    <tr><td style="color:var(--text-muted);">Açıklama</td><td>${escapeHTML(f.aciklama || '-')}</td></tr>
                    ${f.ek ? `<tr><td style="color:var(--text-muted);">Belge Eki</td><td><strong>${escapeHTML(f.ek.name || 'Ek belge')}</strong>${f.ek.note ? `<br><span class="dashboard-muted-text">${escapeHTML(f.ek.note)}</span>` : ''}</td></tr>` : ''}
                    <tr style="border-top:2px solid var(--border);">
                        <td style="font-weight:700; font-size:15px; padding-top:10px;">TUTAR</td>
                        <td style="font-weight:700; font-size:20px; color:${turColor}; padding-top:10px;">${f.tur === 'kesilen' ? '+' : '-'}${formatCurrency(f.tutar)}</td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top:16px; display:flex; gap:8px;">
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
    modal.classList.add('active');
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
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
    const descriptionEl = document.getElementById('input-fatura-aciklama');
    const helper = document.getElementById('fatura-order-helper');
    if (!amountEl) return;

    amountEl.readOnly = Boolean(linkedOrder);
    amountEl.classList.toggle('form-control-readonly', Boolean(linkedOrder));

    if (linkedOrder) {
        amountEl.value = roundMoney(linkedOrder.total);
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
    window.updateInvoiceModalMode();
    openModal('modal-fatura');
};

window.saveFatura = function() {
    try {
        const tur = document.getElementById('input-fatura-tur').value;
        const faturaNo = document.getElementById('input-fatura-no').value.trim() || generateSerialNo('fatura');
        const firmaSelect = document.getElementById('input-fatura-firma');
        const firmaId = firmaSelect.value;
        const firma = firmaSelect.options[firmaSelect.selectedIndex]?.text || '';
        const aciklama = document.getElementById('input-fatura-aciklama').value.trim();
        const linkedOrder = tur === 'kesilen' ? getSelectedInvoiceModalOrder() : null;
        const tutar = linkedOrder
            ? roundMoney(linkedOrder.total)
            : parseFloat(document.getElementById('input-fatura-tutar').value);
        const ek = getAttachmentFromInputs('input-fatura-ek', 'input-fatura-ek-not');

        if (!firmaId) return alert('Firma seçimi zorunludur!');
        if (firmaId === 'internal') return alert('Fatura için gerçek bir cari seçin. Firma içi üretim faturalandırılamaz.');
        if (!Number.isFinite(tutar) || tutar <= 0) return alert('Geçerli bir tutar girin!');

        const cari = findCariByReference(firmaId, firma);
        if (!cari) return alert(`Cari bulunamadı: ${firma}\n\nFatura kaydedilmedi.`);
        if (hasDuplicateInvoiceNo(faturaNo, { tur, cariId: cari.id })) return alert('Bu fatura numarası daha önce kullanılmış. Farklı bir fatura numarası girin.');
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
            tutar: tutar,
            tarih: new Date().toLocaleDateString('tr-TR'),
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
            linkedOrder.faturaTarihi = new Date().toLocaleString('tr-TR');
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
        document.getElementById('input-fatura-tutar').value = '';
        document.getElementById('input-fatura-tutar').readOnly = false;
        document.getElementById('input-fatura-tutar').classList.remove('form-control-readonly');
        delete document.getElementById('input-fatura-tutar').dataset.invoiceOrderId;
        delete document.getElementById('input-fatura-aciklama').dataset.invoiceOrderDescription;
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
    }
};

window.deleteFatura = function(id) {
    const fatura = (db.faturalar || []).find(f => f.id === id);
    if (!fatura) return alert('Fatura kaydı bulunamadı.');
    confirmAction('Bu fatura kaydı silinsin mi? Cari etkisi varsa ters kayıtla geri alınacak.', () => {
        const originalBakiyeDegisimi = typeof fatura.cariBakiyeDegisimi === 'number'
            ? fatura.cariBakiyeDegisimi
            : (fatura.tur === 'kesilen' ? fatura.tutar : -fatura.tutar);

        if (fatura.cariYansitildi) {
            const cari = findCariByReference(fatura.cariId, fatura.firma);
            if (!cari) {
                alert(`Cari bulunamadı: ${fatura.firma}\n\nFatura silinmedi; çünkü cari bakiyesi geri alınamadı.`);
                return;
            }

            addCariMovement(cari, {
                tip: `Fatura Silindi (${fatura.faturaNo})`,
                aciklama: originalBakiyeDegisimi === 0
                    ? 'Fatura kaydı iptal edildi. Satış teslim aşamasında cari hesaba işlendiği için bakiye değişmedi.'
                    : 'Fatura kaydı silindi, cari etkisi geri alındı.',
                faturaNo: fatura.faturaNo,
                faturaId: fatura.id,
                orderId: fatura.orderId || null,
                orderNo: fatura.orderNo || '',
                tutar: fatura.tutar,
                bakiyeDegisimi: -originalBakiyeDegisimi,
                isSuccess: false,
                isGelir: false
            });
        }

        if (fatura.orderId) {
            const order = getDBArray('isEmirleri').find(o => o.id == fatura.orderId);
            if (order) {
                order.faturaKesildi = false;
                order.faturaNo = '';
                order.faturaTarihi = '';
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

function enhanceCloseButtons() {
    document.querySelectorAll('.btn-close').forEach(button => {
        if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Pencereyi kapat');
        if (!button.hasAttribute('title')) button.setAttribute('title', button.getAttribute('aria-label'));
        if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
        button.querySelector('i')?.setAttribute('aria-hidden', 'true');
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        addLog("Uygulama başlatıldı.");
        enhanceCloseButtons();
        enhanceFilterPanels();
        enhanceQuoteSections();
        enhanceInnerPageActions();
        enhanceContentPageLayouts();
        await renderAppVersion();
        await hydrateDBFromFileIfNeeded();
        const hash = window.location.hash.substring(1) || 'dashboard';
        switchView(hash);
    } catch (e) {
        console.error("Initialization Error:", e);
    }
});
window.createManualBackup = async function() {
    if (window.electronAPI && window.electronAPI.manualBackup) {
        let data;
        try {
            data = JSON.stringify(validateAndNormalizeDB(db));
        } catch (error) {
            return alert(`Yedeklenecek veri doğrulanamadı: ${error?.message || String(error)}`);
        }
        
        const response = await window.electronAPI.manualBackup(data);
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
