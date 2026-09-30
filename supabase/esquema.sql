-- ============================================================================
-- Mapa de Evacuación — esquema de base de datos (Supabase)
-- Spec §7, §8 y §9. Correr UNA vez en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr sin romper nada (usa IF NOT EXISTS / OR REPLACE).
--
-- Modelo de permisos:
--   anon          = cualquier persona con la app usuario (solo lee; solo inserta pedidos de ayuda)
--   authenticated = operador (las cuentas se crean a mano; el registro público está desactivado)
--   Nadie borra filas: se desactivan (activa/activo = false) para dejar rastro.
-- ============================================================================

-- ---------------------------------------------------------------- Tablas

create table if not exists public.alertas (
  id             uuid primary key default gen_random_uuid(),
  zona           text not null,                         -- id de zona del catálogo (p. ej. 'vina')
  amenaza        text not null,                         -- id de amenaza (p. ej. 'tsunami')
  mensaje        text not null default '',
  simulacro      boolean not null default true,
  activa         boolean not null default true,
  vigente_hasta  timestamptz not null default now() + interval '2 hours',
  autor          text default (auth.jwt() ->> 'email'),
  creada         timestamptz not null default now(),
  cancelada      timestamptz
);
create index if not exists alertas_activas on public.alertas (activa, vigente_hasta);

create table if not exists public.elementos_operador (
  id             uuid primary key default gen_random_uuid(),
  zona           text not null,
  amenaza        text not null default 'todas',         -- id de amenaza o 'todas'
  rol            text not null check (rol in ('ruta', 'punto_encuentro', 'area_peligro', 'bloqueo')),
  geometria      jsonb not null,                        -- geometría GeoJSON (LineString, Point, Polygon)
  nombre         text,
  motivo         text not null check (length(trim(motivo)) > 0),
  fuente         text not null check (length(trim(fuente)) > 0),
  autor          text default (auth.jwt() ->> 'email'),
  creado         timestamptz not null default now(),
  vigente_hasta  timestamptz,                           -- null = permanente
  activo         boolean not null default true
);
create index if not exists elementos_por_zona on public.elementos_operador (zona, activo);

create table if not exists public.desactivaciones_oficiales (
  id                   uuid primary key default gen_random_uuid(),
  zona                 text not null,
  amenaza              text not null,
  id_elemento_oficial  text not null,                   -- p. ej. el código 'name' de la vía SENAPRED
  motivo               text not null check (length(trim(motivo)) > 0),
  autor                text default (auth.jwt() ->> 'email'),
  creado               timestamptz not null default now(),
  activa               boolean not null default true
);

create table if not exists public.solicitudes_ayuda (
  id           uuid primary key default gen_random_uuid(),
  alerta_id    uuid not null references public.alertas (id) on delete cascade,
  lat          double precision not null,
  lng          double precision not null,
  precision_m  real,
  nombre       text,
  telefono     text,
  mensaje      text,
  estado       text not null default 'necesita_ayuda'
               check (estado in ('necesita_ayuda', 'evacuando', 'a_salvo', 'atendida')),
  creada       timestamptz not null default now()
);

create table if not exists public.auditoria (
  id           bigserial primary key,
  tabla        text not null,
  accion       text not null,
  registro_id  uuid,
  autor        text,
  cuando       timestamptz not null default now(),
  datos        jsonb
);

-- ---------------------------------------------------------------- Auditoría automática

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (tabla, accion, registro_id, autor, datos)
  values (tg_table_name, tg_op, new.id, auth.jwt() ->> 'email', to_jsonb(new));
  return new;
end $$;

drop trigger if exists auditar on public.alertas;
create trigger auditar after insert or update on public.alertas
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditar on public.elementos_operador;
create trigger auditar after insert or update on public.elementos_operador
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditar on public.desactivaciones_oficiales;
create trigger auditar after insert or update on public.desactivaciones_oficiales
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------- Seguridad (RLS)

alter table public.alertas                   enable row level security;
alter table public.elementos_operador        enable row level security;
alter table public.desactivaciones_oficiales enable row level security;
alter table public.solicitudes_ayuda         enable row level security;
alter table public.auditoria                 enable row level security;

-- Lectura pública de lo que la app usuario necesita
drop policy if exists "leer alertas" on public.alertas;
create policy "leer alertas" on public.alertas for select to anon, authenticated using (true);

drop policy if exists "leer elementos" on public.elementos_operador;
create policy "leer elementos" on public.elementos_operador for select to anon, authenticated using (true);

drop policy if exists "leer desactivaciones" on public.desactivaciones_oficiales;
create policy "leer desactivaciones" on public.desactivaciones_oficiales for select to anon, authenticated using (true);

-- Escritura solo para operadores autenticados
drop policy if exists "operador crea alertas" on public.alertas;
create policy "operador crea alertas" on public.alertas for insert to authenticated with check (true);
drop policy if exists "operador edita alertas" on public.alertas;
create policy "operador edita alertas" on public.alertas for update to authenticated using (true) with check (true);

drop policy if exists "operador crea elementos" on public.elementos_operador;
create policy "operador crea elementos" on public.elementos_operador for insert to authenticated with check (true);
drop policy if exists "operador edita elementos" on public.elementos_operador;
create policy "operador edita elementos" on public.elementos_operador for update to authenticated using (true) with check (true);

drop policy if exists "operador crea desactivaciones" on public.desactivaciones_oficiales;
create policy "operador crea desactivaciones" on public.desactivaciones_oficiales for insert to authenticated with check (true);
drop policy if exists "operador edita desactivaciones" on public.desactivaciones_oficiales;
create policy "operador edita desactivaciones" on public.desactivaciones_oficiales for update to authenticated using (true) with check (true);

-- Pedidos de ayuda: cualquiera puede enviar uno, solo durante una alerta vigente; solo el operador los ve
drop policy if exists "enviar ayuda" on public.solicitudes_ayuda;
create policy "enviar ayuda" on public.solicitudes_ayuda for insert to anon, authenticated
  with check (exists (
    select 1 from public.alertas a
    where a.id = alerta_id and a.activa and a.vigente_hasta > now()
  ));
drop policy if exists "operador ve ayuda" on public.solicitudes_ayuda;
create policy "operador ve ayuda" on public.solicitudes_ayuda for select to authenticated using (true);
drop policy if exists "operador actualiza ayuda" on public.solicitudes_ayuda;
create policy "operador actualiza ayuda" on public.solicitudes_ayuda for update to authenticated using (true) with check (true);

drop policy if exists "operador ve auditoria" on public.auditoria;
create policy "operador ve auditoria" on public.auditoria for select to authenticated using (true);

-- ---------------------------------------------------------------- Tiempo real

do $$
declare t text;
begin
  foreach t in array array['alertas', 'elementos_operador', 'desactivaciones_oficiales', 'solicitudes_ayuda'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- Pendiente (última feature, spec §8)
-- Borrado automático de solicitudes_ayuda 24 h después del fin de la alerta: se agrega con pg_cron
-- cuando se implemente el botón de ayuda.
