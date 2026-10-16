// Servidor que imita o formato de streaming da OpenAI e da Anthropic, só para os testes.
// Nenhuma chave de verdade é usada em lugar nenhum.
const http = require('http');

function criar() {
  const pedidos = []; // {rota, cabecalhos, corpo}

  const servidor = http.createServer((req, res) => {
    let bruto = '';
    req.on('data', (c) => (bruto += c));
    req.on('end', () => {
      const corpo = bruto ? JSON.parse(bruto) : {};
      pedidos.push({ rota: req.url, cabecalhos: req.headers, corpo });
      const ultima = corpo.messages && corpo.messages[corpo.messages.length - 1];
      const fala = ultima && typeof ultima.content === 'string' ? ultima.content : '';
      const openai = req.url.startsWith('/v1/chat/completions');

      if (fala.includes('DAR-ERRO')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(openai
          ? { error: { message: 'Incorrect API key provided: sk-falsa', type: 'invalid_request_error' } }
          : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
        return;
      }

      const lento = fala.includes('DEVAGAR');
      const pedacos = lento ? ['um ', 'dois ', 'tres ', 'quatro ', 'cinco ', 'seis ', 'sete ', 'oito '] : ['Olá, ', 'isto é ', 'um teste.'];
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const escrever = (nome, dado) => res.write((nome ? `event: ${nome}\n` : '') + `data: ${JSON.stringify(dado)}\n\n`);

      let i = 0;
      const passo = () => {
        if (res.destroyed) return;
        if (openai) {
          if (i === 0) escrever(null, { choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] });
          if (i < pedacos.length) {
            escrever(null, { choices: [{ index: 0, delta: { content: pedacos[i] } }] });
          } else {
            escrever(null, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        } else {
          if (i === 0) {
            escrever('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: corpo.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } });
            escrever('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
          }
          if (i < pedacos.length) {
            escrever('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: pedacos[i] } });
          } else {
            escrever('content_block_stop', { type: 'content_block_stop', index: 0 });
            escrever('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } });
            escrever('message_stop', { type: 'message_stop' });
            res.end();
            return;
          }
        }
        i += 1;
        setTimeout(passo, lento ? 400 : 10);
      };
      passo();
    });
  });

  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => {
      resolver({
        url: `http://127.0.0.1:${servidor.address().port}`,
        pedidos,
        fechar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
      });
    });
  });
}

module.exports = { criar };

// Para subir na mão: node testes/servidor-falso.js
if (require.main === module) {
  criar().then((s) => console.log(s.url));
}
