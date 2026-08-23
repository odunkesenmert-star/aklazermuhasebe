const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageData = require(path.join(projectRoot, 'package.json'));
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf8');
const releaseManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'web', 'erp-version.json'), 'utf8'));

assert.match(
    html,
    new RegExp(`id="app-version">v${packageData.version.replaceAll('.', '\\.')}`),
    'Arayüzdeki yedek sürüm değeri package.json ile aynı olmalı.'
);
assert.match(main, /ipcMain\.handle\('app-surumu'/, 'Ana süreç sürüm bilgisini sunmalı.');
assert.match(preload, /getAppVersion:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app-surumu'\)/, 'Sürüm API\'si güvenli köprüden sunulmalı.');
assert.strictEqual(releaseManifest.version, packageData.version, 'Yayımlanan sürüm bilgisi package.json ile aynı olmalı.');
assert.match(main, /ipcMain\.handle\('guncelleme-kontrol'/, 'Ana süreç güvenli sürüm kontrolünü sunmalı.');
assert.match(main, /ALLOWED_UPDATE_HOSTS/, 'Güncelleme adresleri güvenilir alan adıyla sınırlandırılmalı.');
assert.match(preload, /checkForUpdates:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('guncelleme-kontrol'\)/, 'Güncelleme kontrolü güvenli köprüden sunulmalı.');
assert.match(preload, /openUpdatePage:\s*\(updateURL\)\s*=>\s*ipcRenderer\.invoke\('guncelleme-sayfasi-ac'/, 'Güncelleme sayfası yalnızca ana süreç üzerinden açılmalı.');
assert.match(main, /ipcMain\.handle\('pdf-whatsapp-paylas'/, 'WhatsApp PDF paylaşımı ana süreçte bulunmalı.');
assert.match(main, /assertTrustedSender\(event\);[\s\S]*getWhatsAppShareURL/, 'WhatsApp paylaşımı güvenilir gönderici kontrolünden geçmeli.');
assert.match(main, /https:\/\/wa\.me\//, 'WhatsApp sohbeti resmî wa.me bağlantısıyla açılmalı.');
assert.match(preload, /sharePDFWhatsApp:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('pdf-whatsapp-paylas'/, 'WhatsApp paylaşımı güvenli köprüden sunulmalı.');

console.log(`Sürüm eşleşme testi geçti: v${packageData.version}`);
