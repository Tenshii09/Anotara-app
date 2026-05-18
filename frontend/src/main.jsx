// React entrypoint that mounts the app into the root DOM node.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("anotara:pwa-update"));
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent("anotara:pwa-offline-ready"));
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
