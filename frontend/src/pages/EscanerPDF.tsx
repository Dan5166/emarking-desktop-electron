import { useEffect, useState } from "react";

export default function EscanerPDF() {
  const [pdfList, setPdfList] = useState();
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [selectedPdfName, setSelectedPdfName] = useState(null);
  const [selectedPdfPath, setSelectedPdfPath] = useState(null);
  const [activeTab, setActiveTab] = useState("vista-previa");
  const [scanning, setScanning] = useState(false);

  const handleFileUpload = async () => {
    const filePath = await window.electron.openFileDialog();
    if (filePath) {
      const fileName = filePath.split(/[/\\]/).pop(); // soporte para Windows y Unix
      const newPdf = {
        name: fileName,
        path: filePath,
        status: "ok",
      };
      setPdfList((prev) => [...prev, newPdf]);
      setSelectedPdf(fileName);
      setSelectedPdfName(fileName.replace(/\.pdf$/i, "")); // sin extensión
      setSelectedPdfPath(filePath);
    }
  };

  const handlePdfSelect = (pdfName, pdfPath) => {
    setSelectedPdf(pdfName);
    setSelectedPdfName(pdfName.replace(/\.pdf$/i, "")); // sin extensión
    setSelectedPdfPath(pdfPath);
  };

  const handleDeletePdf = async (pdfName) => {
    const pdfToDelete = pdfList.find((pdf) => pdf.name === pdfName);
    if (!pdfToDelete) return;

    const confirm = window.confirm(`¿Eliminar "${pdfName}" del sistema?`);
    if (!confirm) return;

    try {
      const result = await window.electron.deleteFile(pdfToDelete.path); // Llamada correcta al manejador
      if (result.success) {
        setPdfList((prevList) =>
          prevList.filter((pdf) => pdf.name !== pdfName)
        );
        if (selectedPdf === pdfName) {
          setSelectedPdf(null);
          setSelectedPdfName(null);
          setSelectedPdfPath(null);
        }
      } else {
        alert("Error al eliminar el archivo: " + result.error);
      }
    } catch (error) {
      alert("Error al eliminar el archivo: " + error.message);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const scanPdf = async () => {
    console.log("Escaneando PDF...");
    if (scanning) {
      alert("Ya se está escaneando un PDF.");
      return;
    }
    setScanning(true);

    if (!selectedPdfPath) {
      alert("Por favor, selecciona un PDF primero.");
      setScanning(false);
      return;
    }

    const startTime = performance.now(); // ⏱️ Inicio

    try {
      const result = await window.electron.scanPdf(selectedPdfPath);

      const endTime = performance.now(); // ⏱️ Fin
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

      setScanning(false);

      if (result.success) {
        alert(
          `${selectedPdfPath} escaneado correctamente en ${durationSeconds} segundos.`
        );
      } else {
        alert(`Error al escanear el PDF: ${result.error}`);
      }
    } catch (error) {
      setScanning(false);
      alert("Error al escanear el PDF: " + error.message);
    }
  };

  const getListImagesToScan = async () => {
    if (!selectedPdfPath) {
      alert("Por favor, selecciona un PDF primero.");
      return;
    }
    try {
      const images = await window.electron.listImagesToScan(selectedPdfPath);
      if (images && images.length > 0) {
        console.log("Imágenes a escanear:", images);
        return images;
      } else {
        alert("No se encontraron imágenes para escanear.");
      }
    } catch (error) {
      alert("Error al obtener las imágenes: " + error.message);
    }
  };

  useEffect(() => {
    if (selectedPdf) {
      console.log("PDF seleccionado:", selectedPdf);
    }
    if (selectedPdfPath) {
      console.log("Ruta del PDF seleccionado:", selectedPdfPath);
    }
  }, [selectedPdf, pdfList]);

  useEffect(() => {
    const loadInitialPdfs = async () => {
      const loadedPdfs = await window.electron.listPdfs();
      setPdfList(loadedPdfs);
    };

    loadInitialPdfs();
  }, []);

  useEffect(() => {
    if (!selectedPdfPath) {
      console.log("No hay PDF seleccionado o escaneo en progreso.");
      return;
    }
    if (scanning) {
      console.log("Escaneo en progreso...");
      return;
    }
    if (selectedPdfPath && !scanning) {
      console.log("Revisando si hay imagenes a procesar:", selectedPdfPath);
      getListImagesToScan();
    }
  }, [scanning, selectedPdfPath]);

  return (
    <div className="h-screen flex flex-col bg-white p-3">
      <h1 className="text-2xl font-bold p-4 text-center">Emarking Desktop</h1>

      <div className="flex-1 grid grid-cols-4 gap-6 overflow-hidden">
        {/* Panel izquierdo */}
        <div className="p-4 col-span-1 flex flex-col h-full border border-gray-200 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl">Documentos</h2>
            <button
              className="rounded-md p-2 flex items-center gap-2 border border-gray-300 hover:bg-gray-100"
              onClick={handleFileUpload}
            >
              <i className="fas fa-plus"></i> Agregar
            </button>
          </div>

          <div className="border-t border-gray-300 my-4"></div>

          <ul className="flex-1 overflow-auto rounded p-2 mt-2">
            {pdfList &&
              pdfList.map((pdf, index) => (
                <li
                  key={index}
                  className={`flex justify-between items-center p-2 rounded mb-2 cursor-pointer hover:bg-gray-100 ${
                    selectedPdf === pdf.name ? "bg-gray-100" : ""
                  }`}
                  onClick={() => handlePdfSelect(pdf.name, pdf.path)}
                >
                  <div className="flex items-center gap-2">
                    <i className="fa-regular fa-file-lines"></i>
                    <span>{pdf.name.replace(/\.pdf$/i, "")}</span>
                  </div>
                  <button
                    className="p-2 hover:text-red-500"
                    onClick={() => handleDeletePdf(pdf.name)}
                  >
                    <i className="fa-regular fa-trash-can"></i>
                  </button>
                </li>
              ))}
          </ul>
        </div>

        {/* Panel derecho */}
        <div className="p-6 col-span-3 overflow-auto flex flex-col h-full border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <h1 className="text-xl mb-4">
              {selectedPdfName || "Selecciona un documento"}
              {selectedPdf && (
                <button
                  className="ml-2 text-gray-500 hover:text-red-500"
                  onClick={() => {
                    setSelectedPdf(null);
                    setSelectedPdfName(null);
                    setSelectedPdfPath(null);
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </h1>
            <button
              className="ml-auto p-2 rounded-md border border-gray-300 bg-gray-900 text-white hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
              disabled={!selectedPdfPath}
              onClick={scanPdf}
            >
              <i className="fa-solid fa-expand"></i> Escanear PDF
            </button>
            <button className="ml-2 p-2 rounded-md border border-gray-300 bg-gray-400 text-white hover:bg-gray-300 flex items-center gap-2 cursor-pointer">
              <i className="fa-solid fa-print"></i> Guardar como ZIP
            </button>
          </div>
          <div className="flex gap-4 mb-4 bg-gray-200 p-1 rounded-lg">
            <button
              className={`p-2 rounded-md w-full ${
                activeTab === "vista-previa"
                  ? "bg-white text-gray-900"
                  : "bg-gray-200 text-gray-900"
              }`}
              onClick={() => handleTabChange("vista-previa")}
            >
              <i className="fa-solid fa-file-lines"></i> Vista previa
            </button>
            <button
              className={`p-2 rounded-md w-full ${
                activeTab === "estado-paginas"
                  ? "bg-white text-gray-900"
                  : "bg-gray-200 text-gray-900"
              }`}
              onClick={() => handleTabChange("estado-paginas")}
            >
              <i className="fa-solid fa-table-list"></i> Estado de páginas
            </button>
          </div>

          <div className="flex flex-col items-center justify-center flex-1 bg-gray-100 p-4 rounded-lg border border-gray-300">
            {!selectedPdf && (
              <>
                <i className="fa-regular fa-file-lines text-5xl mb-4 text-gray-500"></i>
                <button
                  onClick={handleFileUpload}
                  className="text-gray-900 p-2 rounded-lg flex items-center gap-2 font-semibold text-sm border border-gray-300 hover:bg-gray-100"
                >
                  <i className="fa-solid fa-arrow-up-from-bracket"></i>
                  Seleccionar PDF
                </button>
              </>
            )}

            {scanning && (
              <div className="mt-4 w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center">
                  <i className="fa-solid fa-spinner fa-spin text-3xl text-gray-500"></i>
                  <p className="text-gray-500 mt-2">Creando imagenes...</p>
                </div>
              </div>
            )}

            {selectedPdf && selectedPdfPath && activeTab == "vista-previa" && (
              <div className="mt-4 w-full h-full bg-white">
                <webview
                  src={`file://${selectedPdfPath}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
                  allowpopups="true"
                />
              </div>
            )}
            {selectedPdf && activeTab == "estado-paginas" && (
              <div className="mt-4 w-full h-full bg-white flex items-center justify-center gap-4">
                <i className="fa-solid fa-table-list text-2xl text-gray-500"></i>
                <p className="text-gray-500 text-2xl">
                  Estado de páginas no disponible
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
