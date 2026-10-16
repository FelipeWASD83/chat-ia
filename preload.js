const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  estado: () => ipcRenderer.invoke('estado'),
  salvarConfig: (pedido) => ipcRenderer.invoke('salvar-config', pedido),
  enviar: (pedido) => ipcRenderer.invoke('enviar', pedido),
  parar: (id) => ipcRenderer.invoke('parar', id),
  aoReceberTexto: (fn) => ipcRenderer.on('delta', (_e, dado) => fn(dado)),
});
