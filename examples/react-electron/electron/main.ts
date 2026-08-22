import { app, BrowserWindow } from "electron";
import path from "node:path";

const __dirname = import.meta.dirname;

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = /*#__PURE__*/ path.join(
  process.env.APP_ROOT,
  "dist-electron",
);
export const RENDERER_DIST = /*#__PURE__*/ path.join(
  process.env.APP_ROOT,
  "dist",
);

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

const reportError = (error: unknown): void => {
  // oxlint-disable-next-line eslint/no-console -- Electron startup failures must remain visible to developers.
  console.error(error);
};

const createWindow = (): void => {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  // Open DevTools for debugging
  win.webContents.openDevTools();

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  const loadWindow = VITE_DEV_SERVER_URL
    ? win.loadURL(VITE_DEV_SERVER_URL)
    : win.loadFile(path.join(RENDERER_DIST, "index.html"));
  void loadWindow.catch(reportError);
};

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

void app.whenReady().then(createWindow).catch(reportError);
