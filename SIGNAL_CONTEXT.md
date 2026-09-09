# SIGNAL — contexto do produto

## Direção

Aplicação desktop de comunicação em tempo real com identidade própria. Não copiar Discord, servidores, canais ou categorias.

Linguagem visual: grafite/carvão, âmbar como accent, componentes com aparência física de equipamento, tipografia técnica, pouco arredondamento, sem gradientes clichês ou glassmorphism.

## Navegação atual

- Home: iniciar rapidamente criando uma sala ou entrando por código.
- People: encontrar pessoas por display name e `@username`.
- Rooms: encontrar/criar espaços persistentes.
- Settings: configurar áudio, vídeo, rede e atalhos.
- Active Session Bar: aparece globalmente durante uma chamada e permite retornar à sessão.

Recents foi removido como página principal. Atalhos Recent podem aparecer discretamente na Home, sem virar feed ou histórico.

## Home

Home minimalista com:

- `Start a conversation`;
- `Create room`;
- campo `Enter room code`;
- atalhos pequenos de até quatro Persistent Rooms;
- Recent somente quando houver histórico real.

Não adicionar dashboard, estatísticas, greetings ou cards informativos.

## People

Lista simples de contatos usando:

- `id` interno imutável;
- display name;
- `@username` único;
- presença como indicador discreto;
- busca compacta;
- Add person em modal.

Não usar roles, departamentos ou aparência de tabela corporativa.

## Rooms

Uma Room é o próprio espaço de comunicação. Não existem canais dentro dela.

Persistent Room possui:

- membros;
- chat persistente;
- chamada de voz;
- screen sharing;
- acesso e convite.

Quick Room é temporária e focada em chamada/screen sharing. Persistent Room permanece em Rooms.

A listagem de Rooms mostra nome, quantidade de pessoas, unread discreto e estado `in call`. Room code aparece apenas nos detalhes/convite.

Ao abrir uma Room, a interface prioriza o chat editorial:

- mensagens agrupadas por autor;
- timestamp;
- envio por Enter;
- Shift + Enter para nova linha;
- composer inferior;
- modal compacto de Members;
- Start call/Join call no header.

O chat não deve desaparecer quando uma call começa. A call pode continuar ativa com a Room visível, enquanto a Active Session Bar permite retornar à tela completa da chamada.

## Dados preparados

Tipos conceituais presentes no frontend:

- `Room`;
- `RoomMember`;
- `RoomMessage`;
- `RoomReadState`;
- `CallSession`.

O protótipo atual salva mensagens localmente em `localStorage`. A implementação de produção deve mover mensagens/read state para Supabase Database + Realtime. WebRTC continua separado para voz e screen sharing.

## Supabase MCP

Foi solicitado conectar o MCP oficial do Supabase. O comando pretendido é:

```bash
codex mcp add supabase --url "https://mcp.supabase.com/mcp?features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

Depois da conexão, priorizar modo read-only e escopo para um único `project_ref` antes de alterar dados. Não colocar service role key no frontend nem no repositório.

## Stack

- React + TypeScript + Vite no protótipo atual;
- Tauri/Rust previsto para integração nativa desktop;
- WebRTC para mídia;
- WebSocket signaling separado;
- STUN configurável e TURN opcional por variáveis de ambiente.

## Validação

`npm run build` está passando. Os fluxos de Home, People, Rooms, Create Room compacto, chat da Room, Active Session e Settings foram validados no navegador.
