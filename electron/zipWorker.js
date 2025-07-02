// electron/zipWorker.js
import { parentPort } from "worker_threads";
import archiver from "archiver";
import fs from "fs";
import path from "path";

parentPort.on("message", async ({ folderToZip, outputZipPath, pdfId }) => {
  console.log("Zip worker: Recibido mensaje para zipear:", folderToZip);

  let output;
  try {
    if (!fs.existsSync(folderToZip)) {
      throw new Error(`La carpeta a zipear no existe: ${folderToZip}`);
    }
    fs.mkdirSync(path.dirname(outputZipPath), { recursive: true });

    output = fs.createWriteStream(outputZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });
    output.on("close", () => {
      console.log(
        `ZIP worker: ${archive.pointer()} total bytes para ${path.basename(
          folderToZip
        )}.zip`
      );
      console.log(
        "ZIP worker: Archiver ha finalizado y el descriptor de archivo de salida ha sido cerrado."
      );
      parentPort.postMessage({
        type: "result",
        status: "success",
        pdfId,
        outputPath: outputZipPath,
      });
    });

    output.on("error", (err) => {
      console.error("ZIP worker: Error en el stream de salida:", err);
      parentPort.postMessage({
        type: "result",
        status: "error",
        pdfId,
        error: `Error de escritura al zipear: ${err.message}`,
      });
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("ZIP worker warning (ENOENT):", err.message);
      } else {
        console.warn("ZIP worker warning:", err);
      }
    });
    archive.on("error", (err) => {
      console.error("ZIP worker error (Archiver):", err);
      parentPort.postMessage({
        type: "result",
        status: "error",
        pdfId,
        error: `Error de Archiver: ${err.message}`,
      });
    });

    archive.pipe(output);
    archive.directory(folderToZip, path.basename(folderToZip));

    await archive.finalize();

    console.log(
      `ZIP worker: Finalizado proceso de archivado para ${folderToZip}`
    );
  } catch (error) {
    console.error(
      `ZIP worker: Error general en el proceso para ${folderToZip}:`,
      error.message
    );
    parentPort.postMessage({
      type: "result",
      status: "error",
      pdfId,
      error: `Error inesperado en worker ZIP: ${error.message}`,
    });
  } finally {
    if (output && !output.writableEnded) {
      output.end();
    }
  }
});
