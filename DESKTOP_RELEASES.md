# SIGNALS desktop releases

O desktop usa Tauri 2 e o updater oficial. O endpoint configurado aponta para:

`https://github.com/davicardoso5524/signals/releases/latest/download/latest.json`

## Configuração única do updater

Gere um par de chaves de assinatura com a CLI do Tauri:

```bash
npx tauri signer generate -w ~/.tauri/signing.key
```

Substitua `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY` em `src-tauri/tauri.conf.json` pela chave pública gerada. A chave privada nunca deve entrar no repositório.

No GitHub, em **Settings → Secrets and variables → Actions**, crie:

- `TAURI_SIGNING_PRIVATE_KEY`: conteúdo da chave privada;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: senha usada na geração, se houver.

Como o build do desktop também compila o frontend Vite, crie também estes Secrets para
que autenticação e cadastro funcionem no instalador publicado:

- `VITE_SUPABASE_URL`: URL pública do projeto Supabase;
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave pública/publishable do Supabase;
- `VITE_AUTH_REDIRECT_URL`: URL de confirmação/recuperação configurada no Supabase.

Esses valores são injetados apenas durante o build pelo workflow. O arquivo `.env` local
continua ignorado pelo Git e deve ser usado no desenvolvimento.

## Publicar uma release

Atualize a versão em `package.json` e `src-tauri/tauri.conf.json`, faça commit e crie uma tag SemVer:

```bash
git tag v0.1.2
git push origin main --tags
```

O workflow `.github/workflows/release.yml` executa no Windows, gera os instaladores NSIS/MSI e publica os artefatos assinados em um GitHub Release como draft. Depois de revisar, publique o draft. O updater bloqueia o aplicativo até a nova versão ser instalada.

## Desenvolvimento local

Instale Rust/Cargo e os pré-requisitos do Tauri no Windows. Depois:

```bash
npm run desktop:dev
npm run desktop:build
```

O frontend web continua disponível com `npm run dev` e o build web com `npm run build`.
