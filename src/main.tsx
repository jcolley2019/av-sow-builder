import React from "react";
import ReactDOM from "react-dom/client";

// Self-hosted type — UI/body face (Geist), data + model-number face (Geist
// Mono), and the paper-pane face (Carlito = Calibri metric clone, used when
// real Calibri is absent). No external font requests; works offline.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "@fontsource/carlito/400.css";
import "@fontsource/carlito/400-italic.css";
import "@fontsource/carlito/700.css";

import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
