const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lazer-backup-ipc-'));
(async()=>{
 const handlers=new Map();let dialogResult={canceled:true},dialogError=null;
 class Window {constructor(){this.webContents={setWindowOpenHandler(){},on(){},session:{setPermissionRequestHandler(){}}};}loadFile(){}on(){}}
 const electron={app:{requestSingleInstanceLock:()=>true,getPath:name=>path.join(root,name),whenReady:()=>({then:fn=>fn()}),on(){},getVersion:()=> 'test'},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showSaveDialog:async()=>{if(dialogError)throw new Error(dialogError);return dialogResult;}},shell:{},net:{}};
 const project=path.resolve(__dirname,'..');
 class FixedDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-24T12:00:00.000Z']));} }
 vm.runInNewContext(fs.readFileSync(path.join(project,'main.js'),'utf8'),{require:name=>name==='electron'?electron:name==='./backup-status'?require('../backup-status'):require(name),__dirname:project,process,Buffer,URL,Date:FixedDate,AbortController,setTimeout,clearTimeout,console:{error(){},log(){}}});
 const trusted={sender:{getURL:()=>pathToFileURL(path.join(project,'index.html')).href}};
 const untrusted={sender:{getURL:()=> 'https://example.invalid/'}};
 assert.equal((await handlers.get('yedek-durumu')(untrusted)).success,false);
 assert.equal((await handlers.get('veri-degisti')(untrusted,'{}')).success,false);assert(!fs.existsSync(path.join(root,'userData')));
 const result=await handlers.get('veri-degisti')(trusted,'{"cariler":[]}');assert(result.success);assert(fs.existsSync(result.path));assert.equal(result.backupStatus.available,true);
 const next=await handlers.get('veri-degisti')(trusted,'{"cariler":[],"revision":2}');assert(next.success);assert.notEqual(next.path,result.path,'Saves at the same instant must have distinct backups');assert.equal(fs.readFileSync(result.path,'utf8'),'{"cariler":[]}');
 const safety=await handlers.get('veri-degisti')(trusted,'{"cariler":[],"beforeReset":true}',{safety:true});assert(safety.success);assert.equal(safety.backupStatus.kind,'safety');
 for(let i=0;i<65;i++)assert((await handlers.get('veri-degisti')(trusted,JSON.stringify({cariler:[],revision:i}))).success);
 assert.equal(fs.readFileSync(safety.path,'utf8'),'{"cariler":[],"beforeReset":true}','Routine saves must preserve the pre-restore/reset safety snapshot');
 const files=fs.readdirSync(path.join(root,'documents','AkLazerYedek','2026','09'));assert.equal(files.filter(f=>f.endsWith('.json')).length,60,'Routine backup retention remains bounded');
 let status=await handlers.get('yedek-durumu')(trusted);assert(status.lastSuccessAt);assert(status.available);
 const before=fs.readFileSync(path.join(root,'userData','backup-status.json'),'utf8');
 assert((await handlers.get('manuel-yedek')(trusted,'{}')).canceled);assert.equal(fs.readFileSync(path.join(root,'userData','backup-status.json'),'utf8'),before);
 dialogError='Yazma izni yok';assert.equal((await handlers.get('manuel-yedek')(trusted,'{}')).success,false);status=await handlers.get('yedek-durumu')(trusted);assert.equal(status.error,'Yazma izni yok');assert(status.lastSuccessAt);
 dialogError=null;dialogResult={filePath:path.join(root,'manual.json')};const manual=await handlers.get('manuel-yedek')(trusted,'{"cariler":[]}');assert(manual.success);assert.equal(manual.backupStatus.kind,'manual');assert.equal(manual.backupStatus.error,'');
 fs.writeFileSync(manual.path,'corrupted');assert.equal((await handlers.get('yedek-durumu')(trusted)).success,false);
 console.log('Backup IPC: same-instant saves, protected safety snapshots, bounded retention, trusted sender, safe file writes, manual recovery and corrupt backup checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
