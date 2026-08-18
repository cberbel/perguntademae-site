# Pergunta de Mãe

Site onde a mãe pergunta o que quiser sobre o bebê (0 a 3 anos) e recebe uma
resposta acolhedora na hora — sem julgamento e sem cobrança. O produto é o
ACOLHIMENTO À MÃE; o prompt da edge function é a peça central. Uma realização da **Free School**
(freeschool.com.br).

## Arquitetura

- **Site**: uma página estática (`index.html`, HTML/CSS/JS puros, mobile-first,
  sem build). A primeira tela é a caixa de pergunta.
- **Bot**: Supabase Edge Function `perguntademae` (código em
  `supabase/functions/babygpt/index.ts`), que chama a API da Anthropic
  (`claude-sonnet-5`) com um prompt focado em 0–3 anos e limites de segurança
  (nunca diagnóstico; urgência → procurar atendimento).
- **Registro e limites**: tabela `public.perguntademae_perguntas`
  (`perguntademae-tabela.sql`) guarda pergunta/resposta/IP — alimenta o limite de
  8 perguntas por IP/hora e o teto global de 400/dia (proteção de custo), e
  serve de garimpo de conteúdo (perguntas reais → novas dicas).
- **Proteções**: CORS restrito aos domínios do site; a function tem
  `verify_jwt` desligado de propósito (site público, sem login).

## Deploy

- Site: push neste repo → Vercel (projeto `perguntademae`).
- Function: `deploy_edge_function` (MCP do Supabase) — arquivo pequeno.

## Aviso

Conteúdo educativo gerado por IA. Não substitui a orientação do pediatra.
