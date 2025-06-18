import { useEffect, useState } from "react";

export default function EscanerPDF() {
  const [pdfList, setPdfList] = useState([]);
  const [selectedPdfId, setSelectedPdfId] = useState(null);
  const [activeTab, setActiveTab] = useState("vista-previa");
  const [scanning, setScanning] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const handleFileUpload = async () => {
    const filePath = await window.electron.openFileDialog();
    if (!filePath) return;

    const fileName = filePath.split(/[/\\]/).pop();
    const newPdf = {
      id: Date.now(),
      name: fileName,
      path: filePath,
      status: "pending",
      foundQRCodes: [],
      noQRCodes: [],
      doubleFace: false,
    };

    setPdfList((prev) => [...prev, newPdf]);
    setSelectedPdfId(newPdf.id);
  };

  const handlePdfSelect = (id) => {
    setSelectedPdfId(id);
  };

  const handleDeletePdf = async (id) => {
    const pdfToDelete = pdfList.find((pdf) => pdf.id === id);
    if (!pdfToDelete) return;

    const confirm = window.confirm(
      `¿Eliminar "${pdfToDelete.name}" del sistema?`
    );
    if (!confirm) return;

    try {
      const result = await window.electron.deleteFile(pdfToDelete.path);
      if (result.success) {
        setPdfList((prev) => prev.filter((pdf) => pdf.id !== id));
        if (selectedPdfId === id) setSelectedPdfId(null);
      } else {
        alert("Error al eliminar el archivo: " + result.error);
      }
    } catch (error) {
      alert("Error al eliminar el archivo: " + error.message);
    }
  };

  const scanPdf = async (pdfToScan) => {
    const doubleFace = pdfToScan.doubleFace;

    // Actualizamos el estado del PDF a 'scanning' inmediatamente
    setPdfList((prev) =>
      prev.map((pdf) =>
        pdf.id === pdfToScan.id ? { ...pdf, status: "scanning" } : pdf
      )
    );

    const startTime = performance.now();
    let finalStatus = "error"; // Default to error
    let foundQRCodes = [];
    let noQRCodes = [];
    let errorMessage = "";
    let duration = "0.00";

    try {
      const result = await window.electron.scanPdf(
        pdfToScan.name, // Asegúrate de pasar solo el nombre del archivo
        doubleFace
      );
      const endTime = performance.now();

      finalStatus = "scanned";
      foundQRCodes = result.foundQRCodes || [];
      noQRCodes = result.noQRCodes || [];
      duration = ((endTime - startTime) / 1000).toFixed(2);

      // This part is crucial for single scan updates
      setPdfList((prev) =>
        prev.map((pdf) =>
          pdf.id === pdfToScan.id
            ? {
                ...pdf,
                status: finalStatus,
                foundQRCodes: foundQRCodes,
                noQRCodes: noQRCodes,
                duration: duration,
                error: undefined, // Clear any previous error
              }
            : pdf
        )
      );

      // This return is primarily for `Promise.allSettled` in `scanAllPendingPdfs`
      return {
        pdf: pdfToScan,
        status: finalStatus,
        foundQRCodes: foundQRCodes,
        noQRCodes: noQRCodes,
        duration: duration,
      };
    } catch (err) {
      console.error(`Error al escanear el PDF ${pdfToScan.name}:`, err.message);
      errorMessage = err.message;

      // This part is crucial for single scan error updates
      setPdfList((prev) =>
        prev.map((pdf) =>
          pdf.id === pdfToScan.id
            ? {
                ...pdf,
                status: "error",
                error: errorMessage,
                foundQRCodes: [], // Clear previous results on error
                noQRCodes: [],
                duration: undefined,
              }
            : pdf
        )
      );

      // This return is primarily for `Promise.allSettled` in `scanAllPendingPdfs`
      // Ensure the rejected promise carries the original pdf object for identification
      // When a promise in `Promise.allSettled` rejects, its `reason` is the error,
      // so we want to structure that error object to contain the `pdf` for identification later.
      const errorObj = {
        pdf: pdfToScan,
        status: "error",
        error: errorMessage,
      };
      // Re-throw or return a rejected promise that matches the structure expected by Promise.allSettled's `rejectedResult.reason.pdf`
      // Since scanPdf is an async function, `throw` will cause the promise to be rejected.
      throw errorObj; // Throwing the object will make it the 'reason' of the rejected promise
    }
  };

  const scanAllPendingPdfs = async () => {
    if (scanning) {
      alert("Ya se está realizando un escaneo masivo.");
      return;
    }

    const pendingPdfs = pdfList.filter((pdf) => pdf.status === "pending");

    if (pendingPdfs.length === 0) {
      alert("No hay PDFs con estado 'pending' para escanear.");
      return;
    }

    setScanning(true); // Indica que un escaneo masivo está en progreso

    try {
      // Creamos un array de promesas, una por cada PDF pendiente.
      // Cada llamada a `scanPdf` aquí devolverá una promesa.
      const scanPromises = pendingPdfs.map((pdf) => scanPdf(pdf));

      // Usamos Promise.allSettled para esperar que TODAS las promesas se resuelvan o rechacen.
      // Esto permite que los Workers se inicien en paralelo.
      const results = await Promise.allSettled(scanPromises);

      // Una vez que todas las promesas han terminado, actualizamos el estado de la lista de PDFs
      setPdfList((prev) =>
        prev.map((pdf) => {
          const matchingResult = results.find(
            (r) => r.status === "fulfilled" && r.value.pdf.id === pdf.id
          );
          if (matchingResult) {
            // El escaneo fue exitoso
            return { ...pdf, ...matchingResult.value };
          }

          const rejectedResult = results.find(
            (r) =>
              r.status === "rejected" &&
              r.reason.pdf &&
              r.reason.pdf.id === pdf.id // Revisa r.reason.pdf para ver si tiene el objeto pdf original
          );
          if (rejectedResult) {
            // El escaneo falló, actualiza el estado a 'error'
            return { ...pdf, status: "error" };
          }
          return pdf; // Si no se encuentra en los resultados (quizás no era 'pending' o ya se procesó), retorna como está.
        })
      );

      const successfulScans = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      const failedScans = results.filter((r) => r.status === "rejected").length;
      alert(
        `Escaneo masivo completado. Éxitos: ${successfulScans}, Fallos: ${failedScans}.`
      );
    } catch (error) {
      console.error("Error general durante el escaneo masivo:", error);
      alert(
        "Ocurrió un error general durante el escaneo masivo. Consulta la consola para más detalles."
      );
    } finally {
      setScanning(false); // Finaliza el estado de escaneo masivo
    }
  };

  const selectedPdf = pdfList.find((pdf) => pdf.id === selectedPdfId);

  const zipPdfSingle = async (pdfToZip) => {
    if (zipping || scanning) {
      alert("Ya hay una operación en curso (zipping o escaneo).");
      return;
    }

    if (!pdfToZip || pdfToZip.status !== "scanned") {
      alert(
        "Solo puedes guardar en ZIP PDFs que han sido escaneados correctamente."
      );
      return;
    }

    // Opcional: Confirmar si hay páginas sin QR antes de zipear
    if (pdfToZip.noQRCodes.length > 0) {
      const confirmZip = window.confirm(
        "Este PDF tiene páginas sin QR detectado. ¿Deseas guardarlo en ZIP de todos modos?"
      );
      if (!confirmZip) {
        return;
      }
    }

    setZipping(true); // Activa el estado de zipping global
    setPdfList((prev) =>
      prev.map((pdf) =>
        pdf.id === pdfToZip.id ? { ...pdf, status: "zipping" } : pdf
      )
    );

    const folderName = pdfToZip.name.replace(/\.pdf$/i, "");
    try {
      await window.electron.zipFolder(folderName, pdfToZip.id); // Llama al worker
      alert(`PDF '${pdfToZip.name}' guardado en ZIP exitosamente.`);
    } catch (error) {
      console.error(`Error al zipear el PDF ${pdfToZip.name}:`, error.message);
      alert(`Error al zipear PDF '${pdfToZip.name}': ${error.message}`);
    } finally {
      setZipping(false); // Desactiva el estado de zipping global
    }
  };

  useEffect(() => {
    if (!selectedPdf) return;
    console.log("PDF seleccionado:", selectedPdf);
  }, [selectedPdf]);

  return (
    <div className="h-screen flex flex-col bg-white p-3">
      <h1 className="text-2xl font-bold p-4 text-center">Emarking Desktop</h1>

      <div className="flex-1 grid grid-cols-4 gap-6 overflow-hidden">
        <div className="p-4 col-span-1 flex flex-col h-full border border-gray-200 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl">Documentos</h2>
            <button
              className="rounded-md p-2 border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
              onClick={handleFileUpload}
            >
              <i className="fas fa-plus" /> Agregar
            </button>
          </div>
          {/* Nuevo botón para escanear todos los PDFs pendientes */}
          <button
            className="rounded-md p-2 mt-2 border border-gray-300 bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2"
            onClick={scanAllPendingPdfs}
            disabled={scanning} // Deshabilita el botón mientras se está escaneando
          >
            {scanning ? (
              <>
                <i className="fa-solid fa-spinner animate-spin" /> Escaneando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-sync-alt" /> Escanear todos los
                pendientes
              </>
            )}
          </button>
          {/* Fin del nuevo botón */}
          <ul className="flex-1 overflow-auto rounded p-2 mt-2">
            {pdfList.map((pdf) => {
              const isSelected = selectedPdfId === pdf.id;

              let statusIcon, statusColor;
              switch (pdf.status) {
                case "pending":
                  statusIcon = <i className="fa-regular fa-clock" />;
                  statusColor = "text-gray-500";
                  break;
                case "scanning":
                  statusIcon = (
                    <i className="fa-solid fa-spinner animate-spin" />
                  );
                  statusColor = "text-blue-500";
                  break;
                case "scanned":
                  if (pdf.noQRCodes.length > 0) {
                    statusIcon = (
                      <i className="fa-solid fa-exclamation-triangle" />
                    );
                    statusColor = "text-yellow-500";
                  } else {
                    statusIcon = <i className="fa-solid fa-check-circle" />;
                    statusColor = "text-green-500";
                  }
                  break;
                case "zipped":
                  statusIcon = <i className="fa-solid fa-file-zipper" />;
                  statusColor = "text-blue-500";
                  break;
                case "error": // Añadir caso para el estado de error
                  statusIcon = <i className="fa-solid fa-exclamation-circle" />;
                  statusColor = "text-red-500";
                  break;
                default:
                  statusIcon = <i className="fa-solid fa-question-circle" />; // Icono por defecto si el estado no está claro
                  statusColor = "text-gray-400";
              }

              return (
                <li
                  key={pdf.id}
                  className={`flex justify-between items-center p-2 rounded mb-2 cursor-pointer hover:bg-gray-100 ${
                    isSelected ? "bg-gray-100" : ""
                  }`}
                  onClick={() => handlePdfSelect(pdf.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className={statusColor}>{statusIcon}</span>
                    <span>{pdf.name.replace(/\.pdf$/i, "")}</span>
                  </div>
                  <button
                    className="p-2 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePdf(pdf.id);
                    }}
                  >
                    <i className="fa-regular fa-trash-can" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-6 col-span-3 overflow-auto flex flex-col h-full border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <h1 className="text-xl mb-4">
              {selectedPdf
                ? selectedPdf.name.replace(/\.pdf$/i, "")
                : "Selecciona un documento"}
            </h1>
            {selectedPdf && (
              <button
                className="ml-2 text-gray-500 hover:text-red-500"
                onClick={() => setSelectedPdfId(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
            {selectedPdf && (
              <div className="flex items-center gap-2 ml-auto">
                <label className="flex items-center gap-2 text-sm mr-4">
                  <input
                    type="checkbox"
                    checked={selectedPdf.doubleFace}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setPdfList((prev) =>
                        prev.map((pdf) =>
                          pdf.id === selectedPdfId
                            ? { ...pdf, doubleFace: newValue }
                            : pdf
                        )
                      );
                    }}
                  />
                  Doble cara
                </label>
                <button
                  className="p-2 rounded-md border border-gray-300 bg-gray-900 text-white hover:bg-gray-700 flex items-center gap-2"
                  disabled={!selectedPdf || scanning} // Deshabilita si hay un escaneo masivo
                  onClick={() => scanPdf(selectedPdf)} // Pasa el PDF seleccionado a scanPdf
                >
                  <i className="fa-solid fa-expand" /> Escanear PDF
                </button>
                <button
                  className="p-2 rounded-md border border-gray-300 bg-gray-900 text-white hover:bg-gray-700 flex items-center gap-2"
                  disabled={!selectedPdf || scanning}
                  onClick={() => {
                    zipPdfSingle(selectedPdf);
                  }}
                >
                  <i className="fa-solid fa-file-zipper" /> Guardar en Zip
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-4 mb-4 bg-gray-200 p-1 rounded-lg">
            {["vista-previa", "estado-paginas"].map((tab) => (
              <button
                key={tab}
                className={`p-2 rounded-md w-full ${
                  activeTab === tab
                    ? "bg-white text-gray-900"
                    : "bg-gray-200 text-gray-900"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "vista-previa" ? (
                  <>
                    <i className="fa-solid fa-file-lines" /> Vista previa
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-table-list" /> Estado de páginas
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 bg-gray-100 p-4 rounded-lg border border-gray-300 overflow-auto">
            {!selectedPdf && (
              <div className="flex flex-col items-center justify-center h-full">
                <i className="fa-regular fa-file-lines text-5xl mb-4 text-gray-500" />
                <button
                  onClick={handleFileUpload}
                  className="text-gray-900 p-2 rounded-lg border border-gray-300 hover:bg-gray-100"
                >
                  <i className="fa-solid fa-arrow-up-from-bracket" />{" "}
                  Seleccionar PDF
                </button>
              </div>
            )}

            {selectedPdf && activeTab === "vista-previa" && (
              <webview
                src={`file://${selectedPdf.path}`}
                style={{ width: "100%", height: "80vh", border: "none" }}
              />
            )}

            {selectedPdf && activeTab === "estado-paginas" && (
              <>
                {selectedPdf.status === "scanned" ? (
                  <>
                    <h2 className="text-lg font-semibold mb-4">
                      Imágenes sin QR
                    </h2>
                    {selectedPdf.noQRCodes.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Todas las páginas tienen QR.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {selectedPdf.noQRCodes.map((imgPath, i) => (
                          <img
                            key={i}
                            src={`./${selectedPdf.name.replace(
                              /\.pdf$/i,
                              ""
                            )}/${imgPath}`}
                            className="rounded shadow border border-gray-300 cursor-pointer hover:opacity-80"
                            onClick={() => setPreviewImage(imgPath)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : selectedPdf.status === "pending" ? (
                  <p className="text-sm text-gray-500">
                    El PDF aún no ha sido escaneado.
                  </p>
                ) : selectedPdf.status === "scanning" ? (
                  <p className="text-sm text-gray-500">Escaneando...</p>
                ) : (
                  <p className="text-sm text-gray-500">
                    El PDF no ha sido escaneado correctamente o hubo un error.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="relative bg-white rounded-lg shadow-lg p-4 max-w-3xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 text-gray-600 hover:text-red-500"
            >
              <i className="fa-solid fa-xmark text-2xl" />
            </button>
            <h1 className="text-xl mb-4">
              Vista previa de la imagen: {previewImage}
            </h1>
            <img
              src={`./${selectedPdf?.name.replace(
                /\.pdf$/i,
                ""
              )}/${previewImage}`}
              alt="Vista previa"
              className="max-w-full max-h-[80vh] rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
