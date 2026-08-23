const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendBackup: (data) => ipcRenderer.invoke('veri-degisti', data),
    manualBackup: (data) => ipcRenderer.invoke('manuel-yedek', data),
    restoreBackup: () => ipcRenderer.invoke('yedek-geri-yukle'),
    loadDBFromFile: () => ipcRenderer.invoke('db-dosyadan-yukle'),
    saveDBToFile: (data) => ipcRenderer.invoke('db-dosyaya-kaydet', data),
    savePDF: (payload) => ipcRenderer.invoke('pdf-kaydet', payload),
    sharePDFWhatsApp: (payload) => ipcRenderer.invoke('pdf-whatsapp-paylas', payload),
    archiveAttachment: (payload) => ipcRenderer.invoke('belge-arsivle', payload),
    openAttachment: (filePath) => ipcRenderer.invoke('belge-ac', filePath),
    getAppVersion: () => ipcRenderer.invoke('app-surumu'),
    checkForUpdates: () => ipcRenderer.invoke('guncelleme-kontrol'),
    openUpdatePage: (updateURL) => ipcRenderer.invoke('guncelleme-sayfasi-ac', updateURL),
    getPathForFile: (file) => webUtils.getPathForFile(file)
});
