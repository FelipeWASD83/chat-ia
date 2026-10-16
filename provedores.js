// Modelos suportados, como cada um recebe o "raciocínio" e as chamadas de streaming
// para a OpenAI (fetch) e para a Anthropic (SDK oficial). Sem Electron aqui, para
// poder ser testado direto no Node.

const NIVEIS = {
  none: 'Desligado',
  minimal: 'Mínimo',
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Muito alto',
  max: 'Máximo',
};

const ESF_GPT6 = ['low', 'medium', 'high', 'xhigh', 'max'];
const ESF_GPT6_COM_NONE = ['none', ...ESF_GPT6];
const ESF_BASICO = ['low', 'medium', 'high'];
const ESF_GPT5 = ['minimal', 'low', 'medium', 'high'];
const ESF_CLAUDE = ['low', 'medium', 'high', 'xhigh', 'max'];
const ESF_CLAUDE_46 = ['low', 'medium', 'high', 'max'];
const ESF_ORCAMENTO = ['none', 'low', 'medium', 'high'];

// Orçamento de pensamento dos Claude antigos (Opus 4.5, Sonnet 4.5, Haiku 4.5).
const ORCAMENTO = { low: 4000, medium: 10000, high: 24000 };

function gpt(id, nome, esforcos, padrao, nota = '') {
  return { id, nome, provedor: 'openai', esforcos, padrao, nota };
}

// modo: 'sempre'  = o raciocínio não desliga, só o esforço muda (Fable, Opus 5.5)
//       'adaptativo' = adaptativo ou {disabled}
//       'entre'   = Sonnet 5.5: desliga com {between_tools}
//       'orcamento' = budget_tokens (modelos antigos)
function claude(id, nome, modo, esforcos, padrao, nota = '') {
  return { id, nome, provedor: 'anthropic', modo, esforcos, padrao, nota };
}

