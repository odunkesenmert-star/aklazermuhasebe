const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBackupMonitor}=require('../backup-status');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lazer-backup-status-test-'));
try {
 const statusPath=path.join(root,'status.json'),file=path.join(root,'backup.json');
 const create=()=>createBackupMonitor({statusPath,listBackups:()=>fs.existsSync(file)?[file]:[],now:()=>new Date('2026-09-16T10:00:00Z')});
 let monitor=create();assert.equal(monitor.read().available,false);
 fs.writeFileSync(file,'{"cariler":[]}');assert.equal(monitor.read().available,true,'Discover backups made before status tracking');
 monitor.record({success:true,path:file});assert.equal(create().read().lastSuccessAt,'2026-09-16T10:00:00.000Z');
 monitor.record({success:false,error:'Disk dolu'});let state=create().read();assert.equal(state.error,'Disk dolu');assert.equal(state.available,true);assert.equal(state.lastSuccessAt,'2026-09-16T10:00:00.000Z');
 monitor.record({success:true,path:file},'manual');assert.equal(create().read().kind,'manual');assert.equal(create().read().error,'');
 fs.writeFileSync(file,'broken');assert.equal(create().read().success,false,'Corrupt backup must not be called healthy');
 fs.unlinkSync(file);assert.equal(create().read().available,false,'Missing backup must not be called healthy');
 fs.writeFileSync(statusPath,'invalid JSON');assert.equal(create().read().available,false);
 console.log('Backup status: first run, old-file discovery, restart, failure persistence, recovery, manual backups and missing files passed.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
