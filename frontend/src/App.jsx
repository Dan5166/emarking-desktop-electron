import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import EscanerPDF from "./pages/EscanerPDF";

function App() {
  const [count, setCount] = useState(0);

  return <EscanerPDF />;
}

export default App;
