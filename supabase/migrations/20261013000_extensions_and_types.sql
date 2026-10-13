-- Baseline 000: schemas, extensiones y tipos
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: schema desaing_private y enum public.user_role (usado por public.user_roles.role).
-- Desviaciones: ninguna extensión nueva: los objetos en alcance solo usan funciones nativas (gen_random_uuid, clock_timestamp, now) y plpgsql/sql; pgcrypto y uuid-ossp ya vienen en el Supabase local. No se instalan pg_cron, pg_net ni unaccent (MarketXending).
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
--
-- Name: desaing_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA desaing_private;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'user'
);
