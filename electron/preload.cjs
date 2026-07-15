const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  getPathForFile: file => webUtils.getPathForFile(file),
  probeFile: inputPath => ipcRenderer.invoke('probe-file', inputPath),
  convertVideo: payload => ipcRenderer.invoke('convert-video', payload),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  saveOutput: payload => ipcRenderer.invoke('save-output', payload),
  cancelConversion: jobId => ipcRenderer.invoke('cancel-conversion', jobId),
  revealFile: outputPath => ipcRenderer.invoke('reveal-file', outputPath),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('conversion-progress', listener)
    return () => ipcRenderer.removeListener('conversion-progress', listener)
  },
  onUpdateStatus: callback => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  },
})
