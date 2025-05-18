import { type BrowserWindow, ipcMain, shell } from 'electron';

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler);
};

export const registerWebContentsIPC = (mainWindow: BrowserWindow) => {
  const webContents = mainWindow.webContents;
  handleIPC('web-undo', () => webContents.undo());
  handleIPC('web-redo', () => webContents.redo());
  handleIPC('web-cut', () => webContents.cut());
  handleIPC('web-copy', () => webContents.copy());
  handleIPC('web-paste', () => webContents.paste());
  handleIPC('web-delete', () => webContents.delete());
  handleIPC('web-select-all', () => webContents.selectAll());
  handleIPC('web-reload', () => webContents.reload());
  handleIPC('web-force-reload', () => webContents.reloadIgnoringCache());
  handleIPC('web-toggle-devtools', () => webContents.toggleDevTools());
  handleIPC('web-actual-size', () => webContents.setZoomLevel(0));
  handleIPC('web-zoom-in', () => webContents.setZoomLevel(webContents.zoomLevel + 0.5));
  handleIPC('web-zoom-out', () => webContents.setZoomLevel(webContents.zoomLevel - 0.5));
  handleIPC('web-toggle-fullscreen', () => mainWindow.setFullScreen(!mainWindow.fullScreen));
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url));
}; 