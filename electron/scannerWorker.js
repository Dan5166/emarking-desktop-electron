// scannerWorker.js
import { parentPort } from "worker_threads";
import path from "path";
import fs from "fs";
import pdf from "pdf-poppler";
import { Jimp } from "jimp";
import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

// Ruta del directorio público del frontend (ajusta según tu estructura)
const outputDirectory = path.join(process.cwd(), "frontend", "public");

async function clearFolder(folderPath) {
  console.log("Carpeta limpiada");
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isFile()) {
        fs.unlinkSync(fullPath);
      } else if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } catch (err) {
    // console.error(`Error al limpiar la carpeta ${folderPath}:`, err);
    // No lanzar error, solo registrarlo si es un problema menor.
  }
}

async function convertPdfToImages(pdfPath) {
  const pdfFileName = path.basename(pdfPath, path.extname(pdfPath));
  const outputFolder = path.join(outputDirectory, pdfFileName);

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const options = {
    format: "png",
    out_dir: outputFolder,
    out_prefix: "page",
    page: null,
  };

  try {
    await pdf.convert(pdfPath, options);
  } catch (error) {
    throw new Error(`Error convirtiendo PDF a imágenes: ${error.message}`);
  }
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
  } catch (err) {
    throw new Error(
      `Error renombrando '${path.basename(oldPath)}': ${err.message}`
    );
  }
}

async function readAllQRCodesInFolder(
  folderPath,
  doubleFace = false,
  maxRetries = 3
) {
  const foundQRCodes = [];
  const noQRCodes = [];

  try {
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => path.extname(file).toLowerCase() === ".png")
      .sort();

    let lastQrContent = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fullPath = path.join(folderPath, file);

      if (!doubleFace || i % 2 === 0) {
        let qrContent = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            qrContent = await readQrCode(fullPath);
            break;
          } catch (err) {
            if (attempt === maxRetries) {
              console.warn(
                `No QR encontrado en '${file}' tras ${maxRetries} intentos`
              );
            }
          }
        }

        if (qrContent) {
          await renameImg(fullPath, qrContent);
          lastQrContent = qrContent;
          foundQRCodes.push({
            originalFile: file,
            newFile: sanitizeFileName(qrContent) + ".png",
            qrContent: qrContent,
          });
        } else {
          noQRCodes.push(file);
        }
      } else {
        if (lastQrContent) {
          const doubleFaceName = sanitizeFileName(lastQrContent) + "-b";
          await renameImg(fullPath, doubleFaceName);
          // Aquí decides si quieres añadir también las páginas traseras a foundQRCodes
          // O podrías tener otra lista para ellas. Por ahora, solo las delanteras con QR.
        } else {
          console.warn(
            `No hay QR previo para renombrar '${file}' (página doble cara)`
          );
          noQRCodes.push(file);
        }
      }
    }
  } catch (err) {
    throw new Error(`Error leyendo la carpeta de imágenes: ${err.message}`);
  }

  return { foundQRCodes, noQRCodes };
}

// Escuchar mensajes del proceso principal
parentPort.on("message", async ({ pdfName, doubleFace, savedPdfsPath }) => {
  console.time(`⏱️ Tiempo total de ejecución para ${pdfName}`);
  const pdfPath = path.join(savedPdfsPath, pdfName);
  const nameWithoutExtension = path.basename(pdfName, path.extname(pdfName));

  try {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`El archivo PDF '${pdfName}' no existe.`);
    }

    await clearFolder(path.join(outputDirectory, nameWithoutExtension));
    await convertPdfToImages(pdfPath);
    const result = await readAllQRCodesInFolder(
      path.join(outputDirectory, nameWithoutExtension),
      doubleFace
    );

    console.timeEnd(`⏱️ Tiempo total de ejecución para ${pdfName}`);
    // Envía el resultado de vuelta al proceso principal
    parentPort.postMessage({ status: "success", pdfName, result });
  } catch (error) {
    console.error(`❌ Error escaneando ${pdfName}:`, error.message);
    // Envía el error de vuelta al proceso principal
    parentPort.postMessage({ status: "error", pdfName, error: error.message });
  }
});
