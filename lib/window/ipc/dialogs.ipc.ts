import { type BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'fs/promises'; // fs is needed here for dialog-save-as if we move the actual saving logic, but it's not for just showing dialog

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler);
};

export const registerDialogIPC = (mainWindow: BrowserWindow) => {
  handleIPC('dialog-open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open PDF',
      properties: ['openFile'],
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  // Note: The file writing part of dialog-save-as is better suited for fileSystem.ipc.ts
  // This dialogs.ipc.ts should ideally only handle showing the dialog and returning the path.
  // However, to match the original structure closely for now, I'll keep the fs part here but with a comment.
  handleIPC('dialog-save-as', async (_event, data: ArrayBuffer) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF As',
      defaultPath: 'document.pdf',
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    
    if (canceled || !filePath) return { success: false };
    
    // File writing logic - ideally in fileSystem.ipc.ts
    try {
      const buffer = Buffer.from(data);
      await fs.writeFile(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}; 