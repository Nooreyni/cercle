-- Cercle sync schema (applied to the Supabase project "cercle", eu-west-3).
-- The table is closed to the API; clients only call cercle_sync with their pairing key.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cercle_people (
  space text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  server_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (space, id)
);
create index if not exists cercle_people_space_server_at on public.cercle_people (space, server_at);

alter table public.cercle_people enable row level security;
revoke all on public.cercle_people from anon, authenticated;

-- Single entry point. The pairing key never reaches the table: rows are filed under its SHA-256.
-- Last writer wins per person, compared on the client's updated_at.
create or replace function public.cercle_sync(p_key text, p_since timestamptz default null, p_changes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space text;
  v_now timestamptz := clock_timestamp();
  c jsonb;
  v_rows jsonb;
begin
  if p_key is null or length(p_key) < 24 or length(p_key) > 128 then
    raise exception 'invalid key';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 500 then
    raise exception 'invalid changes';
  end if;
  v_space := encode(extensions.digest(p_key, 'sha256'), 'hex');

  if jsonb_array_length(p_changes) > 0
     and (select count(*) from public.cercle_people where space = v_space) > 5000 then
    raise exception 'space full';
  end if;

  for c in select value from jsonb_array_elements(p_changes) loop
    if (c->>'id') is null or length(c->>'id') > 200 or octet_length(c::text) > 200000 then
      continue;
    end if;
    insert into public.cercle_people as t (space, id, data, updated_at, server_at, deleted)
    values (v_space, c->>'id', coalesce(c->'data', '{}'::jsonb),
            coalesce((c->>'updated_at')::timestamptz, v_now), v_now,
            coalesce((c->>'deleted')::boolean, false))
    on conflict (space, id) do update
      set data = excluded.data, updated_at = excluded.updated_at,
          server_at = excluded.server_at, deleted = excluded.deleted
      where t.updated_at < excluded.updated_at;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'updated_at', updated_at, 'deleted', deleted)), '[]'::jsonb)
    into v_rows
    from public.cercle_people
   where space = v_space and (p_since is null or server_at > p_since);

  return jsonb_build_object('now', v_now, 'rows', v_rows);
end
$$;

revoke all on function public.cercle_sync(text, timestamptz, jsonb) from public;
grant execute on function public.cercle_sync(text, timestamptz, jsonb) to anon, authenticated;
