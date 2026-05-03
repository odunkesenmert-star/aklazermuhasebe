const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 768,
        title: "AK LAZER ERP",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('index.html');
    // win.webContents.openDevTools(); // Açık tutulabilir istenirse
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Otomatik Yedekleme Handler
    ipcMain.on('veri-degisti', (event, data) => {
        try {
            const date = new Date();
            const year = date.getFullYear().toString();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            const docsPath = app.getPath('documents');
            const backupDir = path.join(docsPath, 'AkLazerYedek', year);
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const fileName = `yedek-${year}-${month}-${day}.json`;
            const filePath = path.join(backupDir, fileName);

            fs.writeFileSync(filePath, data, 'utf-8');
        } catch (error) {
            console.error("Otomatik yedekleme hatası:", error);
        }
    });

    // Manuel Yedek Handler
    ipcMain.handle('manuel-yedek', async (event, data) => {
        try {
            const { filePath } = await dialog.showSaveDialog({
                title: 'Yedek Dosyasını Kaydet',
                defaultPath: `prolazer-yedek-${new Date().toISOString().split('T')[0]}.json`,
                filters: [{ name: 'JSON Dosyası', extensions: ['json'] }]
            });

            if (filePath) {
                fs.writeFileSync(filePath, data, 'utf-8');
                return { success: true, path: filePath };
            }
            return { success: false, canceled: true };
        } catch (error) {
            console.error("Manuel yedekleme hatası:", error);
            return { success: false, error: error.message };
        }
    });

    // Yedek Geri Yükle Handler
    ipcMain.handle('yedek-geri-yukle', async () => {
        try {
            const { filePaths } = await dialog.showOpenDialog({
                title: 'Yedek Dosyası Seç',
                filters: [{ name: 'JSON Dosyası', extensions: ['json'] }],
                properties: ['openFile']
            });

            if (filePaths && filePaths.length > 0) {
                const data = fs.readFileSync(filePaths[0], 'utf-8');
                return { success: true, data: data };
            }
            return { success: false, canceled: true };
        } catch (error) {
            console.error("Geri yükleme hatası:", error);
            return { success: false, error: error.message };
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
