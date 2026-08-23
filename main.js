const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const MAX_DATABASE_BYTES = 50 * 1024 * 1024;
const MAX_PDF_HTML_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_UPDATE_MANIFEST_BYTES = 64 * 1024;
const UPDATE_MANIFEST_URL = 'https://aklazer.com.tr/erp-version.json';
const ALLOWED_UPDATE_HOSTS = new Set(['aklazer.com.tr', 'www.aklazer.com.tr']);
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic'
]);

function getAppDocumentURL() {
    return pathToFileURL(path.join(__dirname, 'index.html')).href;
}

function parseVersionParts(value) {
    const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    if (!leftParts || !rightParts) return 0;
    for (let index = 0; index < 3; index += 1) {
        if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
    }
    return 0;
}

function isAllowedUpdateURL(value) {
    try {
        const candidate = new URL(String(value || ''));
        return candidate.protocol === 'https:' && ALLOWED_UPDATE_HOSTS.has(candidate.hostname);
    } catch (_) {
        return false;
    }
}

function getUpdateDownloadURL(manifest = {}) {
    const platformKey = process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : process.platform);
    const candidate = manifest.downloads?.[platformKey] || manifest.downloadPage || '';
    return isAllowedUpdateURL(candidate) ? candidate : '';
}

async function fetchUpdateManifest() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
        const response = await net.fetch(UPDATE_MANIFEST_URL, {
            signal: controller.signal,
            headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) throw new Error(`Sürüm sunucusu ${response.status} yanıtı verdi.`);
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_UPDATE_MANIFEST_BYTES) {
            throw new Error('Sürüm bilgisi izin verilen boyutu aşıyor.');
        }
        const manifest = JSON.parse(text);
        if (!parseVersionParts(manifest?.version)) throw new Error('Sürüm bilgisi geçersiz.');
        return manifest;
    } finally {
        clearTimeout(timeout);
    }
}

function isTrustedAppURL(value) {
    try {
        const candidate = new URL(String(value || ''));
        const trusted = new URL(getAppDocumentURL());
        return candidate.protocol === 'file:' && candidate.pathname === trusted.pathname;
    } catch (_) {
        return false;
    }
}

function assertTrustedSender(event) {
    const senderFrame = event?.senderFrame;
    const mainFrame = event?.sender?.mainFrame;
    if (senderFrame && mainFrame && (
        senderFrame.processId !== mainFrame.processId || senderFrame.routingId !== mainFrame.routingId
    )) {
        throw new Error('Alt çerçevelerden gelen masaüstü istekleri reddedildi.');
    }
    const senderURL = senderFrame?.url || event?.sender?.getURL?.() || '';
    if (!isTrustedAppURL(senderURL)) {
        throw new Error('Güvenilmeyen bir sayfadan gelen masaüstü isteği reddedildi.');
    }
}

function validateDatabasePayload(data) {
    if (typeof data !== 'string' || !data.trim()) {
        throw new Error('Veritabanı içeriği boş veya geçersiz.');
    }
    if (Buffer.byteLength(data, 'utf8') > MAX_DATABASE_BYTES) {
        throw new Error('Veritabanı dosyası izin verilen 50 MB sınırını aşıyor.');
    }
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Veritabanı içeriği geçerli bir JSON objesi değil.');
    }
    return data;
}

function resolveSafeAttachmentPath(filePath) {
    const requestedPath = String(filePath || '');
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
        throw new Error('Belge yolu geçersiz.');
    }
    if (!fs.existsSync(requestedPath)) throw new Error('Belge dosyası bulunamadı.');
    const resolvedPath = fs.realpathSync(requestedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
        throw new Error('Yalnızca PDF ve görsel belge eklerine izin verilir.');
    }
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) throw new Error('Seçilen belge geçerli bir dosya değil.');
    if (stats.size > MAX_ATTACHMENT_BYTES) throw new Error('Belge eki 50 MB sınırını aşıyor.');
    return resolvedPath;
}

function getDBFilePath() {
    return path.join(app.getPath('userData'), 'ak-lazer-db.json');
}

function writeTextFileAtomic(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, data, 'utf-8');
    fs.renameSync(tempPath, filePath);
}

function getBackupFiles(rootPath) {
    if (!fs.existsSync(rootPath)) return [];
    return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) return getBackupFiles(entryPath);
        return entry.isFile() && /^yedek-.*\.json$/i.test(entry.name) ? [entryPath] : [];
    });
}

function writeRotatingBackup(data) {
    const date = new Date();
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const backupRoot = path.join(app.getPath('documents'), 'AkLazerYedek');
    const backupDir = path.join(backupRoot, year, month);
    const filePath = path.join(backupDir, `yedek-${year}-${month}-${day}-${hour}-${minute}.json`);

    writeTextFileAtomic(filePath, data);

    const files = getBackupFiles(backupRoot)
        .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    files.slice(60).forEach(item => fs.rmSync(item.file, { force: true }));
    return filePath;
}