const MODELOS = [
  gpt('gpt-6-luna', 'GPT-6 Luna', ESF_GPT6_COM_NONE, 'medium', 'barato e rápido'),
  gpt('gpt-6.1-sol', 'GPT-6.1 Sol', ESF_GPT6, 'medium', 'forte'),
  gpt('gpt-6-sol', 'GPT-6 Sol', ESF_GPT6_COM_NONE, 'medium'),
  gpt('gpt-6-astra', 'GPT-6 Astra', ESF_GPT6, 'medium', 'topo da OpenAI, caro'),
  gpt('gpt-5.6-sol', 'GPT-5.6 Sol', ESF_BASICO, 'medium'),
  gpt('gpt-5.6-terra', 'GPT-5.6 Terra', ESF_BASICO, 'medium'),
  gpt('gpt-5.6-luna', 'GPT-5.6 Luna', ESF_BASICO, 'medium'),
  gpt('gpt-5.5', 'GPT-5.5', ESF_BASICO, 'medium'),
  gpt('gpt-5.4', 'GPT-5.4', ESF_BASICO, 'medium'),
  gpt('gpt-5.4-mini', 'GPT-5.4 mini', ESF_BASICO, 'medium'),
  gpt('gpt-5.4-nano', 'GPT-5.4 nano', ESF_BASICO, 'medium', 'desliga em 01/04/2027'),
  gpt('gpt-5.1', 'GPT-5.1', ESF_BASICO, 'medium', 'desliga em 01/04/2027'),
  gpt('gpt-5', 'GPT-5', ESF_GPT5, 'medium', 'desliga em 11/12/2026'),
  gpt('gpt-5-mini', 'GPT-5 mini', ESF_GPT5, 'medium', 'desliga em 11/12/2026'),
  gpt('gpt-5-nano', 'GPT-5 nano', ESF_GPT5, 'medium', 'desliga em 11/12/2026'),
  gpt('o3', 'o3', ESF_BASICO, 'medium', 'desliga em 11/12/2026'),
  gpt('o4-mini', 'o4-mini', ESF_BASICO, 'medium', 'desliga em 23/10/2026'),
  gpt('o3-mini', 'o3-mini', ESF_BASICO, 'medium', 'desliga em 23/10/2026'),
  gpt('o1', 'o1', ESF_BASICO, 'medium', 'desliga em 23/10/2026'),
  gpt('gpt-4.1', 'GPT-4.1', null, null, 'desliga em 14/01/2027'),
  gpt('gpt-4.1-mini', 'GPT-4.1 mini', null, null, 'desliga em 14/01/2027'),
  gpt('gpt-4.1-nano', 'GPT-4.1 nano', null, null, 'desliga em 23/10/2026'),
  gpt('gpt-4o', 'GPT-4o', null, null, 'desliga em 14/01/2027'),
  gpt('gpt-4o-mini', 'GPT-4o mini', null, null, 'desliga em 14/01/2027'),
  gpt('gpt-4-turbo', 'GPT-4 Turbo', null, null, 'desliga em 23/10/2026'),
  gpt('gpt-3.5-turbo', 'GPT-3.5 Turbo', null, null, 'desliga em 23/10/2026'),

  claude('claude-haiku-5-5', 'Claude Haiku 5.5', 'adaptativo', ['none', ...ESF_CLAUDE], 'medium', 'barato e rápido'),
  claude('claude-sonnet-5-5', 'Claude Sonnet 5.5', 'entre', ['none', ...ESF_CLAUDE], 'high', 'forte'),
  claude('claude-opus-5-5', 'Claude Opus 5.5', 'sempre', ESF_CLAUDE, 'medium', 'o mais inteligente do dia a dia'),
  claude('claude-fable-5-1', 'Claude Fable 5.1', 'sempre', ESF_CLAUDE, 'high', 'topo, caro'),
  claude('claude-fable-5', 'Claude Fable 5', 'sempre', ESF_CLAUDE, 'high'),
  claude('claude-opus-5', 'Claude Opus 5', 'adaptativo', ['none', ...ESF_CLAUDE], 'high'),
  claude('claude-opus-4-8', 'Claude Opus 4.8', 'adaptativo', ['none', ...ESF_CLAUDE], 'high'),
  claude('claude-opus-4-7', 'Claude Opus 4.7', 'adaptativo', ['none', ...ESF_CLAUDE], 'high'),
  claude('claude-opus-4-6', 'Claude Opus 4.6', 'adaptativo', ['none', ...ESF_CLAUDE_46], 'high'),
  claude('claude-sonnet-5', 'Claude Sonnet 5', 'adaptativo', ['none', ...ESF_CLAUDE], 'high'),
  claude('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'adaptativo', ['none', ...ESF_CLAUDE_46], 'high'),
  claude('claude-opus-4-5-20251101', 'Claude Opus 4.5', 'orcamento', ESF_ORCAMENTO, 'none'),
  claude('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 'orcamento', ESF_ORCAMENTO, 'none', 'desliga em 30/11/2026'),
  claude('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'orcamento', ESF_ORCAMENTO, 'none', 'pode sair do ar a qualquer momento'),
];

const PADRAO = { modelo: 'gpt-6-luna', esforco: 'medium' };

function achar(id) {
  return MODELOS.find((m) => m.id === id) || null;
}

// Esforço que vale para o modelo: o pedido, se o modelo aceita; senão o padrão dele.
function esforcoValido(modelo, esforco) {
  if (!modelo.esforcos) return null;
  return modelo.esforcos.includes(esforco) ? esforco : modelo.padrao;
}

function corpoOpenAI(modelo, mensagens, esforco) {
  const corpo = { model: modelo.id, messages: mensagens, stream: true };
  const e = esforcoValido(modelo, esforco);
  if (e) corpo.reasoning_effort = e;
  return corpo;
}

function parametrosClaude(modelo, mensagens, esforco) {
  const p = { model: modelo.id, max_tokens: 64000, messages: mensagens };
  const e = esforcoValido(modelo, esforco);
  switch (modelo.modo) {
    case 'sempre':
      p.output_config = { effort: e };
      break;
    case 'adaptativo':
      if (e === 'none') p.thinking = { type: 'disabled' };
      else {
        p.thinking = { type: 'adaptive' };
        p.output_config = { effort: e };
      }
      break;
    case 'entre':
      if (e === 'none') p.thinking = { type: 'between_tools' };
      else {
        p.thinking = { type: 'adaptive' };
        p.output_config = { effort: e };
      }
      break;
    case 'orcamento':
      if (e !== 'none') p.thinking = { type: 'enabled', budget_tokens: ORCAMENTO[e] };
      break;
  }
  return p;
}

function mensagemDeErro(status, texto) {
  try {
    const j = JSON.parse(texto);
    const m = (j.error && j.error.message) || j.message;
    if (m) return `${status}: ${m}`;
  } catch { /* corpo não é JSON */ }
  return `${status}: ${String(texto).slice(0, 300) || 'sem detalhe'}`;
}

// Lê um corpo SSE e chama aoEvento(objetoJson) em cada "data:". Para no [DONE].
async function lerSSE(resposta, aoEvento) {
  const leitor = resposta.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    let i;
    while ((i = resto.search(/\r?\n/)) !== -1) {
      const linha = resto.slice(0, i);
      resto = resto.slice(i + (resto[i] === '\r' ? 2 : 1));
      if (!linha.startsWith('data:')) continue;
      const dado = linha.slice(5).trim();
      if (dado === '[DONE]') return;
      if (dado) aoEvento(JSON.parse(dado));
    }
  }
}

async function conversarOpenAI({ chave, modelo, mensagens, esforco, sinal, aoTexto, baseUrl }) {
  const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpoOpenAI(modelo, mensagens, esforco)),
    signal: sinal,
  });
  if (!resposta.ok) throw new Error(mensagemDeErro(resposta.status, await resposta.text()));
  let aviso = '';
  await lerSSE(resposta, (ev) => {
    const escolha = ev.choices && ev.choices[0];
    if (!escolha) return;
    const d = escolha.delta || {};
    if (d.content) aoTexto(d.content);
    if (d.refusal) aoTexto(d.refusal);
    if (escolha.finish_reason === 'length') aviso = 'A resposta foi cortada no limite de tamanho.';
    if (escolha.finish_reason === 'content_filter') aviso = 'A resposta foi bloqueada pelo filtro de conteúdo.';
  });
  return { aviso };
}

async function conversarClaude({ chave, modelo, mensagens, esforco, sinal, aoTexto, baseUrl }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const cliente = new (Anthropic.default || Anthropic)({ apiKey: chave, baseURL: baseUrl || undefined });
  const fluxo = cliente.messages.stream(parametrosClaude(modelo, mensagens, esforco), { signal: sinal });
  fluxo.on('text', aoTexto);
  let final;
  try {
    final = await fluxo.finalMessage();
  } catch (e) {
    if (e && e.status) throw new Error(`${e.status}: ${e.message}`);
    throw e;
  }
  let aviso = '';
  if (final.stop_reason === 'max_tokens') aviso = 'A resposta foi cortada no limite de tamanho.';
  if (final.stop_reason === 'refusal') aviso = 'O Claude recusou este pedido.';
  return { aviso };
}

function conversar(args) {
  return args.modelo.provedor === 'openai' ? conversarOpenAI(args) : conversarClaude(args);
}

module.exports = {
  NIVEIS, MODELOS, PADRAO, achar, esforcoValido,
  corpoOpenAI, parametrosClaude, mensagemDeErro, lerSSE, conversar,
};
