const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendBackup: (data) => ipcRenderer.send('veri-degisti', data),
    manualBackup: (data) => ipcRenderer.invoke('manuel-yedek', data),
    restoreBackup: () => ipcRenderer.invoke('yedek-geri-yukle')
});
