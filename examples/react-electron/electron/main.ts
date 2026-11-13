import { app, BrowserWindow } from "electron";
import path from "node:path";

const __dirname = import.meta.dirname;

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ └── main.js
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
    // No preload: the renderer needs no API of the main process yet. A preload
    // should expose only named functions the app calls, never ipcRenderer
    // itself, which would let any script in the renderer reach every IPC
    // channel. Storing the DeviceSecret with safeStorage
    // (https://github.com/evoluhq/evolu/issues/782) would add one. See
    // https://www.electronjs.org/docs/latest/tutorial/security#20-do-not-expose-electron-apis-to-untrusted-web-content
    webPreferences: {
      // DevTools show the app's storage and console, so a packaged build
      // turns them off, which the default menu's shortcut can't open either.
      devTools: !app.isPackaged,
    },
  });

  if (VITE_DEV_SERVER_URL) win.webContents.openDevTools();

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
