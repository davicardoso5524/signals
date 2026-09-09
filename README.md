# Signal Desktop

Protótipo desktop-first de comunicação em tempo real.

## Desenvolvimento

Em dois terminais:

```bash
npm run signaling
npm run dev
```

O app abre em `http://localhost:5173` e o signaling em `ws://127.0.0.1:8787`.

## Estado atual

- salas e códigos persistidos localmente;
- Settings de áudio, vídeo, rede e atalhos;
- captura local de microfone e tela;
- signaling WebSocket separado;
- negociação WebRTC com STUN;
- áudio remoto reproduzido por peer;
- vídeo remoto anexado ao palco quando recebido.

TURN e autenticação ainda entram na próxima camada de infraestrutura.

## Supabase Auth

Copie `.env.example` para `.env.local` e preencha apenas a URL e a chave pública/publishable do projeto. Nunca coloque `service_role`, senha SMTP ou chave Brevo no frontend/Tauri.

A migration em `supabase/migrations/202609080001_signal_profiles.sql` cria `profiles`, a unicidade case-insensitive de username, trigger de criação de perfil e políticas RLS. A aplicação usa sessões persistentes do Supabase Auth e o redirect configurado em `VITE_AUTH_REDIRECT_URL` para confirmação e recuperação.

Para habilitar salas persistentes e chat, aplique também `supabase/migrations/202609090001_signal_rooms_chat.sql` no SQL Editor do projeto. Ela cria `rooms`, `room_members`, `room_messages` e `room_read_states`, configura RLS e habilita `room_messages` no Realtime. Depois, reinicie o Vite para carregar as variáveis de `.env.local`.

Para confirmar novos cadastros por código, em **Authentication → Email Templates → Confirm signup**,
inclua `{{ .Token }}` no corpo do email. O app aceita códigos de 6 a 8 dígitos e também oferece reenvio.
Se o provedor de email estiver adicionando links de rastreamento, o código evita depender desse link.
