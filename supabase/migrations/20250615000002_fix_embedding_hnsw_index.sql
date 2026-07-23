-- Repair migration: replace HNSW index with IVFFlat (works on all Supabase pgvector versions).
-- Safe to run if you already created an IVFFlat index manually in the SQL editor.

drop index if exists public.tools_embedding_idx;

create index if not exists tools_embedding_idx
  on public.tools
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 4);

create or replace function public.match_tools(
  query_embedding extensions.vector(384),
  match_threshold float default 0.5,
  match_count int default 50,
  filter_type text default null
)
returns table (
  id uuid,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    t.id,
    1 - (t.embedding <=> query_embedding) as similarity
  from public.tools t
  where t.embedding is not null
    and (filter_type is null or t.type::text = filter_type)
    and (t.embedding <=> query_embedding) <= (1 - match_threshold)
  order by t.embedding <=> query_embedding asc
  limit least(match_count, 200);
end;
$$;

grant execute on function public.match_tools(
  extensions.vector(384),
  float,
  int,
  text
) to anon, authenticated;
