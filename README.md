# Plataforma de Propostas SAESP

Aplicativo interno para gerir empresas, eventos, modelos, contrapartidas e propostas comerciais, preparado para deploy na Vercel com Supabase.

## Arquitetura

- Frontend estatico em `public/`.
- API serverless em `api/index.js`.
- Modulos de aplicacao em `src/`.
- Supabase Auth para login.
- Supabase Postgres para dados.
- Supabase Storage privado para modelos `.docx`.
- Vercel para hospedagem e funcoes.

## Configuracao

1. Crie um projeto no Supabase.
2. Execute o SQL de `supabase/schema.sql` no SQL Editor.
3. Crie um usuario inicial no Supabase Auth.
4. Insira o perfil desse usuario em `profiles` com role `Admin`.
5. Confirme que o bucket privado `proposal-docx` foi criado pelo SQL.
6. Copie `.env.example` para `.env.local` e preencha as chaves.
7. No Vercel, configure as mesmas variaveis de ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DOCX_BUCKET`
   - `APP_URL` (`https://plataforma-saesp.vercel.app`)

## Rodar localmente

Depois de instalar dependencias:

```powershell
npm install
npm run local
```

Abra:

```text
http://localhost:4173/login
```

## Primeiro Admin

Depois de criar o usuario no Supabase Auth, copie o `User UID` e rode:

```sql
insert into public.profiles (id, name, email, role)
values ('USER_UID_AQUI', 'Admin', 'seu-email@dominio.com', 'Admin')
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    updated_at = now();
```

Para simular a Vercel:

```powershell
npm run dev
```

## Deploy

1. Suba esta pasta para um repositorio privado no GitHub.
2. Importe o repositorio na Vercel.
3. Configure as variaveis de ambiente.
4. Use o build padrao da Vercel.

## Dados locais

`data/db.json` e `data/uploads/` continuam fora do GitHub. Eles servem apenas como origem para migracao controlada. Veja `docs/MIGRATION.md`.

## Seguranca

- Nao versionar `.env.local`, `data/db.json` ou arquivos de Word internos.
- A service role do Supabase deve existir apenas no servidor/Vercel.
- O navegador usa somente cookies `HttpOnly` emitidos pela API.
