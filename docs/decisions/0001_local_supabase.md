# ADR-0001: Supabase local propio de ScoryDesign

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** el usuario (solo local, sin hosted, nada se borra). Detalle técnico delegado.

## Contexto

ScoryDesign comparte hoy un proyecto Supabase con MarketXending: base, Auth, Storage y Edge Functions. La auditoría (`docs/DEPLOYED_SCHEMA_AUDIT.md`) muestra drift fuerte entre repo y desplegado, 9 funciones duplicadas que se pisan entre repos y policies del compartido que dejan a usuarios de MarketXending subir o borrar en `design-images`.

## Decisión

- La Supabase CLI local en Docker es la **única** base de ScoryDesign. Su PostgreSQL integrado es la base; no se agrega otro Postgres.
- `project_id = "scorydesign"`; puertos 55320-55329 para convivir con agents-finmarket (54320-54329).
- Red externa `scorydesign-supabase-local` con `host_binding_ipv4=127.0.0.1` y regla de Windows Firewall `scorydesign - Supabase local only` que bloquea 55320-55329 desde LAN e Internet.
- CLI fijada como devDependency (`supabase@2.117.0`, la misma de agents-finmarket).
- El Supabase compartido queda **intacto** como respaldo de solo lectura. No se borra, revoca ni redespliega nada en él. Prohibido `db push`, `migration repair`, `functions deploy`, `secrets set` y cualquier `--linked` o `--project-ref` contra el compartido.

## Producción

La CLI no es un entorno de producción. Un servidor propio futuro es **otro plan**, con su propia decisión: Supabase self-hosted con el compose oficial o un proyecto hosted exclusivo de ScoryDesign. Ese plan parte del ledger propio (ADR-0002) y vuelve a reescribir las URLs de Storage (ADR-0003).

## Consecuencias

- Ownership claro: schema, Storage y funciones solo de ScoryDesign.
- Los volúmenes de Docker son la única copia de los datos nuevos: nunca `docker compose down -v`, `supabase stop --no-backup`, `docker volume rm` ni `docker system prune`. Backup con restore probado en Fase 8.
- Más RAM y disco en la máquina. El disco de Docker Desktop debe vivir en F: (C: no tiene espacio).
- Sin acceso desde otros equipos: todo en 127.0.0.1.
