# Signal Desktop

Protótipo desktop-first de comunicação em tempo real.

## Desenvolvimento

Em dois terminais:

```bash
npm run signaling
npm run dev
```

O app abre em `http://localhost:5173` e o signaling local em `ws://127.0.0.1:8787`.

## Estado atual

- salas, memberships e códigos persistidos no Supabase;
- Settings de áudio, vídeo, rede e atalhos;
- captura local de microfone e tela;
- signaling WebSocket separado;
- negociação WebRTC com STUN e suporte configurável a TURN;
- áudio remoto reproduzido por peer;
- vídeo remoto anexado ao palco quando recebido.

O signaling valida o access token Supabase e a membership da Room. TURN e o endpoint público do signaling continuam dependendo de infraestrutura externa.

## Signaling em produção

O servidor leve aceita `PORT` (prioridade) ou `SIGNALING_PORT` e expõe `GET /health`, retornando `{ "status": "ok" }`. O proxy da hospedagem deve terminar TLS e encaminhar WebSocket para `/`; o cliente usará `wss://` através de `VITE_SIGNALING_URL`.

Variáveis somente do servidor:

```text
PORT=8787
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=chave-publica-do-servidor
CLOUDFLARE_TURN_KEY_ID=id-da-chave-turn
CLOUDFLARE_TURN_API_TOKEN=token-da-api-turn
# Opcional; padrão 86400 e limitado a 60–86400 segundos.
TURN_CREDENTIAL_TTL_SECONDS=86400
```

`SUPABASE_ANON_KEY` pode ser usado como alternativa à chave publishable. Nunca use `VITE_*` para essas variáveis e nunca coloque service role no cliente.

Para rodar localmente, configure as variáveis server-side no ambiente e execute `npm run signaling`. Para container: `docker build -f Dockerfile.signaling -t signals-signaling .` e `docker run --rm -p 8787:8787 -e SUPABASE_URL=... -e SUPABASE_PUBLISHABLE_KEY=... signals-signaling`.

O endpoint autenticado `GET /api/ice-servers` emite credenciais temporárias do Cloudflare Realtime TURN. O cliente deriva sua URL HTTP de `VITE_SIGNALING_URL`, envia o access token Supabase e mantém as credenciais em cache apenas na memória, renovando em 80% do TTL. Como a API do Cloudflare não retorna o TTL, se `TURN_CREDENTIAL_TTL_SECONDS` for alterado no servidor, configure o mesmo valor público em `VITE_TURN_CREDENTIAL_TTL_SECONDS` na build frontend. `VITE_ICE_SERVERS` e as variáveis individuais `VITE_STUN_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME` e `VITE_TURN_CREDENTIAL` permanecem como fallback de desenvolvimento/compatibilidade; credenciais TURN no cliente são observáveis. `VITE_WEBRTC_FORCE_RELAY=true` ativa `iceTransportPolicy: "relay"` para teste; o padrão é `"all"`.

## Supabase Auth

Copie `.env.example` para `.env.local` e preencha apenas a URL e a chave pública/publishable do projeto. Nunca coloque `service_role`, senha SMTP ou chave Brevo no frontend/Tauri.

A migration em `supabase/migrations/202609080001_signal_profiles.sql` cria `profiles`, a unicidade case-insensitive de username, trigger de criação de perfil e políticas RLS. A aplicação usa sessões persistentes do Supabase Auth e o redirect configurado em `VITE_AUTH_REDIRECT_URL` para confirmação e recuperação.

Para habilitar salas persistentes e chat, aplique também `supabase/migrations/202609090001_signal_rooms_chat.sql` no SQL Editor do projeto. Ela cria `rooms`, `room_members`, `room_messages` e `room_read_states`, configura RLS e habilita `room_messages` no Realtime. Depois, reinicie o Vite para carregar as variáveis de `.env.local`.

As contas são criadas pelo site Signals. O aplicativo desktop oferece apenas login, recuperação e redefinição de senha.