function makeSafeFileName(value) {
    return String(value || 'belge')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'belge';
}

function makeArchivePath(payload = {}) {
    const docsPath = app.getPath('documents');
    const category = makeSafeFileName(payload.category || 'Belgeler');
    const ownerName = makeSafeFileName(payload.ownerName || 'Genel');
    const sourceExtension = path.extname(payload.sourcePath || '').toLowerCase();
    const requestedName = payload.fileName || path.basename(payload.sourcePath || 'belge');
    const fileName = `${makeSafeFileName(path.basename(requestedName, path.extname(requestedName)))}${sourceExtension}`;
    return path.join(docsPath, 'AkLazerBelgeler', category, ownerName, `${new Date().toISOString().slice(0, 10)}-${Date.now()}-${fileName}`);
}

function preparePDFHTML(html) {
    const appBaseHref = getAppDocumentURL();
    const baseTag = `<base href="${appBaseHref}">`;
    if (/<base\s+[^>]*href=/i.test(html)) {
        return html.replace(/<base\s+[^>]*>/i, baseTag);
    }
    return html.replace(/<head([^>]*)>/i, `<head$1>\n            ${baseTag}`);
}

function validatePDFPayload(payload = {}) {
    const html = preparePDFHTML(String(payload.html || ''));
    const title = makeSafeFileName(payload.title || 'AK LAZER Belge');
    if (!html.trim()) throw new Error('PDF içeriği boş.');
    if (Buffer.byteLength(html, 'utf8') > MAX_PDF_HTML_BYTES) {
        throw new Error('PDF içeriği 20 MB sınırını aşıyor.');
    }
    return { html, title };
}

async function renderPDFBuffer(html) {
    let pdfWindow;
    let tempHTMLPath = '';
    try {
        pdfWindow = new BrowserWindow({
            show: false,
            width: 1240,
            height: 1754,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true
            }
        });

        tempHTMLPath = path.join(app.getPath('temp'), `ak-lazer-pdf-${Date.now()}-${Math.floor(Math.random() * 10000)}.html`);
        writeTextFileAtomic(tempHTMLPath, html);
        await pdfWindow.loadFile(tempHTMLPath);
        return await pdfWindow.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            pageSize: 'A4',
            margins: { marginType: 'none' }
        });
    } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.close();
        if (tempHTMLPath) fs.rm(tempHTMLPath, { force: true }, () => {});
    }
}

function normalizeWhatsAppPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = `90${digits.slice(1)}`;
    else if (digits.length === 10) digits = `90${digits}`;
    return /^\d{8,15}$/.test(digits) ? digits : '';
}

function getWhatsAppShareURL(phone, message) {
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const url = new URL(normalizedPhone ? `https://wa.me/${normalizedPhone}` : 'https://wa.me/');
    if (message) url.searchParams.set('text', String(message).slice(0, 1000));
    return { url: url.toString(), normalizedPhone };
}

