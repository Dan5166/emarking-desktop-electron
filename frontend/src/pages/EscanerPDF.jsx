import { useEffect, useState } from "react";

export default function EscanerPDF() {
  const [pdfList, setPdfList] = useState([]);
  const [selectedPdfId, setSelectedPdfId] = useState(null);
  const [activeTab, setActiveTab] = useState("vista-previa");
  const [scanning, setScanning] = useState(false);
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

  const scanPdf = async () => {
    if (scanning) return alert("Ya se está escaneando un PDF.");

    const selectedPdf = pdfList.find((pdf) => pdf.id === selectedPdfId);
    if (!selectedPdf) return alert("Selecciona un PDF válido primero.");

    const doubleFace = selectedPdf.doubleFace;

    setScanning(true);
    setPdfList((prev) =>
      prev.map((pdf) =>
        pdf.id === selectedPdfId ? { ...pdf, status: "scanning" } : pdf
      )
    );
    const startTime = performance.now();

    try {
      const result = await window.electron.scanPdf(
        selectedPdf.name,
        doubleFace
      );
      const endTime = performance.now();

      const updatedPdf = {
        ...selectedPdf,
        status: "scanned",
        foundQRCodes: result.foundQRCodes || [],
        noQRCodes: result.noQRCodes || [],
        duration: ((endTime - startTime) / 1000).toFixed(2),
      };

      setPdfList((prev) =>
        prev.map((pdf) => (pdf.id === selectedPdfId ? updatedPdf : pdf))
      );
    } catch (err) {
      alert("Error al escanear el PDF: " + err.message);
      setPdfList((prev) =>
        prev.map((pdf) =>
          pdf.id === selectedPdfId ? { ...pdf, status: "error" } : pdf
        )
      );
    } finally {
      setScanning(false);
    }
  };

  const selectedPdf = pdfList.find((pdf) => pdf.id === selectedPdfId);

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
                default:
                  statusIcon = <i className="fa-solid fa-exclamation-circle" />;
                  statusColor = "text-red-500";
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
                  disabled={!selectedPdf}
                  onClick={scanPdf}
                >
                  <i className="fa-solid fa-expand" /> Escanear PDF
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
                            src={`/${selectedPdf.name.replace(
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
                    El PDF no ha sido escaneado correctamente.
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
