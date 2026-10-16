const { app, BrowserWindow, Menu, ipcMain, nativeTheme, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const P = require('./provedores');

// Só para os testes: pasta de dados temporária e servidores falsos no lugar das APIs.
if (process.env.CHAT_IA_DADOS) app.setPath('userData', process.env.CHAT_IA_DADOS);

let arquivoConfig;
let config = { tema: null, chaves: {}, modelo: P.PADRAO.modelo, esforco: P.PADRAO.esforco };
const emAndamento = new Map();

function carregarConfig() {
  arquivoConfig = path.join(app.getPath('userData'), 'config.json');
  try {
    const lido = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'));
    config = { ...config, ...lido, chaves: { ...(lido.chaves || {}) } };
  } catch { /* primeira execução */ }
  if (config.tema === 'dark' || config.tema === 'light') nativeTheme.themeSource = config.tema;
}

function gravarConfig() {
  fs.mkdirSync(path.dirname(arquivoConfig), { recursive: true });
  fs.writeFileSync(arquivoConfig, JSON.stringify(config, null, 2));
}

// As chaves ficam cifradas pelo Windows (DPAPI, via safeStorage), nunca em texto puro.
function guardarChave(provedor, texto) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O Windows não liberou a cifragem de chaves neste usuário. A chave não foi salva.');
  }
  config.chaves[provedor] = safeStorage.encryptString(texto).toString('base64');
}

function lerChave(provedor) {
  const gravada = config.chaves[provedor];
  if (!gravada) return null;
  try {
    return safeStorage.decryptString(Buffer.from(gravada, 'base64'));
  } catch {
    return null;
  }
}

function estado() {
  return {
    modelos: P.MODELOS,
    niveis: P.NIVEIS,
    config: {
      modelo: config.modelo,
      esforco: config.esforco,
      chaves: { openai: !!config.chaves.openai, anthropic: !!config.chaves.anthropic },
    },
    escuro: nativeTheme.shouldUseDarkColors,
  };
}

ipcMain.handle('estado', () => estado());

ipcMain.handle('salvar-config', (_e, pedido) => {
  if (pedido.tema === 'dark' || pedido.tema === 'light') {
    config.tema = pedido.tema;
    nativeTheme.themeSource = pedido.tema;
  }
  if (pedido.chaves) {
    for (const prov of ['openai', 'anthropic']) {
      const valor = pedido.chaves[prov];
      if (valor === undefined) continue;
      if (valor === null) {
        delete config.chaves[prov];
        continue;
      }
      const limpo = String(valor).trim();
      if (!/^[\x21-\x7e]+$/.test(limpo)) {
        throw new Error('A chave tem espaço ou caractere inválido no meio. Cole de novo.');
      }
      guardarChave(prov, limpo);
    }
  }
  if (P.achar(pedido.modelo)) config.modelo = pedido.modelo;
  if (pedido.esforco) config.esforco = pedido.esforco;
  gravarConfig();
  return estado();
});

ipcMain.handle('enviar', async (evento, { id, modeloId, esforco, mensagens }) => {
  const modelo = P.achar(modeloId);
  if (!modelo) return { erro: `Modelo desconhecido: ${modeloId}` };
  const chave = lerChave(modelo.provedor);
  if (!chave) {
    const nome = modelo.provedor === 'openai' ? 'da OpenAI (GPT)' : 'da Anthropic (Claude)';
    return { erro: `Falta a chave ${nome}. Abra as configurações (engrenagem) e cole ela.` };
  }
  const controle = new AbortController();
  emAndamento.set(id, controle);
  try {
    const baseUrl = modelo.provedor === 'openai' ? process.env.CHAT_IA_OPENAI_URL : process.env.CHAT_IA_ANTHROPIC_URL;
    const { aviso } = await P.conversar({
      chave, modelo, mensagens, esforco, baseUrl,
      sinal: controle.signal,
      aoTexto: (texto) => evento.sender.send('delta', { id, texto }),
    });
    return { ok: true, aviso };
  } catch (e) {
    if (controle.signal.aborted) return { ok: true, parado: true };
    return { erro: e && e.message ? e.message : String(e) };
  } finally {
    emAndamento.delete(id);
  }
});

ipcMain.handle('parar', (_e, id) => {
  const c = emAndamento.get(id);
  if (c) c.abort();
});

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 560,
    minHeight: 460,
    title: 'Chat IA',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181c' : '#f5f2ec',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  janela.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  carregarConfig();
  criarJanela();
});

app.on('window-all-closed', () => app.quit());
