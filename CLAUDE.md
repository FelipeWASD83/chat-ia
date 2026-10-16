# CLAUDE.md: chat-ia

App Electron mínimo para conversar com o GPT e o Claude com a chave do próprio
usuário. Criado em 16/10/2026 a pedido do Felipe, "extremamente simples": barra de
texto, configurações (chaves e tema), balão de modelo e raciocínio, botão de enviar.
Valem também as regras da raiz da pasta.

## O que tem e o que ficou de fora

- Tem, além do pedido: "Nova conversa", botão de enviar que vira "parar", resposta em
  streaming e texto devolvido ao campo quando a API dá erro. Foram acrescentados por
  serem parte de um chat usável; o Felipe pode mandar tirar.
- **Não tem de propósito** (era "extremamente simples"): histórico salvo em disco,
  Markdown nas respostas, anexos, prompt de sistema, reserva automática por falta de
  crédito entre GPT e Claude (os projetos dele que têm IA usam o `provedor` copiado,
  este não), atualização pelo GitHub (a regra da raiz manda todo app nascer com ela;
  ficou de fora por causa do pedido, a pedir permissão antes de acrescentar).
- Sem entrada no `launch.json`: é Electron, sem porta (igual `prompt-forge`, `bitlife2`).

## Arquivos

- `provedores.js`: lista de modelos (`MODELOS`), como cada modelo recebe o raciocínio
  (`corpoOpenAI`, `parametrosClaude`) e as chamadas em streaming. OpenAI por `fetch`
  em `/v1/chat/completions`; Claude pelo SDK oficial `@anthropic-ai/sdk`. Sem Electron
  aqui, para testar no Node.
- `main.js`: janela, configurações em `%APPDATA%\chat-ia\config.json`, chaves cifradas
  com `safeStorage` (DPAPI), IPC. As chamadas às APIs saem do processo principal, a
  janela não tem rede (CSP `default-src 'none'`) nem Node.
- `preload.js`, `index.html`, `estilo.css`, `app.js`: a tela. Tema: o main fixa
  `nativeTheme.themeSource` e o CSS só usa `prefers-color-scheme`.

## Regras de raciocínio por modelo (não mexer sem ler `.claude/pesquisas/modelos-claude.md`)

- Opus 5.5, Fable 5 e 5.1: nunca mandar `thinking` (400); só `output_config.effort`.
- Sonnet 5.5 desliga com `thinking: {type: "between_tools"}` e sem `effort`; os
  demais com `{type: "disabled"}`. `budget_tokens` só nos Claude 4.5 (400 nos novos).
- Nunca `temperature`, `top_p`, `top_k`, `tool_choice` nem prefill no Claude.
- GPT: `reasoning_effort` só nos que raciocinam. Verificado só para a família GPT-6
  (Astra e 6.1 Sol sem `none`); nos demais a lista é conservadora (baixo, médio,
  alto; GPT-5 também mínimo) porque não confirmei os níveis deles.
- A lista de modelos é de 14/10/2026. `gpt-5.5-pro` e `gpt-5.4-pro` ficaram fora (só
  Responses API). `gpt-3.5-turbo` e outros desligam em 23/10/2026.

## Testes

- `npm test` (Node): lista de modelos, parâmetros por modelo, leitor de SSE e as duas
  APIs de ponta a ponta contra `testes/servidor-falso.js`.
- `node testes/e2e.js [pasta-de-prints]`: abre o Electron de verdade, usa a tela,
  confere chaves cifradas, streaming, parar, erro, balão e os dois temas, e tira
  prints (o app usa `CHAT_IA_DADOS`, `CHAT_IA_OPENAI_URL` e `CHAT_IA_ANTHROPIC_URL`
  só nos testes).
- **Nunca foi chamada a API de verdade** (sem chave aqui): tudo foi contra servidor
  falso no formato da documentação.

## Smart App Control

`electron` está fixado em 44.5.0, a mesma versão do `worldbox-2` e do `clave`, que
já passou pelo bloqueio. Não subir a versão sem testar. O binário baixa na primeira
vez por `node node_modules\electron\install.js` (o `abrir.bat` faz isso).
