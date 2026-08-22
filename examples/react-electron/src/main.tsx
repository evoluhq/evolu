import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Use contextBridge
window.ipcRenderer?.on("main-process-message", (_event, message) => {
  // oxlint-disable-next-line eslint/no-console -- Displays diagnostic messages sent by Electron's main process.
  console.log(message);
});
