# Histórico do projeto SIGNALS

## Identidade visual

- A identidade visual foi refinada para o tema SIGNALS: preto/quase preto, azul como accent e interface minimalista.
- A sidebar fixa, o layout desktop-first e os fluxos existentes foram preservados.
- Foi implementado tema Dark/Light com persistência em `localStorage` usando a chave `signals-theme`.
- A tela de login foi refinada sem alterar a lógica de autenticação:
  - logo S centralizada;
  - título `Sign in`;
  - botão `Continue`;
  - formulário centralizado;
  - composição minimalista sem card ou painel decorativo.

## Logo e favicon

- Logo principal da aplicação: `public/signals.png`.
- Como o PNG original é retangular e contém o wordmark, foi criada uma versão quadrada baseada no símbolo S:
  - `public/signals-icon.png` — favicon do navegador;
  - `src-tauri/icons/signals-icon.png` — fonte quadrada para os ícones do desktop.
- Os ícones do Tauri foram regenerados a partir dessa versão quadrada, incluindo `icon.ico`, `icon.icns` e os PNGs de bundle.

## Supabase

- O projeto está conectado ao Supabase.
- As migrations e o sistema de email foram configurados pelo proprietário do projeto.
- O login está integrado e funcionando na aplicação.

## GitHub e releases

- Repositório: https://github.com/davicardoso5524/signals
- A aplicação desktop foi configurada com Tauri.
- O updater obrigatório usa GitHub Releases e `latest.json` assinado.
- A release inicial foi publicada:
  - `v0.1.0`
- A release de correção de identidade visual foi publicada:
  - `v0.1.1`
- A `v0.1.1` contém os instaladores MSI e NSIS com o novo ícone.
- O build de produção passou com sucesso.

## Teste de atualização

- O teste da atualização de `v0.1.0` para `v0.1.1` funcionou.
- O favicon foi atualizado corretamente.
- O executável da `v0.1.1` contém o novo símbolo S.
- Se o ícone do atalho da Área de Trabalho continuar antigo, o Windows está mantendo o atalho/cache anterior. A solução é excluir o atalho antigo e criar um novo a partir de:

  `C:\Users\cardo\AppData\Local\SIGNALS\signals.exe`

## Observação

Nenhuma chave privada, senha ou token foi registrado neste arquivo.
