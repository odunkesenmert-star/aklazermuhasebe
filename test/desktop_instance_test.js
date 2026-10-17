const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const project = path.resolve(__dirname, '..');

function launch(hasLock) {
    const events = new Map(), handlers = new Map(), windows = [];
    let quitCount = 0;
    class Window {
        constructor() {
            this.events = new Map(); this.minimized = false; this.focusCount = 0; this.destroyed = false;
            this.webContents = {setWindowOpenHandler(){}, on(){}, session:{setPermissionRequestHandler(){}}};
            windows.push(this);
        }
        on(name, callback) { this.events.set(name, callback); }
        loadFile() {}
        isDestroyed() { return this.destroyed; }
        isMinimized() { return this.minimized; }
        restore() { this.minimized = false; }
        show() {}
        focus() { this.focusCount++; }
    }
    const electron = {
        app: {requestSingleInstanceLock:()=>hasLock, quit:()=>quitCount++, isReady:()=>true,
            whenReady:()=>({then:fn=>fn()}), on:(name, callback)=>events.set(name, callback)},
        BrowserWindow:Window, ipcMain:{handle:(name, callback)=>handlers.set(name, callback)}, dialog:{}, shell:{}, net:{}
    };
    vm.runInNewContext(fs.readFileSync(path.join(project,'main.js'),'utf8'), {
        require:name=>name==='electron'?electron:name==='./backup-status'?require('../backup-status'):require(name),
        __dirname:project, process, Buffer, URL, AbortController, setTimeout, clearTimeout, console
    });
    return {events, handlers, windows, quitCount};
}

const secondary = launch(false);
assert.equal(secondary.quitCount, 1);
assert.equal(secondary.windows.length, 0, 'A second process must not create a database-editing window');
assert.equal(secondary.handlers.size, 0, 'A second process must not register database writers');
const primary = launch(true);
assert.equal(primary.windows.length, 1);
primary.windows[0].minimized = true;
primary.events.get('second-instance')();
assert.equal(primary.windows.length, 1);
assert.equal(primary.windows[0].minimized, false);
assert.equal(primary.windows[0].focusCount, 1);
primary.events.get('activate')();
assert.equal(primary.windows.length, 1);
primary.windows[0].destroyed = true;
primary.windows[0].events.get('closed')();
primary.events.get('activate')();
assert.equal(primary.windows.length, 2, 'Closing and reopening the main window remains supported');
console.log('Desktop instance: secondary launch cannot write; primary window is focused/restored and can reopen.');
