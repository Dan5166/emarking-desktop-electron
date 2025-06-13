const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  deleteFile: (filePath) => ipcRenderer.invoke("file:delete", filePath),
  listPdfs: async () => ipcRenderer.invoke("list-pdfs"),
  scanPdf: (filePath) => ipcRenderer.invoke("scan-pdf", filePath),
  listImagesToScan: (filePath) => ipcRenderer.invoke("scan-pdfs", filePath),
});
