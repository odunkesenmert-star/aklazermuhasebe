const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf-8');
const appCode = fs.readFileSync('./app.js', 'utf-8');

function createStorage(initial = {}, options = {}) {
    let values = { ...initial };
    return {
        getItem: key => values[key] ?? null,
        setItem: (key, value) => {
            if (options.throwOnSet) throw new Error('QuotaExceededError');
            values[key] = value;
        },
        clear: () => { values = {}; },
        snapshot: () => ({ ...values })
    };
}

async function createApp(loadResponse, options = {}) {
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost' });
    const savedPayloads = [];
    const initialStorage = options.localDatabase
        ? { AkLazerDB: JSON.stringify(options.localDatabase) }
        : {};
    const storage = createStorage(initialStorage, { throwOnSet: !!options.throwOnSet });
    Object.defineProperty(dom.window, 'localStorage', { value: storage, configurable: true });
    dom.window.alert = () => {};
    dom.window.confirm = () => true;
    dom.window.electronAPI = {
        loadDBFromFile: async () => loadResponse,
        saveDBToFile: async data => {
            savedPayloads.push(data);
            return { success: true };
        },
        sendBackup: async () => ({ success: true })
    };

    const script = dom.window.document.createElement('script');
    script.textContent = appCode;
    dom.window.document.body.appendChild(script);
    return { dom, savedPayloads, storage };
}

(async () => {
    const diskDatabase = {
        schemaVersion: 2,
        cariler: [{ id: 9001, kodu: 'C-DISK', adi: 'Diskteki Gerçek Cari', bakiye: 750 }],
        stoklar: [],
        islemler: [],
        ayarlar: { firmaAdi: 'AK LAZER' }
    };
    const localDatabase = {
        schemaVersion: 3,
        cariler: [{ id: 8001, kodu: 'C-LOCAL', adi: 'Eski Yerel Cari', bakiye: 10 }],
        ayarlar: { firmaAdi: 'AK LAZER' }
    };
    const existing = await createApp(
        { success: true, data: JSON.stringify(diskDatabase) },
        { localDatabase }
    );
    assert.strictEqual(existing.savedPayloads.length, 0, 'App must not write defaults before disk hydration.');
    await existing.dom.window.eval('hydrateDBFromFileIfNeeded()');
    const hydrated = existing.dom.window.eval('db');
    assert.strictEqual(hydrated.cariler[0].adi, 'Diskteki Gerçek Cari');
    assert.strictEqual(existing.storage.snapshot().AkLazerDB.includes('Diskteki Gerçek Cari'), true, 'Disk data must refresh the local cache.');
    assert.strictEqual(existing.savedPayloads.length, 0, 'Hydrating valid disk data must not overwrite it.');

    const migratedLocal = await createApp(
        { success: false, missing: true },
        { localDatabase }
    );
    const migrationResult = await migratedLocal.dom.window.eval('hydrateDBFromFileIfNeeded()');
    assert.strictEqual(migrationResult.source, 'local-storage-migrated', 'A valid legacy local database should migrate to a missing disk store.');
    assert.strictEqual(JSON.parse(migratedLocal.savedPayloads[0]).cariler[0].adi, 'Eski Yerel Cari', 'Local migration must preserve existing records.');

    const cacheLimited = await createApp(
        { success: true, data: JSON.stringify(diskDatabase) },
        { localDatabase, throwOnSet: true }
    );
    const cacheHydration = await cacheLimited.dom.window.eval('hydrateDBFromFileIfNeeded()');
    assert.strictEqual(cacheHydration.success, true, 'Disk hydration must succeed even when localStorage is full.');
    cacheLimited.dom.window.eval("db.cariler[0].bakiye = 975");
    const cacheLimitedSave = await cacheLimited.dom.window.eval('saveDB(true)');
    assert.strictEqual(cacheLimitedSave.success, true, 'Disk persistence must continue when localStorage cannot be updated.');
    assert.strictEqual(cacheLimitedSave.cacheWarning, true, 'A local cache failure should be reported as a non-fatal warning.');
    assert.strictEqual(JSON.parse(cacheLimited.savedPayloads.at(-1)).cariler[0].bakiye, 975, 'The newest database must still be written to disk.');

    const fresh = await createApp({ success: false, missing: true });
    await fresh.dom.window.eval('hydrateDBFromFileIfNeeded()');
    assert.strictEqual(fresh.savedPayloads.length, 1, 'A genuinely new install should persist its initial database once.');
    const freshDatabase = JSON.parse(fresh.savedPayloads[0]);
    ['cariler', 'stoklar', 'islemler', 'teklifler', 'isEmirleri', 'faturalar'].forEach(key => {
        assert.deepStrictEqual(freshDatabase[key], [], `A new install must start with an empty ${key} collection.`);
    });
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.cari.next, 1, 'A new install must start customer numbering at C-001.');
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.stok.next, 1, 'A new install must start stock numbering at STK-0001.');
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.teklif.next, 1, 'A new install must start quote numbering at TEK-YYYY-0001.');
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.isEmri.next, 1, 'A new install must start work-order numbering at EMR-000001.');
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.fatura.next, 1, 'A new install must start invoice numbering at FTR-YYYY-0001.');
    assert.strictEqual(freshDatabase.ayarlar.numaralandirma.kasa.next, 2, 'The next cash account must follow the built-in KASA-001 account.');

    console.log('Açılış ve kalıcı veri önceliği testleri geçti.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
