-- BabyGPT (site babygpt / Free School): registro de perguntas e respostas.
-- Serve a DOIS propósitos: limite de uso (por IP e global, lido pela edge
-- function "babygpt") e garimpo de conteúdo (as perguntas reais viram dicas).
-- RLS ligado SEM políticas: só a service role (edge function) lê e escreve.

create table public.babygpt_perguntas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  pergunta text not null,
  resposta text,
  ip text,
  origem text
);

alter table public.babygpt_perguntas enable row level security;

create index babygpt_perguntas_ip_criado_em on public.babygpt_perguntas (ip, criado_em);
create index babygpt_perguntas_criado_em on public.babygpt_perguntas (criado_em);

-- ROLLBACK:
-- drop table public.babygpt_perguntas;
