import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { convert } from "pdf-poppler";

// *****************************************
// Desde NodeJS ****************************
// *****************************************
import { dirname } from "path";
import pdf from "pdf-poppler";
import { Jimp } from "jimp";
import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library"; // Para leer los códigos QR
// *****************************************
// *****************************************
// *****************************************

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
      webviewTag: true, // ¡esto es necesario!
    },
  });

  // win.setMenuBarVisibility(false);
  // win.removeMenu();
  win.setMenuBarVisibility(true);
  win.loadURL("http://localhost:5173");
}

// Manejar la apertura de un archivo y guardarlo en una carpeta local
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const destFolder = path.join(__dirname, "saved_pdfs"); // Carpeta local donde guardaremos los archivos

    // Asegurarnos de que la carpeta exista
    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder);
    }

    // Copiar el archivo a la carpeta local
    const destPath = path.join(destFolder, fileName);
    fs.copyFileSync(filePath, destPath);

    return destPath; // Devolver la ruta de destino
  }

  return null;
});

ipcMain.handle("file:delete", async (event, filePath) => {
  try {
    fs.unlinkSync(filePath); // o usar fs.promises.unlink(filePath)
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

const outputDirectory = path.join(__dirname, "qrcodes");

async function clearFolder(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);

      if (entry.isFile()) {
        fs.unlinkSync(fullPath);
        console.log(`🗑️ Archivo eliminado: ${entry.name}`);
      } else if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`🗑️ Carpeta eliminada: ${entry.name}`);
      }
    }

    console.log("✅ Carpeta limpiada completamente.");
  } catch (err) {
    console.error("❌ Error al limpiar la carpeta:", err);
  }
}

async function convertPdfToImages(pdfPath) {
  const pdfFileName = path.basename(pdfPath, path.extname(pdfPath)); // ejemplo: PDF_prueba
  const outputFolder = path.join(outputDirectory, pdfFileName);

  // Crear carpeta de salida si no existe
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
    console.log(`📂 Carpeta creada: ${outputFolder}`);
  }

  const options = {
    format: "png",
    out_dir: outputFolder,
    out_prefix: "page",
    page: null, // procesa todas las páginas
  };

  try {
    await pdf.convert(pdfPath, options);
    console.log(`✅ PDF convertido en imágenes en: ${outputFolder}`);
  } catch (error) {
    console.error("❌ Error convirtiendo PDF:", error);
  }
}

async function generateQrCode(outputFileName, stringToEncode) {
  const outputPath = path.join(outputDirectory, outputFileName);

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
    console.log(`Directory '${outputDirectory}' created.`);
  }

  try {
    await qrcode.toFile(outputPath, stringToEncode, {
      errorCorrectionLevel: "H",
      type: "image/png",
      quality: 0.92,
      margin: 4,
      width: 300,
      color: {
        dark: "#000000FF",
        light: "#FFFFFFFF",
      },
    });
    console.log(`✅ QR code generated at: ${outputPath}`);
  } catch (err) {
    console.error(`❌ Error generating QR:`, err);
  }
}

async function generateAllQrCodes() {
  const promises = [];

  for (let index = 0; index < 30; index++) {
    const stringToEncode = "QR_numero_" + index;
    const outputFileName = `${index}.png`;
    promises.push(generateQrCode(outputFileName, stringToEncode));
  }

  await Promise.all(promises);
}

async function readQrCode(filePath) {
  try {
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
  } catch (err) {
    throw new Error("QR code no detectado: " + err.message);
  }
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, "_");
}

async function renameImg(oldPath, newName) {
  const dir = path.dirname(oldPath);
  const sanitizedNewName = sanitizeFileName(newName);
  const newPath = path.join(dir, sanitizedNewName + ".png");

  try {
    await fs.promises.rename(oldPath, newPath);
    console.log(
      `🔄 Imagen renombrada: '${path.basename(oldPath)}' → '${path.basename(
        newPath
      )}'`
    );
  } catch (err) {
    console.error(`❌ Error renombrando '${oldPath}':`, err);
  }
}

async function readAllQRCodesInFolder(folderPath, doubleFace = false) {
  const foundQRCodes = [];
  const noQRCodes = [];

  try {
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => path.extname(file).toLowerCase() === ".png")
      .sort(); // Aseguramos orden alfabético (page-1, page-2...)

    let lastQrContent = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fullPath = path.join(folderPath, file);

      if (!doubleFace || i % 2 === 0) {
        // PÁGINA IMPAR o modo simple
        try {
          const qrContent = await readQrCode(fullPath);
          console.log(`📦 QR encontrado en '${file}':`, qrContent);

          await renameImg(fullPath, qrContent);
          lastQrContent = qrContent;

          foundQRCodes.push({
            originalFile: file,
            newFile: sanitizeFileName(qrContent) + ".png",
            qrContent: qrContent,
          });
        } catch (err) {
          console.log(`⚠️ No QR encontrado en '${file}', se continúa...`);
          noQRCodes.push(file);
        }
      } else {
        // PÁGINA PAR (solo en modo doble cara)
        if (lastQrContent) {
          const doubleFaceName = sanitizeFileName(lastQrContent) + "-b";
          await renameImg(fullPath, doubleFaceName);

          noQRCodes.push({
            originalFile: file,
            newFile: doubleFaceName + ".png",
            fromPreviousQR: lastQrContent,
          });

          console.log(
            `📄 Página doble cara renombrada a '${doubleFaceName}.png'`
          );
        } else {
          console.warn(`⚠️ No hay QR previo para renombrar '${file}'`);
          noQRCodes.push(file);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error leyendo la carpeta:", err);
  }

  return {
    foundQRCodes,
    noQRCodes,
  };
}

ipcMain.handle("scan-pdfs", async () => {
  console.time("⏱️ Tiempo total de ejecución");

  const name = "PDF_prueba.pdf";
  const folderPath = path.join(__dirname, "saved_pdfs");
  const pdfPath = path.join(folderPath, name);
  if (!fs.existsSync(folderPath)) {
    console.error(`❌ La carpeta '${folderPath}' no existe.`);
    return;
  }
  const nameWithoutExtension = path.basename(name, path.extname(name));

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ El archivo PDF '${name}' no existe.`);
    return;
  }
  const doubleFace = false; // Cambia a true si el PDF tiene doble cara

  await clearFolder(outputDirectory);
  await convertPdfToImages(pdfPath); // TODO: Cambiar 'name' por el path

  const result = await readAllQRCodesInFolder(
    path.join(outputDirectory, nameWithoutExtension),
    doubleFace
  );

  console.log("✅ Resumen de lectura QR:");
  console.log("Con QR detectado:", result.foundQRCodes);
  console.log("Sin QR detectado:", result.noQRCodes);

  console.timeEnd("⏱️ Tiempo total de ejecución");
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
