# Life OS

Sistema operacional pessoal — finanças, hábitos, metas, vida.
Stack: HTML/CSS/JS estáticos + Supabase (auth + Postgres com RLS) + PWA.

## Estrutura

```
life-os/
├── index.html              ← shell do app + tela de login
├── styles.css              ← mobile-first, identidade dark + gold
├── manifest.webmanifest    ← PWA
├── sw.js                   ← service worker (cache shell)
├── icons/icon.svg          ← ícone do app
├── vercel.json             ← config de deploy
├── js/
│   ├── config.js           ← URL + publishable key do Supabase
│   ├── supabase.js         ← inicialização do cliente
│   ├── auth.js             ← magic link
│   ├── store.js            ← state + CRUD + import/export
│   └── app.js              ← navegação, render, modais, init
├── supabase/schema.sql     ← schema completo (rodar no SQL Editor)
└── life-os.html            ← versão antiga, pode apagar depois
```

## Setup (1ª vez)

### 1. Banco de dados
1. Cria um projeto novo em [supabase.com](https://supabase.com).
2. SQL Editor → cola `supabase/schema.sql` → Run.
   Cria 13 tabelas, RLS por usuário e triggers.
3. Roda também as migrations em `supabase/migrations/` na ordem (são idempotentes — pode rodar de novo sem problema).

### 2. Auth (magic link)
No painel Supabase:
- **Authentication → Providers → Email**: `Enable Email Provider` ✓ e `Enable Email confirmations` (recomendado).
- **Authentication → URL Configuration**:
  - **Site URL**: a URL final do Vercel (ex: `https://life-os-seu.vercel.app`)
  - **Redirect URLs** (adiciona ambas):
    - `https://life-os-seu.vercel.app/**`
    - `http://localhost:*/**` (pra testar local)

> Sem isso, o magic link aterrissa em `localhost:3000` por padrão e quebra.

### 3. Credenciais no app
`js/config.js` já tá preenchido com URL + publishable key. Se trocar de projeto Supabase, edita esse arquivo.

> A publishable key é segura pra ficar versionada — RLS garante que cada usuário só lê/escreve as próprias linhas.

## Deploy no Vercel

Opção 1 — CLI:
```bash
npm i -g vercel
cd life-os
vercel
# segue o prompt, escolhe deploy
vercel --prod
```

Opção 2 — Dashboard:
1. Sobe a pasta pro GitHub (ou faz push pra um repo).
2. vercel.com → New Project → Import Git Repository.
3. Framework Preset: **Other** (não é Next.js).
4. Build Command: deixa vazio. Output Directory: `.`
5. Deploy.

Depois copia a URL final pra **Site URL** do Supabase (passo 2 acima).

## Migrar dados do Artifacts

1. Abre o `life-os.html` antigo no Claude Artifacts.
2. F12 → Console → cola e roda:
   ```js
   (async () => {
     const keys = ['transactions','cards','investments','goals','habits','habitLog',
                   'familyTime','familyGoal','studyItems','studySessions','workouts',
                   'workoutGoal','trips','reserve','reserveGoal','energy','focus'];
     const dump = {};
     for (const k of keys) {
       const r = await window.storage.get('lifeos_' + k);
       if (r) {
         try { dump[k] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; }
         catch { dump[k] = r.value; }
       }
     }
     const blob = new Blob([JSON.stringify(dump, null, 2)], {type:'application/json'});
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = 'lifeos-backup.json';
     a.click();
   })();
   ```
3. Vai baixar `lifeos-backup.json`.
4. No app novo, faz login com seu email.
5. Vai em **Configurações → Importar backup JSON** e seleciona o arquivo.
6. Confirma. Espera a mensagem de "X registros importados".

## Instalar como app no celular

- **iOS (Safari)**: abre o site → botão de compartilhar → "Adicionar à Tela de Início". Abre fullscreen.
- **Android (Chrome)**: abre o site → menu → "Instalar app".

## Backup recorrente

Vai em **Configurações → Baixar backup JSON**. Faz isso de vez em quando como segurança extra (mesmo com Supabase, sempre bom ter um arquivo local).

## Desenvolvimento local

Como é estático, qualquer servidor estático serve:

```bash
# Python
python3 -m http.server 5173

# Node
npx serve .

# Bun
bunx serve .
```

Abre `http://localhost:5173`. Magic link vai redirecionar pra `localhost`, então confirma que tem `http://localhost:*/**` em **Redirect URLs** do Supabase.

## Notas

- **Offline**: o app abre offline (shell em cache via service worker), mas escritas precisam de internet — vão falhar com toast vermelho até voltar a conexão.
- **Sync entre dispositivos**: automático via Supabase. Recarrega a página pra puxar mudanças feitas em outro device.
- **Ícones PNG (iOS)**: o ícone padrão é SVG. Se quiser ícones nítidos no iOS, gera PNGs 192x192 e 512x512 a partir de `icons/icon.svg` (ex: [realfavicongenerator.net](https://realfavicongenerator.net)) e salva como `icons/icon-192.png` e `icons/icon-512.png`.
