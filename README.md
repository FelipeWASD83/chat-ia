# Chat IA

App de janela, bem simples, para conversar com o GPT e com o Claude usando as suas chaves de API.

## Como usar

1. Dois cliques em `abrir.bat`. Na primeira vez ele baixa o Electron (precisa de internet).
2. Clique na engrenagem, cole a chave da OpenAI e/ou a da Anthropic e clique em "Salvar chaves". Só precisa da chave do lado que você for usar. As chaves ficam cifradas pelo Windows e nunca saem deste PC, a não ser para a API de cada empresa.
3. Embaixo, ao lado da barra de texto, o botão com o nome do modelo abre o balão: à esquerda o modelo, à direita o raciocínio (Desligado, Baixo, Médio...). Modelo sem raciocínio, como o GPT-4o, avisa isso.
4. Escreva e aperte Enter (Shift+Enter pula linha) ou clique na seta. Enquanto a resposta chega a seta vira um quadrado, que para a resposta.
5. "Nova conversa" apaga a conversa da tela. Nada é gravado em disco além das configurações.

Modelos marcados "desliga em..." vão sair do ar nessa data. A lista é de 14/10/2026 e fica em `provedores.js`.

## Mudar a lista de modelos

No arquivo `provedores.js`, a lista `MODELOS` tem uma linha por modelo. Para acrescentar um GPT, copie uma linha que começa com `gpt(` e troque o id e o nome. Para um Claude, o mesmo com `claude(`.
