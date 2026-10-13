# ADR-0003: Storage local

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** el usuario (se migran todos los objetos). Detalle técnico delegado.

## Contexto

ScoryDesign tiene 6 buckets en el compartido con 1,582 objetos (≈1.73 GiB). En la base hay 2,712 URLs del Storage compartido en 14 tablas: `design-images` 2,296 y `Brand` 416 (123 públicas y 293 firmadas). Hay 7 archivos de código con URLs firmadas de `Brand`.

## Decisión

- **Mismos 6 buckets, misma visibilidad**, creados por migración: `design-images` y `Brand` públicos; `desaing-assets`, `desaing-materials`, `desaing-conversation-references` y `brand-assets` privados. Mismos límites y MIME del desplegado.
- **Policies de `storage.objects` equivalentes**: las 16 del repo y las 3 de `design-images` que solo existen desplegadas (paridad; se endurecen después). No se crean las de `design-mockups` (bucket inexistente).
- **Objetos copiados** conservando bucket y path (y `owner` cuando sea el dueño; los de service role quedan sin owner). Verificación por bucket: objetos y bytes iguales al origen (ADR-0005).
- **Reescritura de URLs guardadas** (Fase 5):
  - host del compartido → URL local `http://127.0.0.1:55321` (puerto de la API local);
  - URLs firmadas (`/object/sign/`) de buckets públicos (`Brand`) → `/object/public/` sin token, porque los tokens del compartido no validan con el JWT secret local;
  - aplica dentro de texto, HTML y JSON en las 14 tablas.
- Las 7 URLs firmadas escritas en código se cambian en Fase 7.
- El script de reescritura es **reutilizable** (origen y destino por parámetro): al ir a un servidor propio habrá que reescribir otra vez.

## Consecuencias

- `pipeline-renders` y `templates` no se crean: no existen en el compartido.
- `design-images` y `Brand` siguen públicos y sin límite hasta el endurecimiento (`docs/MIGRATION_SCOPE.md` §6).
- La reescritura cambia los checksums: se verifica primero la carga cruda contra el origen y después se cuentan las URLs reescritas (ADR-0005).
- `file_size_limit` global de la CLI en 50 MiB. La auditoría no registró el objeto más grande; Fase 5 lo mide en el origen y sube el límite si hace falta.
