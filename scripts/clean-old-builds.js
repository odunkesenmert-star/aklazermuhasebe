const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const packageData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const currentVersion = packageData.version;
const shouldApply = process.argv.includes('--apply');
const generatedArtifactPattern = /^AK LAZER ERP-(\d+\.\d+\.\d+)-arm64-mac\.zip(?:\.blockmap)?$/;

if (!fs.existsSync(distDir)) {
    console.log('dist klasörü bulunamadı; temizlenecek eski paket yok.');
    process.exit(0);
}

const oldArtifacts = fs.readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
        const match = entry.name.match(generatedArtifactPattern);
        return match ? { name: entry.name, version: match[1] } : null;
    })
    .filter(entry => entry && entry.version !== currentVersion)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

if (!oldArtifacts.length) {
    console.log(`Eski sürüm paketi yok; ${currentVersion} korunuyor.`);
    process.exit(0);
}

oldArtifacts.forEach(artifact => {
    const target = path.join(distDir, artifact.name);
    if (path.dirname(target) !== distDir) throw new Error(`Güvensiz temizleme hedefi: ${target}`);
    if (shouldApply) fs.unlinkSync(target);
    console.log(`${shouldApply ? 'Silindi' : 'Silinecek'}: ${artifact.name}`);
});

console.log(`${oldArtifacts.length} eski oluşturma dosyası ${shouldApply ? 'silindi' : 'bulundu'}. Güncel sürüm: ${currentVersion}.`);
