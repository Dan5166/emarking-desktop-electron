import path from "path";
import fs from "fs";
import { parentPort } from "worker_threads";
import pdf from "pdf-poppler";

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
  console.time("convertir-pdf-a-imagenes");
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
  console.timeEnd("convertir-pdf-a-imagenes");
}

parentPort.on("message", async ({ pdfName, doubleFace, savedPdfsPath }) => {
  console.time(`⏱️ Tiempo total de ejecución para SOLO PASAR EL PDF A IMAGEN ${pdfName}`);
  const pdfPath = path.join(savedPdfsPath, pdfName);
  const nameWithoutExt = path.basename(pdfName, path.extname(pdfName));

  try {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`El archivo PDF '${pdfName}' no existe.`);
    }

    await clearFolder(path.join(outputDirectory, nameWithoutExt));
    await convertPdfToImages(pdfPath);

    console.timeEnd(`⏱️ Tiempo total de ejecución para SOLO PASAR EL PDF A IMAGEN ${pdfName}`);
    parentPort.postMessage({ status: "success", pdfName });
  } catch (err) {
    console.error(`❌ Error escaneando ${pdfName}:`, err.message);
    parentPort.postMessage({ status: "error", pdfName, error: err.message });
  }
});