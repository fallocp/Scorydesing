# ADR-0005: Migración de datos y Storage

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** el usuario (todos los datos históricos y todos los objetos). Detalle técnico delegado.

## Decisión

### Ensayo y definitiva

Primero un **ensayo** completo contra el local (se puede repetir: la base local se recarga), después la **copia definitiva**. El compartido queda intacto en ambos casos.

### Lectura del origen (solo lectura)

- Dump **data-only** de las tablas en alcance (`docs/MIGRATION_SCOPE.md` §2.1) con la imagen `postgres:17` (`pg_dump`/`psql`).
- Conexión con `default_transaction_read_only=on`; consultas de verificación dentro de `BEGIN READ ONLY … ROLLBACK`.
- Credencial **fuera del repo**: `F:\ScoryDesign-ops\shared-readonly.env`. Nunca en `.env` de la app, código, logs ni salida impresa.
- IdP: solo las filas del snapshot (ADR-0004), filtradas por el UUID del dueño y sus 3 negocios.
- Objetos de Storage: listar y descargar (solo GET) desde el compartido con una credencial también fuera del repo; subir al local conservando bucket y path.

### Carga local

- Orden respetando FKs: IdP (`business_tenants`, `user_business_memberships`, `profiles`) → tablas padre (`commercial_branches`, `industry_verticals`, `market_moments`, …) → hijas.
- `SET session_replication_role = replica` **solo en la sesión de carga local**, para que triggers y FKs no transformen ni rechacen el histórico; se vuelve a `origin` al terminar y se valida integridad referencial con consultas.
- Secuencias ajustadas a `max(id)` (la auditoría no encontró identity ni secuencias en las 62 tablas; se confirma con el dump).
- Después de la verificación cruda: reescritura de URLs (ADR-0003).

### Verificación

- Por tabla: conteo y checksum `md5` de las filas ordenadas por PK, **iguales al origen**, calculados antes de reescribir URLs.
- Después de reescribir: 0 ocurrencias del host compartido y el número de URLs reescritas igual al contado en el origen (2,712 en la auditoría).
- Por bucket: número de objetos y bytes iguales al origen.
- Integridad: 0 filas huérfanas en las FKs.

### Congelamiento

Durante la copia definitiva el usuario deja de escribir en la app contra el compartido. Al terminar, la app sigue contra el compartido hasta la Fase 7.

## Consecuencias

- Se necesita espacio: ≈775 MB de tablas y ≈1.73 GiB de objetos dentro del disco de Docker, más los archivos temporales del dump fuera del repo (en F:).
- Scripts y salidas crudas viven fuera del repo; los scripts reutilizables que no tienen credenciales pueden entrar al repo en `scripts/`.
- Si el ensayo muestra diferencias, se corrige el baseline con una migración nueva y se repite el ensayo; nunca se edita una migración aplicada.
