const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageData = require(path.join(projectRoot, 'package.json'));
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf8');

assert.match(
    html,
    new RegExp(`id="app-version">v${packageData.version.replaceAll('.', '\\.')}`),
    'Arayüzdeki yedek sürüm değeri package.json ile aynı olmalı.'
);
assert.match(main, /ipcMain\.handle\('app-surumu'/, 'Ana süreç sürüm bilgisini sunmalı.');
assert.match(preload, /getAppVersion:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app-surumu'\)/, 'Sürüm API\'si güvenli köprüden sunulmalı.');

console.log(`Sürüm eşleşme testi geçti: v${packageData.version}`);
