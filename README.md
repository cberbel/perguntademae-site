# BabyGPT

Site de dicas sobre a primeira infância (0 a 3 anos) com um assistente que
responde perguntas de pais e cuidadores. Uma realização da **Free School**
(freeschool.com.br).

## Arquitetura

- **Site**: uma página estática (`index.html`, HTML/CSS/JS puros, mobile-first,
  sem build). A primeira tela é a caixa de pergunta.
- **Bot**: Supabase Edge Function `babygpt` (código em
  `supabase/functions/babygpt/index.ts`), que chama a API da Anthropic
  (`claude-sonnet-5`) com um prompt focado em 0–3 anos e limites de segurança
  (nunca diagnóstico; urgência → procurar atendimento).
- **Registro e limites**: tabela `public.babygpt_perguntas`
  (`babygpt-tabela.sql`) guarda pergunta/resposta/IP — alimenta o limite de
  8 perguntas por IP/hora e o teto global de 400/dia (proteção de custo), e
  serve de garimpo de conteúdo (perguntas reais → novas dicas).
- **Proteções**: CORS restrito aos domínios do site; a function tem
  `verify_jwt` desligado de propósito (site público, sem login).

## Deploy

- Site: push neste repo → Vercel (projeto `babygpt`).
- Function: `deploy_edge_function` (MCP do Supabase) — arquivo pequeno.

## Aviso

Conteúdo educativo gerado por IA. Não substitui a orientação do pediatra.
