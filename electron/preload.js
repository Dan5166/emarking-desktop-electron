const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  deleteFile: (filePath) => ipcRenderer.invoke("file:delete", filePath),
  listPdfs: async () => ipcRenderer.invoke("list-pdfs"),
  scanPdf: (selectedPdfPath, doubleFace) =>
    ipcRenderer.invoke("scan-pdf", selectedPdfPath, doubleFace),
  listImagesToScan: (filePath) => ipcRenderer.invoke("scan-pdfs", filePath),
});
