const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let physics;
try {
    physics = require('./build/Release/physics.node');
} catch {
    physics = require(path.join(process.resourcesPath, 'physics.node'));
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Physics Simulator',
        backgroundColor: '#0d1117',
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-falling-objects', () => physics.getFallingObjects());
ipcMain.handle('get-target-objects',  () => physics.getTargetObjects());

ipcMain.handle('simulate', (_event, input) => {
    try {
        return { ok: true, data: physics.simulate(input) };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});
