# Migracao dos Dados Locais

Este projeto agora esta preparado para Vercel + Supabase. Os dados atuais continuam locais e nao devem ser enviados ao GitHub.

## Ordem recomendada

1. Fazer backup de `data/db.json` e `data/uploads/`.
2. Criar o projeto Supabase e executar `supabase/schema.sql`.
3. Criar o bucket privado `proposal-docx`.
4. Criar usuarios no Supabase Auth.
5. Inserir perfis correspondentes em `profiles`.
6. Migrar tabelas nesta ordem:
   - `companies`
   - `events`
   - `templates`
   - `counterparts`
   - `proposals`
   - `proposal_versions`
   - `proposal_change_logs`
   - `proposal_notes`
7. Subir os `.docx` de `data/uploads/` para o bucket `proposal-docx`.
8. Trocar cada `templates.importedFilePath` local por `templates.storagePath`.

## Observacoes importantes

- Caminhos absolutos antigos do Windows nao funcionam online.
- Senhas antigas do `db.json` nao devem ser migradas; crie usuarios via Supabase Auth.
- Antes de liberar para equipe, teste login, criacao de proposta, importacao de Word e exportacao `.docx`.