function getWhatsAppPDFPath(title) {
    const shareDirectory = path.join(app.getPath('documents'), 'AkLazerBelgeler', 'WhatsApp');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(shareDirectory, `${title}-${timestamp}.pdf`);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 768,
        title: "AK LAZER ERP",
        icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('index.html');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, navigationURL) => {
        if (!isTrustedAppURL(navigationURL)) event.preventDefault();
    });
    win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    // win.webContents.openDevTools(); // Açık tutulabilir istenirse
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    ipcMain.handle('app-surumu', async event => {
        try {
            assertTrustedSender(event);
            return { success: true, version: app.getVersion() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('guncelleme-kontrol', async event => {
        const currentVersion = app.getVersion();
        try {
            assertTrustedSender(event);
            const manifest = await fetchUpdateManifest();
            const latestVersion = String(manifest.version).trim().replace(/^v/i, '');
            return {
                success: true,
                currentVersion,
                latestVersion,
                hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
                releaseDate: String(manifest.releaseDate || ''),
                notes: String(manifest.notes || '').slice(0, 500),
                downloadUrl: getUpdateDownloadURL(manifest),
                checkedAt: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                currentVersion,
                offline: error?.name === 'AbortError' || /network|fetch|ENOTFOUND|sunucusu/i.test(error?.message || ''),
                error: error?.name === 'AbortError' ? 'Sürüm kontrolü zaman aşımına uğradı.' : (error?.message || 'Sürüm kontrolü yapılamadı.'),
                checkedAt: new Date().toISOString()
            };
        }
    });

    ipcMain.handle('guncelleme-sayfasi-ac', async (event, updateURL) => {
        try {
            assertTrustedSender(event);
            if (!isAllowedUpdateURL(updateURL)) throw new Error('Güncelleme adresine izin verilmiyor.');
            await shell.openExternal(updateURL);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Otomatik Yedekleme Handler
    ipcMain.handle('veri-degisti', async (event, data) => {
        try {
            assertTrustedSender(event);
            const filePath = writeRotatingBackup(validateDatabasePayload(data));
            return { success: true, path: filePath };
        } catch (error) {
            console.error("Otomatik yedekleme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('db-dosyadan-yukle', async event => {
        try {
            assertTrustedSender(event);
            const filePath = getDBFilePath();
            if (!fs.existsSync(filePath)) {
                return { success: false, missing: true };
            }
            return { success: true, data: validateDatabasePayload(fs.readFileSync(filePath, 'utf-8')) };
        } catch (error) {
            console.error("Veri dosyası okuma hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('db-dosyaya-kaydet', async (event, data) => {
        try {
            assertTrustedSender(event);
            writeTextFileAtomic(getDBFilePath(), validateDatabasePayload(data));
            return { success: true, path: getDBFilePath() };
        } catch (error) {
            console.error("Veri dosyası yazma hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('belge-arsivle', async (event, payload = {}) => {
        try {
            assertTrustedSender(event);
            const sourcePath = resolveSafeAttachmentPath(payload.sourcePath);
            const archivePath = makeArchivePath({ ...payload, sourcePath });
            fs.mkdirSync(path.dirname(archivePath), { recursive: true });
            fs.copyFileSync(sourcePath, archivePath);
            return { success: true, path: archivePath };
        } catch (error) {
            console.error("Belge arşivleme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('belge-ac', async (event, filePath) => {
        try {
            assertTrustedSender(event);
            const targetPath = resolveSafeAttachmentPath(filePath);
            const error = await shell.openPath(targetPath);
            return error ? { success: false, error } : { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Manuel Yedek Handler
    ipcMain.handle('manuel-yedek', async (event, data) => {
        try {
            assertTrustedSender(event);
            const validatedData = validateDatabasePayload(data);
            const { filePath } = await dialog.showSaveDialog({
                title: 'Yedek Dosyasını Kaydet',
                defaultPath: `prolazer-yedek-${new Date().toISOString().split('T')[0]}.json`,
                filters: [{ name: 'JSON Dosyası', extensions: ['json'] }]
            });

            if (filePath) {
                writeTextFileAtomic(filePath, validatedData);
                return { success: true, path: filePath };
            }
            return { success: false, canceled: true };
        } catch (error) {
            console.error("Manuel yedekleme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    // Yedek Geri Yükle Handler
    ipcMain.handle('yedek-geri-yukle', async event => {
        try {
            assertTrustedSender(event);
            const { filePaths } = await dialog.showOpenDialog({
                title: 'Yedek Dosyası Seç',
                filters: [{ name: 'JSON Dosyası', extensions: ['json'] }],
                properties: ['openFile']
            });

            if (filePaths && filePaths.length > 0) {
                const stats = fs.statSync(filePaths[0]);
                if (!stats.isFile() || stats.size > MAX_DATABASE_BYTES) {
                    return { success: false, error: 'Yedek dosyası geçersiz veya 50 MB sınırını aşıyor.' };
                }
                const data = validateDatabasePayload(fs.readFileSync(filePaths[0], 'utf-8'));
                return { success: true, data: data };
            }
            return { success: false, canceled: true };
        } catch (error) {
            console.error("Geri yükleme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('pdf-kaydet', async (event, payload = {}) => {
        try {
            assertTrustedSender(event);
            const { html, title } = validatePDFPayload(payload);

            const { filePath, canceled } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
                title: 'PDF Olarak Kaydet',
                defaultPath: `${title}-${new Date().toISOString().slice(0, 10)}.pdf`,
                filters: [{ name: 'PDF Dosyası', extensions: ['pdf'] }]
            });

            if (canceled || !filePath) {
                return { success: false, canceled: true };
            }

            const pdfData = await renderPDFBuffer(html);
            writeTextFileAtomic(filePath, pdfData);
            return { success: true, path: filePath };
        } catch (error) {
            console.error("PDF kaydetme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('pdf-whatsapp-paylas', async (event, payload = {}) => {
        try {
            assertTrustedSender(event);
            const { html, title } = validatePDFPayload(payload);
            const message = String(payload.message || `${title} belgesini iletiyorum.`).trim().slice(0, 1000);
            const pdfData = await renderPDFBuffer(html);
            const filePath = getWhatsAppPDFPath(title);
            writeTextFileAtomic(filePath, pdfData);

            const share = getWhatsAppShareURL(payload.phone, message);
            shell.showItemInFolder(filePath);
            await shell.openExternal(share.url);
            return {
                success: true,
                path: filePath,
                phoneMatched: Boolean(share.normalizedPhone)
            };
        } catch (error) {
            console.error('WhatsApp paylaşım hazırlama hatası:', error);
            return { success: false, error: error.message };
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
