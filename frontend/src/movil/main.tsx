import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppMovil from "./AppMovil";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppMovil />
  </StrictMode>,
);

// Service worker: permite instalar la app en el celular. El navegador solo lo acepta
// con https (o en localhost), así que en http normal la app funciona pero no se instala.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/movil/sw.js", { scope: "/movil/" }).catch(() => {});
}
