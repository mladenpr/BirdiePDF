import { type BrowserWindow, ipcMain } from 'electron';
import os from 'os';

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler);
};

export const registerWindowControlsIPC = (mainWindow: BrowserWindow) => {
  handleIPC('init-window', () => {
    const { width, height } = mainWindow.getBounds();
    const minimizable = mainWindow.isMinimizable();
    const maximizable = mainWindow.isMaximizable();
    const platform = os.platform();
    return { width, height, minimizable, maximizable, platform };
  });

  handleIPC('is-window-minimizable', () => mainWindow.isMinimizable());
  handleIPC('is-window-maximizable', () => mainWindow.isMaximizable());
  handleIPC('window-minimize', () => mainWindow.minimize());
  handleIPC('window-maximize', () => mainWindow.maximize());
  handleIPC('window-close', () => mainWindow.close());
  handleIPC('window-maximize-toggle', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
}; 