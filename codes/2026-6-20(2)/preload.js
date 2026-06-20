const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('physics', {
    getFallingObjects: () => ipcRenderer.invoke('get-falling-objects'),
    getTargetObjects:  () => ipcRenderer.invoke('get-target-objects'),
    simulate:          (input) => ipcRenderer.invoke('simulate', input),
});
