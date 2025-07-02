// main.js
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Worker } from "worker_threads"; // Importar Worker
import { Jimp } from "jimp";
import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDirectory = path.join(process.cwd(), "frontend", "public");

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  win.setMenuBarVisibility(true);
  win.loadURL("http://localhost:5174");
}

ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const destFolder = path.join(__dirname, "saved_pdfs");

    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder);
    }

    const destPath = path.join(destFolder, fileName);
    fs.copyFileSync(filePath, destPath);

    return destPath;
  }
  return null;
});

ipcMain.handle("file:delete", async (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar archivo:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("list-pdfs", async () => {
  const dirPath = path.join(__dirname, "saved_pdfs");
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);
  const pdfs = files
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .map((file) => ({
      name: file,
      path: path.join(dirPath, file),
      status: "ok",
    }));
  return pdfs;
});

ipcMain.handle("scan-pdf", (event, pdfName, doubleFace) => {
  console.log("Se manda al escaneo: ", pdfName);
  return new Promise((resolve, reject) => {
    // Ruta al directorio donde se guardan los PDFs
    // Usa app.getAppPath() o app.getPath('userData') para rutas más robustas en Electron.
    const savedPdfsPath = path.join(__dirname, "saved_pdfs"); // O app.getAppPath() para producción
    // Ruta al worker script
    const workerPath = path.join(__dirname, "scannerWorker.js");

    // Crear un nuevo worker thread
    const worker = new Worker(workerPath); // No pasar workerData aquí si el worker espera un postMessage

    console.log("Creado nuevo Worker para escaneo de:", pdfName);

    worker.on("message", (message) => {
      // El worker envió un mensaje (éxito o error)
      console.log("MENSAJE DEL WORKER (scan-pdf): ", message);
      if (message.status === "success") {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }
      // CRUCIAL: Terminar el worker después de recibir un mensaje (éxito o error)
      worker.terminate();
    });

    worker.on("error", (err) => {
      // Ocurrió un error no manejado en el worker
      console.error(`Worker error para escaneo de ${pdfName}:`, err);
      reject(
        new Error(
          `Error en el proceso de escaneo para ${pdfName}: ${err.message}`
        )
      );
      // CRUCIAL: Terminar el worker en caso de error
      worker.terminate();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(
          `Worker para escaneo de ${pdfName} terminó con código de salida ${code}`
        );
        // Considerar si necesitas rechazar la promesa aquí si el worker termina
        // con un código de error *antes* de enviar un mensaje de error.
        // Si el `worker.on('error')` ya lo maneja, esto es un fallback.
      }
      console.log(
        `Worker para escaneo de ${pdfName} salió con código: ${code}`
      );
    });

    // IMPORTANTE: Esta línea es NECESARIA porque tu worker está escuchando 'parentPort.on("message")'
    worker.postMessage({ pdfName, doubleFace, savedPdfsPath });
  });
});

ipcMain.handle("zip-folder", (event, pdfName, pdfId) => {
  console.log("Se manda a zipear: ", pdfName);
  return new Promise((resolve, reject) => {
    const fileToZip = path.join(process.cwd(), "frontend", "public", pdfName);

    const outputDirectory = path.join(
      process.cwd(),
      "frontend",
      "public",
      "zipped_pdfs",
      pdfName
    );

    const outputZipDir = path.join(app.getAppPath(), "zipped_pdfs");
    const outputZipPath = path.join(outputZipDir, `${pdfName}.zip`);

    fs.mkdirSync(outputZipDir, { recursive: true });

    const workerPath = path.join(__dirname, "zipWorker.js");
    const worker = new Worker(workerPath);

    console.log("Worker de zip creado para:", pdfName);

    worker.on("message", (message) => {
      console.log("MENSAJE DEL WORKER (zip-folder): ", message);
      if (message.status === "success") {
        resolve(message.outputPath); // Aquí usas `message.outputPath`, no `message.result`
      } else {
        reject(new Error(message.error));
      }
      worker.terminate();
    });

    worker.on("error", (err) => {
      console.error(`Worker error para zipping de ${pdfName}:`, err);
      reject(
        new Error(
          `Error en el proceso de zipping para ${pdfName}: ${err.message}`
        )
      );
      worker.terminate();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(
          `Worker para zipping de ${pdfName} terminó con código de salida ${code}`
        );
      }
      console.log(
        `Worker para zipping de ${pdfName} salió con código: ${code}`
      );
    });

    // CORREGIDO
    worker.postMessage({
      folderToZip: fileToZip,
      outputZipPath,
      pdfId,
    });
  });
});

function percentToJimpValue(percent) {
  return (percent - 100) / 100;
}

async function readQrCode(filePath) {
  const image = await Jimp.read(filePath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const luminances = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      luminances[y * width + x] = (r + g + b) / 3;
    }
  }

  const source = new RGBLuminanceSource(luminances, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

  const reader = new MultiFormatReader();
  reader.setHints(hints);

  const result = reader.decode(bitmap);
  return result.getText();
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, "_");
}

async function renameImg(oldPath, newName) {
  const dir = path.dirname(oldPath);
  const newFileName = sanitizeFileName(newName);
  const newPath = path.join(dir, newFileName + ".png");

  await fs.promises.rename(oldPath, newPath);
  return newPath; // Devolver la nueva ruta para que el frontend la tenga
}

ipcMain.handle(
  "adjust-image",
  async (event, { imagePath, brightness, contrast }) => {
    const inputPath = path.join(outputDirectory, imagePath);
    try {
      const image = await Jimp.read(inputPath);

      const brightnessValue = percentToJimpValue(brightness);
      const contrastValue = percentToJimpValue(contrast);

      image.brightness(brightnessValue); // -1 a 1
      image.contrast(contrastValue); // -1 a 1

      // const outputPath = inputPath.replace(/\.png$/, "_adjusted.png");
      // await image.write(outputPath);

      const width = image.bitmap.width;
      const height = image.bitmap.height;
      const luminances = new Uint8ClampedArray(width * height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = image.bitmap.data[idx];
          const g = image.bitmap.data[idx + 1];
          const b = image.bitmap.data[idx + 2];
          luminances[y * width + x] = (r + g + b) / 3;
        }
      }

      const source = new RGBLuminanceSource(luminances, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

      const reader = new MultiFormatReader();
      reader.setHints(hints);

      const result = reader.decode(bitmap);
      if (result) {
        console.log("🗂️ RESULTADO: ");
        console.log(result.getText());
        console.log(
          `Cambiando nombre desde:  ${inputPath} a ${result.getText()}`
        );
        renameImg(inputPath, result.getText());
      } else {
        console.log("No resultado");
      }

      console.log("Llega al final");

      return {
        success: true,
        path: outputPath,
        qrText: result.getText(),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);

ipcMain.handle("console-log-handler", async (event, object) => {
  console.log(object.message);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
