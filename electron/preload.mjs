import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktopBridge', {
  isElectron: true,
  platform: process.platform,
});
