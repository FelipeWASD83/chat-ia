(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    conversa: $('conversa'), mensagens: $('mensagens'), vazio: $('vazio'), vazioAviso: $('vazioAviso'),
    texto: $('texto'), enviar: $('enviar'), iconeEnviar: $('iconeEnviar'), iconeParar: $('iconeParar'),
    modeloBtn: $('modeloBtn'), modeloRotulo: $('modeloRotulo'), balao: $('balao'),
    listaModelos: $('listaModelos'), listaEsforcos: $('listaEsforcos'), dicaEsforco: $('dicaEsforco'),
    nova: $('nova'), abrirConfig: $('abrirConfig'), fundoConfig: $('fundoConfig'),
    temaClaro: $('temaClaro'), temaEscuro: $('temaEscuro'),
    chaveOpenai: $('chaveOpenai'), chaveAnthropic: $('chaveAnthropic'),
    estadoOpenai: $('estadoOpenai'), estadoAnthropic: $('estadoAnthropic'),
    removerOpenai: $('removerOpenai'), removerAnthropic: $('removerAnthropic'),
    erroConfig: $('erroConfig'), fecharConfig: $('fecharConfig'), salvarConfig: $('salvarConfig'),
  };

  let st = null; // modelos, níveis, config
  let historico = []; // [{role, content}]
  let atual = null; // resposta em andamento: {id, caixa, corpo, texto}
  let contador = 0;

  const modeloAtual = () => st.modelos.find((m) => m.id === st.config.modelo);
  const temChave = (m) => st.config.chaves[m.provedor];

  function limparErroIpc(e) {
    return String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }

  // ---------- modelo e raciocínio ----------
  function esforcoDoModelo(m) {
    if (!m.esforcos) return null;
    return m.esforcos.includes(st.config.esforco) ? st.config.esforco : m.padrao;
  }

  function atualizarRotulo() {
    const m = modeloAtual();
    const e = esforcoDoModelo(m);
    el.modeloRotulo.textContent = e ? `${m.nome} · ${st.niveis[e]}` : m.nome;
  }

  function desenharBalao() {
    const m = modeloAtual();
    el.listaModelos.textContent = '';
    for (const [prov, titulo] of [['openai', 'OpenAI'], ['anthropic', 'Anthropic']]) {
      const cab = document.createElement('div');
      cab.className = 'grupo-modelos';
      cab.textContent = titulo;
      el.listaModelos.appendChild(cab);
      for (const md of st.modelos.filter((x) => x.provedor === prov)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'item-modelo';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(md.id === m.id));
        const nome = document.createElement('span');
        nome.className = 'nome';
        nome.textContent = md.nome;
        b.appendChild(nome);
        const nota = document.createElement('span');
        nota.className = 'nota';
        nota.textContent = [md.nota, temChave(md) ? '' : 'sem chave'].filter(Boolean).join(' · ');
        if (!temChave(md)) nota.classList.add('sem-chave');
        if (nota.textContent) b.appendChild(nota);
        b.addEventListener('click', () => escolherModelo(md));
        el.listaModelos.appendChild(b);
      }
    }
    el.listaEsforcos.textContent = '';
    if (!m.esforcos) {
      el.dicaEsforco.textContent = 'Este modelo não tem modo de raciocínio.';
    } else {
      const atualE = esforcoDoModelo(m);
      for (const e of m.esforcos) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip';
        c.setAttribute('role', 'radio');
        c.setAttribute('aria-checked', String(e === atualE));
        c.textContent = st.niveis[e];
        c.addEventListener('click', () => escolherEsforco(e));
        el.listaEsforcos.appendChild(c);
      }
      el.dicaEsforco.textContent = m.modo === 'sempre'
        ? 'Neste modelo o raciocínio não desliga, só muda a intensidade.'
        : 'Mais raciocínio demora mais e gasta mais.';
    }
  }

  async function salvarEscolha(modelo, esforco) {
    st = await window.api.salvarConfig({ modelo, esforco });
    atualizarRotulo();
    desenharBalao();
  }

  function escolherModelo(md) {
    const e = md.esforcos ? (md.esforcos.includes(st.config.esforco) ? st.config.esforco : md.padrao) : st.config.esforco;
    salvarEscolha(md.id, e);
  }

  function escolherEsforco(e) {
    salvarEscolha(st.config.modelo, e);
  }

  function abrirBalao(abrir) {
    el.balao.hidden = !abrir;
    el.modeloBtn.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      desenharBalao();
      const marcado = el.listaModelos.querySelector('[aria-checked="true"]');
      if (marcado) marcado.scrollIntoView({ block: 'nearest' });
    }
  }

  el.modeloBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    abrirBalao(el.balao.hidden);
  });
  document.addEventListener('click', (ev) => {
    if (!el.balao.hidden && !el.balao.contains(ev.target)) abrirBalao(false);
  });

  // ---------- mensagens ----------
  function perto() {
    return el.conversa.scrollHeight - el.conversa.scrollTop - el.conversa.clientHeight < 80;
  }
  function rolar() {
    el.conversa.scrollTop = el.conversa.scrollHeight;
  }

  function criarMsg(classe, texto, quem) {
    el.vazio.hidden = true;
    const caixa = document.createElement('div');
    caixa.className = `msg ${classe}`;
    if (quem) {
      const q = document.createElement('div');
      q.className = 'quem';
      q.textContent = quem;
      caixa.appendChild(q);
    }
    const corpo = document.createElement('div');
    corpo.className = 'corpo';
    corpo.textContent = texto;
    caixa.appendChild(corpo);
    el.mensagens.appendChild(caixa);
    rolar();
    return { caixa, corpo };
  }

  function definirOcupado(ocupado) {
    el.iconeEnviar.hidden = ocupado;
    el.iconeParar.hidden = !ocupado;
    el.enviar.setAttribute('aria-label', ocupado ? 'Parar resposta' : 'Enviar mensagem');
    el.enviar.title = ocupado ? 'Parar' : 'Enviar (Enter)';
  }

  function ajustarAltura() {
    el.texto.style.height = 'auto';
    el.texto.style.height = `${el.texto.scrollHeight}px`;
  }

  window.api.aoReceberTexto(({ id, texto }) => {
    if (!atual || atual.id !== id) return;
    const seguir = perto();
    atual.texto += texto;
    atual.corpo.textContent = atual.texto;
    atual.corpo.classList.remove('pensando');
    if (seguir) rolar();
  });

  async function enviar() {
    if (atual) return;
    const conteudo = el.texto.value.trim();
    if (!conteudo) return;
    const m = modeloAtual();
    abrirBalao(false);

    criarMsg('usuario', conteudo);
    historico.push({ role: 'user', content: conteudo });
    el.texto.value = '';
    ajustarAltura();

    const id = `r${++contador}`;
    const { caixa, corpo } = criarMsg('ia', 'Pensando…', m.nome);
    corpo.classList.add('pensando');
    atual = { id, caixa, corpo, texto: '' };
    definirOcupado(true);

    let r;
    try {
      r = await window.api.enviar({
        id, modeloId: m.id, esforco: esforcoDoModelo(m), mensagens: historico,
      });
    } catch (e) {
      r = { erro: limparErroIpc(e) };
    }

    const { texto } = atual;
    atual = null;
    definirOcupado(false);

    if (r.erro) {
      caixa.remove();
      historico.pop();
      if (texto) {
        // chegou pedaço antes do erro: mantém o que veio
        historico.push({ role: 'user', content: conteudo });
        historico.push({ role: 'assistant', content: texto });
        criarMsg('ia', texto, m.nome);
      } else if (!el.texto.value) {
        el.texto.value = conteudo;
        ajustarAltura();
      }
      const e = criarMsg('ia erro', r.erro);
      e.caixa.classList.add('erro');
    } else if (texto) {
      historico.push({ role: 'assistant', content: texto });
      corpo.classList.remove('pensando');
      if (r.parado) addAviso(caixa, 'Parado.');
      else if (r.aviso) addAviso(caixa, r.aviso);
    } else {
      caixa.remove();
      historico.pop();
      if (!el.texto.value) {
        el.texto.value = conteudo;
        ajustarAltura();
      }
      if (!r.parado) criarMsg('ia erro', r.aviso || 'O modelo não devolveu texto.').caixa.classList.add('erro');
    }
    el.texto.focus();
  }

  function addAviso(caixa, texto) {
    const a = document.createElement('div');
    a.className = 'aviso';
    a.textContent = texto;
    caixa.appendChild(a);
  }

  el.enviar.addEventListener('click', () => {
    if (atual) window.api.parar(atual.id);
    else enviar();
  });

  el.texto.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      enviar();
    }
  });
  el.texto.addEventListener('input', ajustarAltura);

  el.nova.addEventListener('click', () => {
    if (atual) window.api.parar(atual.id);
    historico = [];
    for (const m of [...el.mensagens.querySelectorAll('.msg')]) m.remove();
    el.vazio.hidden = false;
    el.texto.focus();
  });

  // ---------- configurações ----------
  function mostrarEstadoChaves() {
    for (const [prov, estado, remover, campo] of [
      ['openai', el.estadoOpenai, el.removerOpenai, el.chaveOpenai],
      ['anthropic', el.estadoAnthropic, el.removerAnthropic, el.chaveAnthropic],
    ]) {
      const salva = st.config.chaves[prov];
      estado.textContent = salva ? 'Chave salva.' : 'Sem chave salva.';
      estado.classList.toggle('ok', salva);
      remover.hidden = !salva;
      campo.placeholder = salva ? '•••••••• (deixe vazio para manter)' : (prov === 'openai' ? 'sk-…' : 'sk-ant-…');
    }
    el.vazioAviso.hidden = st.config.chaves.openai || st.config.chaves.anthropic;
  }

  function marcarTema() {
    const escuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    el.temaEscuro.setAttribute('aria-pressed', String(escuro));
    el.temaClaro.setAttribute('aria-pressed', String(!escuro));
  }

  function abrirConfig(abrir) {
    el.fundoConfig.hidden = !abrir;
    el.erroConfig.hidden = true;
    if (abrir) {
      abrirBalao(false);
      el.chaveOpenai.value = '';
      el.chaveAnthropic.value = '';
      mostrarEstadoChaves();
      marcarTema();
      el.chaveOpenai.focus();
    } else {
      el.texto.focus();
    }
  }

  function erroConfig(msg) {
    el.erroConfig.textContent = msg;
    el.erroConfig.hidden = false;
  }

  async function aplicar(pedido) {
    try {
      st = await window.api.salvarConfig(pedido);
      return true;
    } catch (e) {
      erroConfig(limparErroIpc(e));
      return false;
    }
  }

  el.abrirConfig.addEventListener('click', () => abrirConfig(true));
  el.fecharConfig.addEventListener('click', () => abrirConfig(false));
  el.fundoConfig.addEventListener('mousedown', (ev) => {
    if (ev.target === el.fundoConfig) abrirConfig(false);
  });

  for (const b of [el.temaClaro, el.temaEscuro]) {
    b.addEventListener('click', async () => {
      await aplicar({ tema: b.dataset.tema });
      marcarTema();
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema);

  el.salvarConfig.addEventListener('click', async () => {
    const pedido = { chaves: {} };
    if (el.chaveOpenai.value.trim()) pedido.chaves.openai = el.chaveOpenai.value;
    if (el.chaveAnthropic.value.trim()) pedido.chaves.anthropic = el.chaveAnthropic.value;
    if (Object.keys(pedido.chaves).length && !(await aplicar(pedido))) return;
    mostrarEstadoChaves();
    atualizarRotulo();
    abrirConfig(false);
  });

  for (const [prov, botao] of [['openai', el.removerOpenai], ['anthropic', el.removerAnthropic]]) {
    botao.addEventListener('click', async () => {
      if (await aplicar({ chaves: { [prov]: null } })) mostrarEstadoChaves();
    });
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!el.fundoConfig.hidden) abrirConfig(false);
    else if (!el.balao.hidden) abrirBalao(false);
  });

  // ---------- início ----------
  (async () => {
    st = await window.api.estado();
    atualizarRotulo();
    mostrarEstadoChaves();
    ajustarAltura();
    el.texto.focus();
  })();
})();
