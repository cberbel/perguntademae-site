# Pergunta de Mãe — contexto do projeto

Site onde a mãe escreve uma dúvida sobre o bebê (0 a 3 anos) e recebe resposta
na hora. **Uma realização da Free School.** No ar em www.perguntademae.com.br
(e perguntademae.vercel.app).

## A regra que manda em tudo

**O produto é ACOLHIMENTO À MÃE, não conteúdo técnico.** Palavras do Claudio
(dono): *"o principal é passar o acolhimento pra mãe do que ficar passando o
negócio científico ou dando ordem pra mãe ou cobrando a mãe."*

Toda resposta segue a ordem: **acolher → tirar a culpa → só então 2 ou 3
caminhos simples**. É proibido "você deve", "o ideal é", "faça"; proibido
sermão, jargão e citar estudos ou autores. Se a mãe contar que deu tela ou
perdeu a paciência, acolher — nunca corrigir de cara.

Pano de fundo (nunca vira discurso): **o básico basta** — carinho e segurança,
liberdade para o bebê se mover no chão, conversa desde cedo e respeito ao vai e
volta entre mãe e filho.

Epígrafe do site, de Winnicott (conferida na fonte primária, nota de rodapé do
artigo dele de 1960): *"Não existe isso que se chama um bebê: sempre que
encontramos um bebê, encontramos o cuidado materno."* É a tese: cuidar da mãe
É cuidar do bebê.

**A peça central do produto é o prompt** em `supabase/functions/perguntademae/index.ts`.
Mexer nele muda o produto — ler inteiro antes.

## Estratégia de conteúdo

As dores das mães são o gancho, **nomeadas na voz dela** para ela se
reconhecer ("Não durmo há meses", "Só dorme no meu colo", "Perdi a paciência e
gritei"). O card abre com a dor e responde com **alívio, nunca cobrança**.

Validado no Planejador do Google (Brasil, ago/25–jul/26): introdução alimentar
12.100/mês, desfralde 4.400, dentes nascendo 4.400, bebê chora muito 2.400,
desmame noturno 1.300, sono do bebê 720, bebê não dorme 590, só dorme no colo
320, exaustão materna 390. Bem menores do que parecia: birra (70+30) e "bebê
não fala" (10). Sem dados: telas, cansaço na maternidade, depressão pós-parto
— "sem dados" ali NÃO quer dizer que ninguém sofre. **Dor de vergonha ninguém
googla** — não se mede por busca, mas é o que mais gera reconhecimento.

O Claudio aprovou passar de 10 para **30 dores**; a lista de 30 está montada e
aguardando a publicação (ver histórico da conversa).

## Arquitetura

- **Site**: `index.html` estático (HTML/CSS/JS puro, mobile-first, sem build).
  Primeira tela = caixa de pergunta. `privacidade.html` é obrigatória (dado de
  criança). `sobre.html` foi REMOVIDO a pedido dele ("depois voltamos") — está
  no histórico do git.
- **Bot**: edge function `perguntademae` (claude-sonnet-5), com `verify_jwt`
  desligado de propósito.
- **Identidade**: cadastro devolve um TOKEN opaco (uuid) guardado no
  localStorage; toda pergunta manda o token e o servidor traduz token→mãe.
  **Nunca confiar em id vindo do cliente.**
- **Memória da conversa**: com cadastro, vão as últimas 6 trocas + a idade do
  bebê calculada da data. É o maior diferencial (nenhum concorrente gratuito
  tem).
- **Portão**: 1ª pergunta livre, convite a partir da 2ª, obrigatório depois de
  7. **O portão das 7 mora no NAVEGADOR** (localStorage) — no servidor ele
  seria por IP, e muita mãe brasileira navega em CGNAT (várias pessoas no mesmo
  IP), o que barraria mãe inocente na primeira pergunta. O servidor só tem
  freio de abuso folgado (25/IP em 30 dias) e limite por hora.
- **Falha FECHADO**: se não dá para contar ou gravar, não chama a API paga.
- **CORS não protege custo** (Origin é forjável) — quem protege são os limites.

## Onde as coisas moram

- Repo: `cberbel/perguntademae-site`. Pasta local ainda chamada `babygpt-site`.
- Vercel: projeto `perguntademae` (apex → www, 308).
- Supabase: **AINDA no projeto da escola** (`rmpnqrvsmxhnrwlgqmdp`) — function
  e dados. As tabelas já existem vazias no projeto do cardápio
  (`pwmslyvmvbvneuiuvotn`), que está parado e foi escolhido para receber o
  projeto. **Falta o Claudio colar `ANTHROPIC_API_KEY` nos secrets do cardápio**;
  aí é publicar a function lá, trocar a URL no site e limpar o lado da escola.

## Pendências do Claudio

1. **DNS** no Registro.br (domínio usa a.auto.dns.br): `A @ → 216.150.1.1` e
   `CNAME www → 76c45eecb8ecb13a.vercel-dns-016.com`.
2. **Número de WhatsApp próprio** — o bot vai ser o produto principal ("as
   pessoas estão no whats, o site é só a casa"), **totalmente separado da Maria**
   (bot da escola). Para ativar o botão: preencher a constante `WHATS` no topo
   do script do index.html. **NUNCA usar o número da escola** — quem chega aqui
   veio por acolhimento, não por matrícula.
3. **ANTHROPIC_API_KEY** no projeto do cardápio (item acima).

## Avisos

- **Nomes já descartados com prova, não reabrir:** BabyGPT (app homônimo na App
  Store; OpenAI não permite "GPT" em nome de produto; o bot usa Claude),
  SmartBaby (domínio tomado, colide com Berçário Smart Baby e Smart Baby Box, e
  promete otimizar o bebê — oposto do "o básico basta"), Mãe de Primeira Viagem
  (saturado, conta de 1M de seguidores).
- **1º/out/2026: a Meta passa a cobrar toda mensagem não-template do WhatsApp**
  (hoje resposta dentro da janela é grátis). Cada bolha vira cobrança — o bot
  deve nascer com "uma resposta = uma mensagem".
- **Nunca inventar** pessoas, dados, estudos ou instituições. **Nunca citar**
  Nobel, ONU, OMS, FMI ou UNESCO como autoridade.
- Sem relação com o Dossiê BNCC — o Claudio pediu explicitamente que nada de lá
  seja usado.
