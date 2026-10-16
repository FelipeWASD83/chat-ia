const test = require('node:test');
const assert = require('node:assert');
const P = require('../provedores');
const falso = require('./servidor-falso');

test('lista de modelos: ids únicos e padrão dentro dos esforços', () => {
  const ids = new Set();
  for (const m of P.MODELOS) {
    assert.ok(!ids.has(m.id), `id repetido: ${m.id}`);
    ids.add(m.id);
    if (m.esforcos) assert.ok(m.esforcos.includes(m.padrao), `${m.id}: padrão fora da lista`);
    else assert.strictEqual(m.padrao, null);
  }
  assert.ok(P.achar(P.PADRAO.modelo));
  assert.ok(P.achar('gpt-3.5-turbo'), 'o 3.5 foi pedido');
});

test('OpenAI: manda o esforço só em modelo que raciocina', () => {
  const luna = P.achar('gpt-6-luna');
  assert.strictEqual(P.corpoOpenAI(luna, [], 'none').reasoning_effort, 'none');
  assert.strictEqual(P.corpoOpenAI(luna, [], 'xhigh').reasoning_effort, 'xhigh');
  // esforço que o modelo não aceita volta para o padrão dele
  assert.strictEqual(P.corpoOpenAI(P.achar('gpt-6.1-sol'), [], 'none').reasoning_effort, 'medium');
  const antigo = P.corpoOpenAI(P.achar('gpt-3.5-turbo'), [{ role: 'user', content: 'oi' }], 'high');
  assert.ok(!('reasoning_effort' in antigo));
  assert.strictEqual(antigo.stream, true);
});

test('Claude: cada modelo recebe o raciocínio no formato que a API aceita', () => {
  const msgs = [{ role: 'user', content: 'oi' }];
  const opus55 = P.parametrosClaude(P.achar('claude-opus-5-5'), msgs, 'none');
  assert.ok(!('thinking' in opus55), 'Opus 5.5 nunca recebe thinking (400)');
  assert.strictEqual(opus55.output_config.effort, 'medium', 'none não existe no Opus 5.5: volta ao padrão');

  const fable = P.parametrosClaude(P.achar('claude-fable-5-1'), msgs, 'max');
  assert.ok(!('thinking' in fable));
  assert.strictEqual(fable.output_config.effort, 'max');

  const sonnetOff = P.parametrosClaude(P.achar('claude-sonnet-5-5'), msgs, 'none');
  assert.deepStrictEqual(sonnetOff.thinking, { type: 'between_tools' });
  assert.ok(!('output_config' in sonnetOff), 'between_tools não aceita effort alto');
  const sonnetOn = P.parametrosClaude(P.achar('claude-sonnet-5-5'), msgs, 'xhigh');
  assert.deepStrictEqual(sonnetOn.thinking, { type: 'adaptive' });

  const haikuOff = P.parametrosClaude(P.achar('claude-haiku-5-5'), msgs, 'none');
  assert.deepStrictEqual(haikuOff.thinking, { type: 'disabled' });

  const antigoOff = P.parametrosClaude(P.achar('claude-haiku-4-5-20251001'), msgs, 'none');
  assert.ok(!('thinking' in antigoOff) && !('output_config' in antigoOff));
  const antigoOn = P.parametrosClaude(P.achar('claude-sonnet-4-5-20250929'), msgs, 'high');
  assert.deepStrictEqual(antigoOn.thinking, { type: 'enabled', budget_tokens: 24000 });
  assert.ok(antigoOn.thinking.budget_tokens < antigoOn.max_tokens);
});

test('Claude: nunca manda parâmetros que dão 400 nos modelos novos', () => {
  for (const m of P.MODELOS.filter((x) => x.provedor === 'anthropic')) {
    for (const e of m.esforcos) {
      const p = P.parametrosClaude(m, [{ role: 'user', content: 'oi' }], e);
      for (const proibido of ['temperature', 'top_p', 'top_k', 'tool_choice']) {
        assert.ok(!(proibido in p), `${m.id}/${e}: ${proibido}`);
      }
      assert.strictEqual(p.messages.at(-1).role, 'user', 'sem prefill');
      if (m.modo !== 'orcamento') assert.ok(!p.thinking || p.thinking.type !== 'enabled', `${m.id}: budget_tokens é 400`);
    }
  }
});

test('mensagem de erro lê o JSON da API', () => {
  assert.strictEqual(P.mensagemDeErro(401, '{"error":{"message":"chave errada"}}'), '401: chave errada');
  assert.strictEqual(P.mensagemDeErro(500, 'texto solto'), '500: texto solto');
});

test('SSE: junta linha cortada no meio entre dois pedaços', async () => {
  const partes = ['data: {"a":1}\n\ndata: {"a"', ':2}\r\n\r\ndata: [DONE]\n\ndata: {"a":3}\n\n'];
  const resposta = new Response(new ReadableStream({
    start(c) { for (const p of partes) c.enqueue(new TextEncoder().encode(p)); c.close(); },
  }));
  const lidos = [];
  await P.lerSSE(resposta, (ev) => lidos.push(ev.a));
  assert.deepStrictEqual(lidos, [1, 2], 'para no [DONE]');
});

test('OpenAI e Claude de ponta a ponta contra o servidor falso', async () => {
  const s = await falso.criar();
  try {
    const msgs = [{ role: 'user', content: 'oi' }];
    for (const [id, chave] of [['gpt-6-luna', 'sk-falsa'], ['claude-haiku-5-5', 'sk-ant-falsa']]) {
      const modelo = P.achar(id);
      let texto = '';
      await P.conversar({ chave, modelo, mensagens: msgs, esforco: 'low', baseUrl: s.url, aoTexto: (t) => (texto += t) });
      assert.strictEqual(texto, 'Olá, isto é um teste.', id);
    }
    const o = s.pedidos.find((p) => p.rota.startsWith('/v1/chat/completions'));
    assert.strictEqual(o.cabecalhos.authorization, 'Bearer sk-falsa');
    assert.strictEqual(o.corpo.reasoning_effort, 'low');
    const c = s.pedidos.find((p) => p.rota.startsWith('/v1/messages'));
    assert.strictEqual(c.cabecalhos['x-api-key'], 'sk-ant-falsa');
    assert.deepStrictEqual(c.corpo.thinking, { type: 'adaptive' });
    assert.deepStrictEqual(c.corpo.output_config, { effort: 'low' });
    assert.strictEqual(c.corpo.stream, true);
  } finally {
    await s.fechar();
  }
});

test('erros da API chegam legíveis nos dois lados', async () => {
  const s = await falso.criar();
  try {
    const msgs = [{ role: 'user', content: 'DAR-ERRO' }];
    await assert.rejects(
      P.conversar({ chave: 'x', modelo: P.achar('gpt-4o'), mensagens: msgs, baseUrl: s.url, aoTexto() {} }),
      /401: Incorrect API key/,
    );
    await assert.rejects(
      P.conversar({ chave: 'x', modelo: P.achar('claude-opus-5-5'), mensagens: msgs, baseUrl: s.url, aoTexto() {} }),
      /401: .*invalid x-api-key/,
    );
  } finally {
    await s.fechar();
  }
});
