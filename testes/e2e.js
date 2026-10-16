// Teste de ponta a ponta: abre o app de verdade (Electron), conversa com o servidor
// falso pelo protocolo de depuração do Chromium e confere a tela.
// Uso: node testes/e2e.js [pasta-para-prints]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert');
const falso = require('./servidor-falso');

const PORTA = 9339;
const raiz = path.join(__dirname, '..');
const pastaPrints = process.argv[2] || null;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-ia-teste-'));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(fn, descricao, limite = 10000) {
  const inicio = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* ainda não */ }
    if (Date.now() - inicio > limite) throw new Error(`Tempo esgotado: ${descricao}`);
    await esperar(100);
  }
}

async function conectar() {
  const alvo = await ate(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json();
    return lista.find((t) => t.type === 'page' && t.url.includes('index.html'));
  }, 'janela do app');
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let n = 0;
  const pend = new Map();
  const erros = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const { r, j } = pend.get(d.id);
      pend.delete(d.id);
      d.error ? j(new Error(d.error.message)) : r(d.result);
    } else if (d.method === 'Runtime.exceptionThrown') {
      erros.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
    } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      erros.push('console.error: ' + d.params.args.map((a) => a.value || a.description).join(' '));
    } else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
      erros.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    }
  };
  const cmd = (method, params = {}) => new Promise((r, j) => {
    const id = ++n;
    pend.set(id, { r, j });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await cmd('Runtime.enable');
  await cmd('Log.enable');
  const ev = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { cmd, ev, erros, fechar: () => ws.close() };
}

async function main() {
  const s = await falso.criar();
  const eletron = require('electron');
  const proc = spawn(eletron, ['.', `--remote-debugging-port=${PORTA}`], {
    cwd: raiz,
    env: { ...process.env, CHAT_IA_DADOS: dados, CHAT_IA_OPENAI_URL: s.url, CHAT_IA_ANTHROPIC_URL: s.url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  proc.stdout.on('data', (d) => (saida += d));
  proc.stderr.on('data', (d) => (saida += d));

  let ok = false;
  try {
    const p = await conectar();
    const { ev, cmd } = p;
    const clicar = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const texto = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).innerText`);
    const todas = () => ev(`[...document.querySelectorAll('.msg')].map(m => m.className + ' | ' + m.innerText.replace(/\\n/g,' / '))`);
    const enviar = (t) => ev(`(() => { const x = document.getElementById('texto'); x.value = ${JSON.stringify(t)}; x.dispatchEvent(new Event('input')); x.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); })()`);
    const print = async (nome, largura, altura) => {
      if (!pastaPrints) return;
      await cmd('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
      await esperar(250);
      const r = await cmd('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(pastaPrints, { recursive: true });
      fs.writeFileSync(path.join(pastaPrints, `${nome}.png`), Buffer.from(r.data, 'base64'));
      await cmd('Emulation.clearDeviceMetricsOverride');
    };

    await ate(() => ev(`document.getElementById('modeloRotulo').textContent.length > 0`), 'rótulo do modelo');
    console.log('1. abriu; rótulo:', await texto('#modeloRotulo'));
    assert.strictEqual(await ev(`!document.getElementById('vazioAviso').hidden`), true, 'avisa que falta chave');

    // sem chave: erro claro e texto devolvido ao campo
    await enviar('oi sem chave');
    await ate(async () => (await todas()).some((l) => l.startsWith('msg ia erro')), 'erro sem chave');
    assert.match((await todas()).find((l) => l.includes('erro')), /Falta a chave da OpenAI/);
    assert.strictEqual(await ev(`document.getElementById('texto').value`), 'oi sem chave');
    console.log('2. sem chave: erro claro e texto devolvido ao campo');
    await clicar('#nova');

    // configurações: salvar as duas chaves
    await clicar('#abrirConfig');
    await ev(`document.getElementById('chaveOpenai').value = 'sk-teste-openai-123'; document.getElementById('chaveAnthropic').value = 'sk-ant-teste-456'`);
    await print('config-claro', 1100, 820);
    await clicar('#salvarConfig');
    await ate(() => ev(`document.getElementById('fundoConfig').hidden`), 'fechar config');
    const cfg = fs.readFileSync(path.join(dados, 'config.json'), 'utf8');
    assert.ok(!cfg.includes('sk-teste-openai-123') && !cfg.includes('sk-ant-teste-456'), 'chave não pode estar em texto puro');
    assert.ok(JSON.parse(cfg).chaves.openai && JSON.parse(cfg).chaves.anthropic);
    console.log('3. chaves salvas e cifradas no disco');

    // GPT
    await enviar('Oi GPT');
    await ate(async () => (await todas()).some((l) => l.includes('Olá, isto é um teste.')), 'resposta do GPT');
    let linhas = await todas();
    assert.ok(linhas[0].startsWith('msg usuario') && linhas[1].includes('GPT-6 Luna'));
    const pedGpt = s.pedidos.filter((q) => q.rota.startsWith('/v1/chat/completions')).at(-1);
    assert.strictEqual(pedGpt.cabecalhos.authorization, 'Bearer sk-teste-openai-123');
    assert.strictEqual(pedGpt.corpo.model, 'gpt-6-luna');
    assert.strictEqual(pedGpt.corpo.reasoning_effort, 'medium');
    console.log('4. GPT respondeu em streaming:', linhas[1]);

    // balão: trocar para Claude Haiku e raciocínio Alto
    await clicar('#modeloBtn');
    assert.strictEqual(await ev(`!document.getElementById('balao').hidden`), true);
    const nomes = await ev(`[...document.querySelectorAll('.item-modelo .nome')].map(n => n.textContent)`);
    assert.ok(nomes.includes('GPT-3.5 Turbo') && nomes.includes('Claude Opus 5.5') && nomes.includes('GPT-6.1 Sol'));
    console.log('5. balão abriu com', nomes.length, 'modelos');
    await print('balao-claro', 1100, 820);
    await ev(`[...document.querySelectorAll('.item-modelo')].find(b => b.querySelector('.nome').textContent === 'Claude Haiku 5.5').click()`);
    await ev(`[...document.querySelectorAll('.chip')].find(b => b.textContent === 'Alto').click()`);
    await ate(async () => (await texto('#modeloRotulo')) === 'Claude Haiku 5.5 · Alto', 'rótulo do Claude');
    // modelo sem raciocínio
    await ev(`[...document.querySelectorAll('.item-modelo')].find(b => b.querySelector('.nome').textContent === 'GPT-3.5 Turbo').click()`);
    assert.strictEqual(await ev(`document.querySelectorAll('.chip').length`), 0);
    assert.match(await texto('#dicaEsforco'), /não tem modo de raciocínio/);
    assert.strictEqual(await texto('#modeloRotulo'), 'GPT-3.5 Turbo');
    await ev(`[...document.querySelectorAll('.item-modelo')].find(b => b.querySelector('.nome').textContent === 'Claude Haiku 5.5').click()`);
    await ate(async () => (await texto('#modeloRotulo')) === 'Claude Haiku 5.5 · Alto', 'volta ao Claude (o Alto foi lembrado)');
    await clicar('#nova');
    await enviar('Oi Claude');
    await ate(async () => (await todas()).some((l) => l.startsWith('msg ia') && l.includes('Claude Haiku 5.5') && l.includes('Olá')), 'resposta do Claude');
    const pedC = s.pedidos.filter((q) => q.rota.startsWith('/v1/messages')).at(-1);
    assert.strictEqual(pedC.cabecalhos['x-api-key'], 'sk-ant-teste-456');
    assert.deepStrictEqual(pedC.corpo.output_config, { effort: 'high' });
    assert.strictEqual(pedC.corpo.messages.length, 1, 'Nova conversa limpou o histórico');
    console.log('6. Claude respondeu com esforço alto; Nova conversa limpou o histórico');

    // histórico continua entre mensagens
    await ate(() => ev(`document.getElementById('iconeParar').hidden`), 'fim da resposta anterior');
    await enviar('segunda pergunta');
    await ate(async () => s.pedidos.filter((q) => q.rota.startsWith('/v1/messages')).length >= 2, 'segundo pedido');
    const ped2 = s.pedidos.filter((q) => q.rota.startsWith('/v1/messages')).at(-1);
    assert.deepStrictEqual(ped2.corpo.messages.map((m) => m.role), ['user', 'assistant', 'user']);
    await ate(() => ev(`document.getElementById('iconeParar').hidden`), 'fim da resposta');
    console.log('7. a conversa leva o histórico junto');

    // erro da API
    await ate(() => ev(`document.getElementById('iconeParar').hidden`), 'fim da resposta');
    await enviar('DAR-ERRO');
    await ate(async () => (await todas()).some((l) => l.includes('invalid x-api-key')), 'erro do Claude');
    assert.strictEqual(await ev(`document.getElementById('texto').value`), 'DAR-ERRO');
    console.log('8. erro da API aparece e o texto volta ao campo');
    await clicar('#nova');

    // parar no meio
    await enviar('DEVAGAR');
    await ate(async () => (await todas()).some((l) => l.includes('um dois')), 'pedaços chegando');
    assert.strictEqual(await ev(`document.getElementById('iconeParar').hidden`), false, 'botão virou parar');
    await clicar('#enviar');
    await ate(async () => (await todas()).some((l) => l.includes('Parado.')), 'parou');
    assert.ok((await todas()).some((l) => l.includes('um ')), 'o pedaço que chegou fica');
    console.log('9. parou no meio e manteve o que já tinha chegado');

    // tema
    await print('chat-claro', 1100, 820);
    await clicar('#abrirConfig');
    await clicar('#temaEscuro');
    await ate(() => ev(`matchMedia('(prefers-color-scheme: dark)').matches`), 'tema escuro');
    await print('config-escuro', 1100, 820);
    await clicar('#fecharConfig');
    await clicar('#modeloBtn');
    await print('balao-escuro', 1100, 820);
    await clicar('#modeloBtn');
    await print('chat-escuro', 1100, 820);
    await print('ultrawide-escuro', 3440, 1400);
    await print('pe-escuro', 1080, 1850);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dados, 'config.json'), 'utf8')).tema, 'dark');
    assert.strictEqual(await ev(`document.getElementById('iconeEnviar').getBoundingClientRect().width > 0 && document.getElementById('iconeParar').getBoundingClientRect().width === 0`), true, 'só um ícone no botão de enviar');
    await clicar('#abrirConfig');
    await clicar('#temaClaro');
    await ate(async () => !(await ev(`matchMedia('(prefers-color-scheme: dark)').matches`)), 'tema claro');
    await clicar('#fecharConfig');
    await print('chat-claro-real', 1100, 820);
    await clicar('#modeloBtn');
    await print('balao-claro-real', 1100, 820);
    await clicar('#modeloBtn');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dados, 'config.json'), 'utf8')).tema, 'light');
    console.log('10. os dois temas aplicam e gravam');

    assert.deepStrictEqual(p.erros, [], 'erros no console: ' + p.erros.join(' || '));
    console.log('11. console sem erros');
    p.fechar();
    ok = true;
  } finally {
    const saiu = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await Promise.race([saiu, esperar(5000)]);
    await s.fechar();
    try { fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Windows ainda segurando a pasta */ }
    if (!ok) console.log('--- saída do Electron ---\n' + saida);
  }
}

main().then(() => { console.log('E2E OK'); process.exit(0); }, (e) => { console.error('E2E FALHOU:', e.message); process.exit(1); });
