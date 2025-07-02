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
    console.warn(`Advertencia al limpiar carpeta: ${err.message}`);
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

  await pdf.convert(pdfPath, options);
}

async function readQrCode(filePath) {
  const max_attempts = 3;

  for (let attempt = 0; attempt < max_attempts; attempt++) {
    try {
      const image = await Jimp.read(filePath);

      // Ajuste de brillo progresivo: de 0 (sin cambio) hasta 0.3
      const brightnessValue = attempt * 0.15; // 0.0, 0.15, 0.3
      const contrastValue = attempt * 0.1; // Opcional: 0.0, 0.1, 0.2

      image.brightness(brightnessValue); // Rango: -1 a +1
      image.contrast(contrastValue); // Rango: -1 a +1

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
      console.log(`Intento ${attempt + 1}: ${result.getText()}`);
      return result.getText();
    } catch (err) {
      console.warn(`Intento ${attempt + 1} fallido:`, err.message);
      if (attempt === max_attempts - 1)
        throw new Error("No se pudo leer el QR después de varios intentos");
    }
  }
}

async function readQrCodeFromHalvedImage(filePath, tempFolderPath) {
  console.log(
    "***************************************************************************"
  );
  console.log(
    "---------------------------------------------------------------------------"
  );
  console.log(path.basename(filePath, path.extname(filePath)));
  console.log(
    "---------------------------------------------------------------------------"
  );
  console.log(
    "***************************************************************************"
  );
  console.log(
    "✂ Entrando a leer QR code desde imágenes a la mitad: ",
    filePath
  );

  const image = await Jimp.read(filePath);
  console.log("✅ Imagen leída correctamente");

  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const halfHeight = Math.floor(height / 5);

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof halfHeight !== "number" ||
    width <= 0 ||
    height <= 0 ||
    halfHeight <= 0
  ) {
    throw new Error("Error al recortar imagen: dimensiones inválidas");
  }

  const topClone = image.clone();
  try {
    // const bottomClone = image.clone();

    console.log("✅ Se pudo clonar la imagen");

    const x = 0;
    const y = 0;
    const w = width;
    const h = halfHeight;

    if ([x, y, w, h].some((n) => typeof n !== "number" || isNaN(n))) {
      throw new Error("❌ Parámetros de crop inválidos");
    }

    topClone.crop({ x: x, y: y, w: w, h: h }); // ❌
    // const cropPath = path.join(process.cwd(), "frontend", "public", "crop.jpg");

    console.log("✅ Se pudo recortar la imagen");

    // if (!(topHalf instanceof Jimp) || !(bottomHalf instanceof Jimp)) {
    //   throw new Error("El crop no devolvió una instancia válida de Jimp");
    // }
  } catch (err) {
    console.error("❌ Error al recortar imagen:", err); // sin stringify
    throw new Error("Error al recortar imagen: " + err.message);
  }

  if (!fs.existsSync(tempFolderPath)) {
    fs.mkdirSync(tempFolderPath, { recursive: true });
  }

  const fileName = path.basename(filePath, path.extname(filePath));
  const topPath = path.join(tempFolderPath, `${fileName}_top.png`);
  const bottomPath = path.join(tempFolderPath, `${fileName}_bottom.png`);

  try {
    await topClone.write(topPath);
    // await bottomHalf.write(bottomPath);
    console.log("📝 Archivos top y bottom guardados exitosamente");
  } catch (err) {
    console.error("❌ Error al guardar las imágenes recortadas:", err.message);
    throw new Error("Error al guardar las imágenes recortadas: " + err.message);
  }

  try {
    const text = await readQrCode(topPath);
    console.log("✅ QR encontrado en la mitad superior");
    return text;
  } catch {}

  try {
    const text = await readQrCode(bottomPath);
    console.log("✅ QR encontrado en la mitad inferior");
    return text;
  } catch {}

  return null;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, "_");
}

async function renameImg(oldPath, newName, allPages) {
  const dir = path.dirname(oldPath);
  const oldFileName = path.basename(oldPath); // e.g. page-86
  const newFileName = sanitizeFileName(newName); // e.g. page-renombrada
  const newPath = path.join(dir, newFileName + ".png");

  // Reemplazar nombre en el array
  const index = allPages.indexOf(oldFileName);
  if (index != -1) {
    console.log(
      `💡💡💡💡 Renombrando en array ${allPages[index]} por ${newFileName}`
    );
    allPages[index] = path.join(newFileName + ".png");
  }

  await fs.promises.rename(oldPath, newPath);
  return allPages;
}

async function readAllQRCodesInFolder(
  folderPath,
  doubleFace = false,
  maxRetries = 3
) {
  let allPages = [];
  const foundQRCodes = [];
  const noQRCodes = [];
  const tempHalvesFolder = path.join(folderPath, "halved_images_temp");

  if (!fs.existsSync(tempHalvesFolder)) {
    fs.mkdirSync(tempHalvesFolder, { recursive: true });
  }

  const files = fs
    .readdirSync(folderPath)
    .filter((f) => f.endsWith(".png"))
    .sort();

  let lastQrContent = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(folderPath, file);
    let qrContent = null;

    if (!doubleFace || i % 2 === 0) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          qrContent = await readQrCodeFromHalvedImage(
            fullPath,
            tempHalvesFolder
          );
          if (qrContent) break;
        } catch (err) {
          console.warn(
            `Intento ${attempt} fallido para '${file}': ${err.message}`
          );
        }
      }
      if (qrContent) {
        allPages.push(file);
        allPages = await renameImg(fullPath, qrContent, allPages);
        lastQrContent = qrContent;
        foundQRCodes.push({
          originalFile: file,
          newFile: sanitizeFileName(qrContent) + ".png",
          qrContent,
        });
      } else {
        allPages.push(file);
        noQRCodes.push(file);
      }
    } else {
      if (lastQrContent) {
        allPages.push(file);
        const name = sanitizeFileName(lastQrContent) + "-b";
        allPages = await renameImg(fullPath, name, allPages);
      } else {
        console.warn(
          `No hay QR previo para renombrar '${file}' (página doble cara)`
        );
        noQRCodes.push(file);
        allPages.push(file);
      }
    }
  }

  return { foundQRCodes, noQRCodes, allPages };
}

parentPort.on("message", async ({ pdfName, doubleFace, savedPdfsPath }) => {
  console.time(`⏱️ Tiempo total de ejecución para ${pdfName}`);
  const pdfPath = path.join(savedPdfsPath, pdfName);
  const nameWithoutExt = path.basename(pdfName, path.extname(pdfName));

  try {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`El archivo PDF '${pdfName}' no existe.`);
    }

    await clearFolder(path.join(outputDirectory, nameWithoutExt));
    await convertPdfToImages(pdfPath);

    const result = await readAllQRCodesInFolder(
      path.join(outputDirectory, nameWithoutExt),
      doubleFace
    );

    if (result) {
      console.log("YAAAAAAAAAAAAAAAAAAAAAAA: ", result.allPages);
    }

    console.timeEnd(`⏱️ Tiempo total de ejecución para ${pdfName}`);
    parentPort.postMessage({ status: "success", pdfName, result });
  } catch (err) {
    console.error(`❌ Error escaneando ${pdfName}:`, err.message);
    parentPort.postMessage({ status: "error", pdfName, error: err.message });
  }
});
