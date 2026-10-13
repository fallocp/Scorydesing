# ADR-0004: Login por fases con un solo usuario

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** el usuario (login por fases, mismo UUID). Detalle técnico delegado.
- **Desvía temporalmente de:** `F:\agents-finmarket\docs\decisions\0006_independent_supabase_identity_bridge.md`.

## Contexto

El frontend usa `supabase-js` directo con RLS basada en `auth.uid()` (unos 220 accesos). La auditoría confirmó la condición de un solo usuario: 1 UUID en todas las columnas de usuario, presente en `auth.users`, owner de los 3 negocios; 0 filas y 0 objetos de otros usuarios.

## Decisión

- **Auth local con un solo usuario**: el dueño, con el **mismo UUID** que en MarketXending y el mismo email. Así `user_id`, `created_by`, `actor_id` y las policies con `auth.uid()` funcionan sin reescribir el frontend.
- **Contraseña local nueva**, distinta a la del compartido. No se copian hashes ni identidades del compartido. El valor vive fuera del repo.
- **Snapshot mínimo IdP**: 3 filas de `business_tenants`, 3 de `user_business_memberships` y 1 de `profiles`. `user_roles` y `extended_user_roles` solo si una función o policy en alcance las lee (se comprueba en Fase 4); hoy no se copian.
- `raw_app_meta_data` del usuario local: solo lo que escribe `set_active_business` (negocio activo), que la app vuelve a fijar al iniciar sesión.
- **Registro público deshabilitado** (`enable_signup=false`) y anónimos apagados. El usuario se crea en Fase 5 con la API admin del Auth local o, si no acepta el UUID, con SQL local en `auth.users` y `auth.identities`.
- Es una **desviación temporal** de agents-finmarket ADR-0006 (MarketXending como IdP externo por API, sin copiar usuarios ni negocios).

## Gate obligatorio antes de agregar usuarios

Antes de crear un segundo usuario en local:

1. Decidir entre **puente con MarketXending** (IdP externo, IDs opacos, como ADR-0006) y **Auth propio** con usuarios de ScoryDesign.
2. Corregir `src/components/AuthGate.tsx:37-38`: `VITE_AUTH_EMAIL`/`VITE_AUTH_PASSWORD` quedan en el bundle.
3. Revisar las policies del IdP (R5) y el backlog de endurecimiento.

## Consecuencias

- Las escrituras de la app en `business_tenants` y `user_business_memberships` quedan solo en local.
- Las FKs a `auth.users` e IdP se conservan (ADR-0002).
- Sesiones de local y compartido no se pisan: la clave de `localStorage` es por proyecto.
