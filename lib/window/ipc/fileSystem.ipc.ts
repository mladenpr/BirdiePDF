import { ipcMain } from 'electron';
import fs from 'fs/promises';

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler);
};

export const registerFileSystemIPC = () => { // mainWindow might not be needed if these are pure fs operations
  handleIPC('save-pdf-file', async (_event, { filePath, data }: { filePath: string, data: ArrayBuffer }) => {
    try {
      const buffer = Buffer.from(data);
      await fs.writeFile(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  handleIPC('read-pdf-file', async (_event, filePath: string) => {
    try {
      const data = await fs.readFile(filePath);
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}; 