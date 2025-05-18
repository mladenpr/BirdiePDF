import { type BrowserWindow } from 'electron';
import { registerWindowControlsIPC } from './windowControls.ipc';
import { registerWebContentsIPC } from './webContents.ipc';
import { registerDialogIPC } from './dialogs.ipc';
import { registerFileSystemIPC } from './fileSystem.ipc';

export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  // Hide the menu bar - this was in the original ipcEvents.ts
  mainWindow.setMenuBarVisibility(false);

  registerWindowControlsIPC(mainWindow);
  registerWebContentsIPC(mainWindow);
  registerDialogIPC(mainWindow);
  registerFileSystemIPC(); // mainWindow is not passed here as per its new definition
}; 