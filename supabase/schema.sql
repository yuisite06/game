-- Rode no SQL Editor do Supabase.
create table if not exists public.cards (
  id          bigint generated always as identity primary key,
  mural_id    text unique not null,          -- 'mural-1', 'mural-2', 'mural-3'
  title       text not null,                 -- nome da obra
  artist      text not null,                 -- nome do artista
  text        text not null,                 -- trajetória / contexto
  image_url   text,                          -- foto da obra (com crédito)
  question    text,
  options     jsonb,                         -- ["opção A","opção B","opção C"]
  answer      int                            -- índice da resposta certa (0,1,2)
);
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz default now(),
  player_name text,
  rating      int,
  comment     text
);
alter table public.cards    enable row level security;
alter table public.feedback enable row level security;
create policy "cards: leitura publica"      on public.cards    for select using (true);
create policy "feedback: qualquer um envia" on public.feedback for insert with check (true);
