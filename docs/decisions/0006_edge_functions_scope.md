# ADR-0006: Alcance de Edge Functions locales

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** delegada por el usuario.

## Contexto

Hay 35 funciones en `supabase/functions` y 56 desplegadas. De las 9 duplicadas con MarketXending, solo `generate-design-image` y `generate-design-html` se alcanzan desde rutas; las otras 7 son indeterminables. `branch-chat` solo existe en MarketXending. `import-design-reference` y `render-design-preview` están desplegadas sin código en el repo.

## Decisión

- El edge runtime local sirve la carpeta `supabase/functions` **completa** (`[edge_runtime] enabled = true`).
- **Prueba dedicada** en Fase 6 para `generate-design-image`, `generate-design-html` y las que `src` invoca (`docs/MIGRATION_SCOPE.md` §2.6).
- **Las 7 duplicadas indeterminables** quedan en el repo y se sirven, sin prueba dedicada.
- **`branch-chat`**: se copia en solo lectura desde `E:\MarketXending\supabase\functions\branch-chat` en Fase 6 **solo si** `useBranchChat` es alcanzable desde una ruta. Hoy no lo es (lo importan `CopyWorkstation`, desruteado, y `BranchBrainstorm`, sin importador).
- **`import-design-reference` y `render-design-preview`**: si `src` las invoca, en Fase 6 se descarga su código a una carpeta **fuera del repo** para revisarlo antes de traerlo. Hoy `src` no las invoca (grep del 13-10-2026): quedan fuera.
- **Secretos**: `supabase/functions/.env` (ignorado por git) con los valores locales; `supabase/functions/.env.example` solo con nombres. Ningún valor del compartido se copia sin decisión del usuario (por ejemplo `OPENAI_API_KEY` lo pone él).
- `DESAING_PILOT_SUPABASE_ORIGIN` se ajusta en Fase 6: dentro del edge runtime `SUPABASE_URL` es la URL interna.
- **`verify_jwt`**: local igual al `config.toml` del repo, salvo `render-design-png`, que pasa a `true` en local (hoy `false` en el repo y `true` desplegado). Motivo: usa service role sin `getUser`, y quienes la llaman (`pipeline-orchestrator/lib/executeStep.ts:165`, `render-multichannel/index.ts:230`) reenvían el header `Authorization` del usuario, que ya exigen. El cambio se hace en Fase 6 junto con su prueba; en Fase 3 las secciones `[functions.*]` quedan idénticas.

## Consecuencias

- Las funciones que dependen de `RENDER_SERVICE_URL`, `pipeline-renders` o `templates` seguirán fallando en local, igual que en el compartido.
- `OPENAI_API_KEY` local genera costo real: las pruebas de Fase 6 se limitan a una llamada por función usada.
- Nada se despliega: `functions deploy` está prohibido (ADR-0001).
