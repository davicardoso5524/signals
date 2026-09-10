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

## Trabalho realizado em 10 de setembro de 2026

### WebRTC e chamadas

- Corrigido o compartilhamento de tela remoto que permanecia congelado no último frame após ser encerrado.
- O receptor encerra explicitamente as tracks de vídeo remotas e limpa o elemento `<video>`.
- A transceiver de vídeo inicial não é mais interpretada como compartilhamento ativo.
- Participantes sem compartilhamento aparecem como tiles com iniciais; a tela grande só aparece durante um compartilhamento real.
- Os sons `call-join`, `call-leave`, `call-screen-start` e `call-screen-stop` foram confirmados e conectados aos eventos de call.

### Chat e autenticação

- O chat de Persistent Rooms foi conectado ao Supabase Database + Realtime.
- Foi identificado e corrigido o caso de conta existente em `auth.users`, mas ausente em `profiles`, que causava erro 409 ao enviar mensagens.
- A sessão inválida do Supabase foi diagnosticada como causa dos erros 400/401 de refresh e consultas autenticadas.
- Foi mantido fallback local para ambientes sem Supabase, apenas para o protótipo.

### Perfil e permissões

- Adicionada aba Profile em Settings.
- `display_name` pode ser alterado; username e email permanecem somente leitura.
- Adicionada troca de senha.
- Avatar pode ser enviado em JPG, JPEG, PNG ou WebP.
- Imagens são convertidas para WebP no navegador antes do upload.
- Adicionada a migration `supabase/migrations/202609100001_signal_avatar_storage.sql`, que cria o bucket `avatars` e suas políticas.
- Avatar passou a aparecer na sidebar, no modal de membros das Rooms e no tile do usuário na call.
- Settings permite testar novamente microfone e compartilhamento de tela após uma recusa de permissão.

### Quick Rooms

- Quick Rooms permanecem disponíveis enquanto ainda houver participantes.
- Ao sair o último participante da call, a Quick Room é removida do Supabase e da lista local.
- Persistent Rooms continuam permanentes, com membros e histórico.

### Commits e releases do dia

- `eecdfb5 Fix call media permissions and room chat`
- `5d7b91f Add profile settings and avatar support`
- `6e8042e Clean up quick rooms after final participant leaves`
- `4912af3 Prepare SIGNALS 0.1.12 release`
- A release `v0.1.11` foi publicada com sucesso.
- A release `v0.1.12` foi criada e enviada; o workflow Tauri `34482014850` está compilando os instaladores Windows.
- `npm run build` passou após as alterações.

Nenhuma chave privada, senha ou token foi registrado neste arquivo.

## Estado atual — setembro de 2026

- O rodapé da sidebar foi auditado e corrigido para usar a identidade da conta autenticada.
- `display_name` e `username` vêm do profile correspondente ao usuário atual, com fallback seguro para os metadados da sessão.
- O estado `Loading profile...` agora termina corretamente mesmo quando a consulta falha ou não encontra profile.
- Respostas atrasadas de uma conta anterior não podem sobrescrever o profile da conta atual.
- O ponto azul decorativo do rodapé foi removido por não representar presença real.
- O tema continua persistido em `localStorage` pela chave `signals-theme`.
- O logout limpa o estado da conta e desmonta a call ativa antes de encerrar a sessão Supabase.

### Commits recentes

- `5c45bba Fix sidebar account identity`
- `2162fb7 Fix profile loading fallback`
- `439d382 Prepare SIGNALS 0.1.7 release`

### Release atual

- `v0.1.7` publicada no GitHub e não está em draft.
- Instaladores Windows NSIS/EXE e MSI publicados, com assinaturas e `latest.json`.
- Repositório sincronizado com `origin/main`.
- Build web (`npm run build`) passou.
- O build local do Tauri depende de Rust/Cargo; a build oficial da release foi concluída com sucesso no GitHub Actions.

Nenhuma chave privada, senha ou token foi registrado neste arquivo.
