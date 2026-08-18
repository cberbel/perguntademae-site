-- Pergunta de Mãe (Free School): registro de perguntas e respostas.
-- Serve a DOIS propósitos: limite de uso (por IP e global, lido pela edge
-- function "perguntademae") e garimpo de conteúdo (as perguntas reais viram dicas).
-- RLS ligado SEM políticas: só a service role (edge function) lê e escreve.

create table public.perguntademae_perguntas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  pergunta text not null,
  resposta text,
  ip text,
  origem text
);

alter table public.perguntademae_perguntas enable row level security;

create index perguntademae_perguntas_ip_criado_em on public.perguntademae_perguntas (ip, criado_em);
create index perguntademae_perguntas_criado_em on public.perguntademae_perguntas (criado_em);

-- ROLLBACK:
-- drop table public.perguntademae_perguntas;
