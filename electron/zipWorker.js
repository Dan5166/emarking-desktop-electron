// electron/zipWorker.js
import { parentPort } from "worker_threads";
import archiver from "archiver";
import fs from "fs";
import path from "path";

parentPort.on("message", async ({ folderToZip, outputZipPath, pdfId }) => {
  console.log("Zip worker: Recibido mensaje para zipear:", folderToZip);

  let output; // Declare output stream outside try block to ensure it's closed
  try {
    // 1. Validate inputs (optional but good practice)
    if (!fs.existsSync(folderToZip)) {
      throw new Error(`La carpeta a zipear no existe: ${folderToZip}`);
    }
    // Ensure parent directory for outputZipPath exists
    fs.mkdirSync(path.dirname(outputZipPath), { recursive: true });

    output = fs.createWriteStream(outputZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Compresión máxima
    });

    // Handle stream closing (success)
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

    // Handle stream errors (critical for write stream)
    output.on("error", (err) => {
      console.error("ZIP worker: Error en el stream de salida:", err);
      // Post message with error if write stream fails before archiver error
      parentPort.postMessage({
        type: "result",
        status: "error",
        pdfId,
        error: `Error de escritura al zipear: ${err.message}`,
      });
      // Important: Ensure the worker process itself does not hang if the stream errors out
      // You might need to exit the worker here if the error is fatal and prevents further processing.
      // process.exit(1); // Consider this if you want to explicitly exit on severe stream error
    });

    // Handle archiver warnings (non-fatal)
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("ZIP worker warning (ENOENT):", err.message);
      } else {
        console.warn("ZIP worker warning:", err);
      }
    });

    // Handle archiver errors (fatal for zipping process)
    archive.on("error", (err) => {
      console.error("ZIP worker error (Archiver):", err);
      // Post message with error to main process
      parentPort.postMessage({
        type: "result",
        status: "error",
        pdfId,
        error: `Error de Archiver: ${err.message}`,
      });
      // No need to throw here, as we are already handling it by posting message
      // and the outer catch will not be reached if an 'error' event occurs here.
    });

    // Pipe archive data to file
    archive.pipe(output);

    // Append folder
    archive.directory(folderToZip, path.basename(folderToZip));

    // Finalize the archive (this is an async operation that can throw errors)
    await archive.finalize();

    console.log(
      `ZIP worker: Finalizado proceso de archivado para ${folderToZip}`
    );

    // Do NOT post success message here, it's handled by output.on('close')
    // This is because finalize() doesn't mean the file is completely written and closed yet.
    // output.on('close') is the definitive signal of success.
  } catch (error) {
    console.error(
      `ZIP worker: Error general en el proceso para ${folderToZip}:`,
      error.message
    );
    // Ensure all errors lead to posting a message back
    parentPort.postMessage({
      type: "result",
      status: "error",
      pdfId,
      error: `Error inesperado en worker ZIP: ${error.message}`,
    });
  } finally {
    // Ensure the output stream is properly closed, even if an error occurred before 'close' event fires.
    // This might be tricky with archiver, as archiver itself manages the stream.
    // However, if the error is from *outside* archiver's event handlers (e.g. fs.createWriteStream fails),
    // then this is important.
    if (output && !output.writableEnded) {
      // Check if stream exists and hasn't ended
      output.end(); // Try to end the stream cleanly if it's still open
    }
  }
});
