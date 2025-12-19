const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (data, defaultPath) => ipcRenderer.invoke('save-file', { data, defaultPath }),
  openFile: () => ipcRenderer.invoke('open-file'),
  openGeotiff: () => ipcRenderer.invoke('open-geotiff'),
  openVector: () => ipcRenderer.invoke('open-vector'),
  quickSave: (data, filePath) => ipcRenderer.invoke('quick-save', { data, filePath }),
  exportFile: (data, format, defaultPath) => ipcRenderer.invoke('export-file', { data, format, defaultPath }),
  
  // Listen for events from main process
  onTriggerSave: (callback) => {
    ipcRenderer.on('trigger-save', callback)
    return () => ipcRenderer.removeListener('trigger-save', callback)
  },
  
  // Send unsaved changes state to main process
  setUnsavedChanges: (hasUnsaved) => {
    ipcRenderer.send('set-unsaved-changes', hasUnsaved)
  },
  
  // Platform info
  platform: process.platform,
  
  // Window controls (optional, for custom titlebar)
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window')
})

// Expose app info
contextBridge.exposeInMainWorld('appInfo', {
  name: 'OffLIMMMA',
  version: '1.0.0'
})

