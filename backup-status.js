const fs = require('node:fs');
const path = require('node:path');

// Metadata stays separate from the accounting database and survives restarts.
function createBackupMonitor({ statusPath, listBackups, now = () => new Date(), validate = JSON.parse }) {
    function read() {
        let status = {};
        try {
            if (fs.existsSync(statusPath)) status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        } catch (_) { status = {}; }
        if (!status.lastSuccessAt) {
            const latest = listBackups().map(file => ({ file, time: fs.statSync(file).mtimeMs })).sort((a,b) => b.time - a.time)[0];
            if (latest) status = { ...status, lastSuccessAt: new Date(latest.time).toISOString(), path: latest.file, kind: path.basename(latest.file).startsWith('yedek-guvenlik-') ? 'safety' : 'auto' };
        }
        const available = !!status.path && fs.existsSync(status.path) && fs.statSync(status.path).isFile();
        if (available) {
            try { validate(fs.readFileSync(status.path, 'utf8')); }
            catch (_) { return { ...status, success: false, available: false, error: 'Son yedek dosyası okunamıyor veya geçerli değil. Yeni bir yedek oluşturun.' }; }
        }
        return { ...status, success: true, available };
    }
    function record(result, kind = 'auto') {
        let previous = {};
        try { previous = read(); } catch (_) {}
        const timestamp = now().toISOString();
        const status = result.success
            ? { lastSuccessAt: timestamp, lastAttemptAt: timestamp, path: result.path, kind, error: '' }
            : { ...previous, lastAttemptAt: timestamp, error: result.error || 'Yedekleme tamamlanamadı.' };
        try {
            fs.mkdirSync(path.dirname(statusPath), { recursive: true });
            fs.writeFileSync(`${statusPath}.tmp`, JSON.stringify(status), 'utf8');
            fs.renameSync(`${statusPath}.tmp`, statusPath);
        } catch (_) {
            // A status-file failure must not claim the actual backup failed.
            return { ...status, success: true, available: !!result.success || !!previous.available };
        }
        return { ...status, success: true, available: !!result.success || !!previous.available };
    }
    return { read, record };
}
module.exports = { createBackupMonitor };
