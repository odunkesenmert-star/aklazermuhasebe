const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

const requiredProjectFiles = packageData.build.files.filter(entry => !entry.startsWith('node_modules/'));
requiredProjectFiles.forEach(relativePath => {
    const absolutePath = path.join(projectRoot, relativePath);
    assert.ok(fs.existsSync(absolutePath), `Paketleme için gerekli dosya eksik: ${relativePath}`);
    assert.ok(fs.statSync(absolutePath).isFile(), `Paketleme girdisi dosya olmalı: ${relativePath}`);
});

assert.strictEqual(packageData.build.asar, true, 'Uygulama kaynakları ASAR paketi içinde dağıtılmalı.');
assert.strictEqual(packageData.build.mac.identity, undefined, 'macOS yapılandırması ad-hoc imzayı zorlamamalı.');
assert.strictEqual(packageData.build.mac.hardenedRuntime, true, 'macOS hardened runtime açık olmalı.');
assert.strictEqual(packageData.build.mac.gatekeeperAssess, true, 'macOS Gatekeeper değerlendirmesi açık olmalı.');
assert.strictEqual(packageData.build.mac.notarize, true, 'macOS noter entegrasyonu açık olmalı.');
assert.ok(fs.existsSync(path.join(projectRoot, 'scripts/verify-mac-release.js')), 'Dağıtım ön koşulu denetleyicisi bulunmalı.');
assert.ok(fs.existsSync(path.join(projectRoot, 'scripts/clean-old-builds.js')), 'Eski paketleri güvenli temizleme aracı bulunmalı.');
assert.ok(packageData.scripts['build:mac'].includes('identity=-'), 'Yerel macOS paketi geçersiz geliştirme sertifikasına bağlı olmamalı.');
assert.ok(packageData.scripts['build:mac:release'].startsWith('node scripts/verify-mac-release.js'), 'Resmî macOS paketi imzalama ön koşulundan geçmeli.');

console.log(`Paket bütünlüğü testi geçti: ${requiredProjectFiles.length} proje girdisi doğrulandı.`);
