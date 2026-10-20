import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing app root.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker caches only the app shell. User data is explicitly scoped
// in the application cache; authenticated API responses are never intercepted.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const script = new URL("sw.js", document.baseURI);
    navigator.serviceWorker
      .register(script, { scope: new URL("./", script).pathname })
      .catch(() => {
        /* The app remains online-only if shell storage is unavailable. */
      });
  });
}
