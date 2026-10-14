# Reporte de cambio de la app al Supabase local (Fases 6 y 7)

- Fecha: 14-10-2026. Rama `feat/own-local-supabase`.
- Destino: Supabase local `scorydesign` (API `http://127.0.0.1:55321`). El compartido no se tocó: ni `link`, ni `deploy`, ni `secrets set`. Tampoco se descargó código de funciones (ver §1.3).
- Este documento no trae secretos, keys, UUIDs, emails ni el ref del compartido. Los scripts y las salidas crudas están fuera del repo, en `F:\ScoryDesign-ops\phase6\`.

## 1. Fase 6: Edge Functions locales

### 1.1 Secretos

`supabase/functions/.env` (ignorado por git, `.gitignore:26`) lo carga el edge runtime al arrancar. `supabase/functions/.env.example` lista solo los nombres, agrupados por función. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` los inyecta el runtime local.

| Nombre | Estado | Origen |
|---|---|---|
| OPENAI_API_KEY | encontrado | no estaba en ningún `.env` local de la app; lo puso el usuario |
| DESAING_SERVER_ENABLED | encontrado | `.env.desaing-server.local` |
| DESAING_ALLOWED_ORIGINS | encontrado | `.env.desaing-server.local` + `http://127.0.0.1:3000`, `http://localhost:3000` |
| DESAING_UI_GENERATION_ENABLED, DESAING_UI_EXECUTOR | encontrados | `.env.desaing-ui.local` |
| DESAING_EXPLORATION_ENABLED | encontrado | `.env.desaing-exploration.local` |
| DESAING_PROMPT_ADMIN_ENABLED | encontrado | igual a `VITE_DESAING_PROMPT_ADMIN_ENABLED` (`.env.development.local`) |
| DESAING_PILOT_SUPABASE_ORIGIN | fijado | `http://kong:8000` (el `SUPABASE_URL` interno del runtime local; ADR-0006) |
| DESAING_PILOT_ENABLED | fijado | `false`: el token y el origen del piloto son del compartido y no se copian |
| DESAING_PILOT_TOKEN/BUSINESS_ID/ACTOR_ID/POLICY_ID/EXPIRES_AT_MS | no se ponen | del compartido; con el piloto apagado no hacen falta |
| SCORY_PUBLIC_SUPABASE_URL | nuevo | `http://127.0.0.1:55321`: URL pública del logo `Brand` en `generate-design-html` (§3) |
| COPY_KIT_SOURCE, COPY_MODEL, COPY_V2_MODEL, MASTER_IMAGE_PROMPT_SOURCE, MASTER_IMAGE_PROMPT_VERSION, PHOTO_STYLE, SLIDE_MODEL, SLIDE_FIX_MODEL, SLIDE_REVIEW_MODEL, TRANSLATE_MODEL | sin valor (default del código) | `code`, `gpt-4o`, `gpt-5.4-mini`, `code`, `v2`, `editorial_v2`, `gpt-5.4-mini`, `gpt-5.4-mini`, `SLIDE_FIX_MODEL`, `gpt-4o` |
| RENDER_SERVICE_URL, RENDER_SERVICE_TOKEN | sin valor | `render-design-png` responde 503 `render_service_unavailable`, igual que en el compartido (§2.4) |

### 1.2 Imports: arreglo necesario para que arranquen

Con el primer arranque, 32 de las 35 funciones respondían `503 BOOT_ERROR`: `https://esm.sh/@supabase/supabase-js@2.53.0` pide `@supabase/storage-js@^2.10.4`, hoy esm.sh lo resuelve a una versión cuyos tipos no existen (`Module not found .../storage-js@2.99.1/dist/module/StorageClient`), y el runtime local no arma el grafo de módulos. En el compartido no pasa porque cada función quedó empaquetada cuando se desplegó.

Se fijó la dependencia en el mismo import: `https://esm.sh/@supabase/supabase-js@2.53.0?deps=@supabase/storage-js@2.10.4` (55 imports en 55 archivos de `supabase/functions`). La versión de supabase-js no cambia. Se probó primero un import map, pero el runtime local resuelve los imports de los `.d.ts` de esm.sh sin pasar por él.

### 1.3 Funciones que no se traen

| Función | Decisión | Evidencia |
|---|---|---|
| branch-chat | no se copia | `useBranchChat` lo importan solo `CopyWorkstation` (desde `CampaignWizardPage`, sin ruta en `App.tsx`) y `BranchBrainstorm` (sin importador) |
| import-design-reference, render-design-preview | no se descargan | 0 llamadas desde `src`. La importación de referencias y el preview de diseño van al renderer (`rendererTransport.ts`, `localhost:3333`), no a Edge Functions |

### 1.4 verify_jwt

Igual al desplegado. El único cambio es `render-design-png`: `false` → `true` (ADR-0006, nota de Fase 6). Sin `Authorization` el gateway local responde 401 `UNAUTHORIZED_NO_AUTH_HEADER`.

### 1.5 Pruebas contra el local

Solo se reiniciaron los contenedores del stack con `npm run supabase:stop` / `supabase:start`, que conservan los volúmenes. Se usó el JWT del usuario local (password grant) y la anon key local. El env del runtime no tiene ningún valor del host compartido.

| Función | Prueba | Resultado |
|---|---|---|
| generate-design-html | `xending-slide`, 1 llamada a OpenAI (script) | 200, HTML de 1,858 caracteres, sin host compartido |
| generate-design-html | 1 llamada a OpenAI desde la app (navegador, §2.5) | 200, HTML de 3,127 caracteres; logo en `http://127.0.0.1:55321/storage/v1/object/public/Brand/…`; fila nueva en `presentations` local (8 → 9) |
| generate-design-image | `mode: prompts` (solo texto, 1 llamada; sin imagen para no pagar generación) | 200, `promptFinal` de 1,148 caracteres |
| translate-text | `["Hola mundo"]`, 1 llamada | 200, `Hello world` |
| desaing-server | `read` con JWT / solo anon | 200 (`enabled=false` en la política del negocio) / 401 |
| desaing-state | `read` con JWT / solo anon | 200 / 401 |
| render-design-png | sin Authorization | 401 (verify_jwt=true) |
| Las 35 del repo | smoke de arranque: POST con cuerpo no JSON | 35/35 arrancan: 4xx controlado en 29; 503 `pilot_disabled` en desaing-pilot; 500 por `req.json()` sin try en analyze-brand-assets, evolution-summary, generate-design-html, hydrate-templates, interpret-feedback y validate-claim (comportamiento del handler, no error de import) |

Efectos en el local: las pruebas por script no escribieron filas (`desaing_audit`, `desaing_explorations`, `design_mockups`, `presentations` y `storage.objects` iguales antes y después). La prueba de navegador agregó 1 fila de `presentations` ("QA local cutover (prueba, se puede borrar)"). En el compartido no se escribió nada.

Costo de IA: 4 llamadas de texto (2 de generate-design-html, 1 de generate-design-image solo con prompt y 1 de translate-text) en modelos mini/4o, todas chicas: menos de USD 0.10 en total (estimado; no se leyó el uso en la cuenta). No se generaron imágenes.

## 2. Fase 7: app contra el local

### 2.1 Modo de Vite

- `.env.localsupabase` (ignorado, `.gitignore:10`) se genera con un script, sin imprimir valores. Lleva `VITE_SUPABASE_URL=http://127.0.0.1:55321`, la anon key local y las 7 flags `VITE_DESAING_*` copiadas de `.env` y `.env.development.local`. Vacía lo que `.env` trae del compartido, porque Vite carga `.env` en todos los modos: `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_EMAIL`, `VITE_AUTH_PASSWORD`; `VITE_SUPABASE_PROJECT_ID=scorydesign`. Los nombres están en `.env.localsupabase.example`.
- Con el loader de Vite: `localsupabase` resuelve URL local, una anon key emitida por el local y 0 valores del compartido. `development` y `production` (`npm run dev`, `npm run build`) siguen con el host compartido, igual que antes.
- Scripts: `dev:local` (renderer + Vite en `--mode localsupabase`), `dev:local:shared` (el `dev:local` anterior, contra el compartido) y `build:local`.

### 2.2 AuthGate

Sin `VITE_AUTH_*` la app muestra el formulario de login actual (`signInWithPassword`) y entra con el usuario local. No hizo falta tocar el componente. Detalle en ADR-0004.

### 2.3 URLs del Storage en código

- `src/lib/supabaseStorageUrl.ts`: `publicStorageUrl(bucket, path)` arma la URL con `VITE_SUPABASE_URL`, y `XENDING_BRAND_LOGO_URL` es el logo de `Brand`.
- Las 7 URLs firmadas de `Brand` ahora son públicas y salen de la URL configurada: 6 en `src` (`bulletinTemplates`, `designTemplates`, `presentationTemplates`, `presentationTemplates_v2`, `buildFxDailyHtml`, `buildNewsSlideHtml`) y 1 en `generate-design-html`, que usa `SCORY_PUBLIC_SUPABASE_URL` y si no existe `SUPABASE_URL`. En el compartido no está definida, así que queda la URL pública de su propio host.
- Además: 2 URLs públicas de `design-images` en `presentationTemplates_v2.ts` (mapa de portada y foto hero) y el fixture del pin de origen en `liveExecution.test.ts`, que se cambió a un host neutro.
- Los 3 objetos existen en el local: HEAD 200 `image/png`.
- Sin cambiar: los scripts de `scripts/desaing/` (smokes y deploy del compartido; fuera de alcance, no se ejecutan).

### 2.4 Slides con imágenes locales (arreglo)

En la prueba de navegador, los slides de Presentaciones no mostraban imágenes. El CSP de los iframes (`sanitizePresentationHtml`) solo permitía `img-src https:`, y el local sirve Storage por `http://127.0.0.1:55321`.

- `src/lib/presentations/presentationHtml.ts`: agrega a `img-src` solo el origen de `VITE_SUPABASE_URL` cuando es `http:` en `127.0.0.1` o `localhost`. Con el compartido (`https:`) el CSP no cambia.
- `renderer/scripts/design-preview.js`: el preview del renderer (`fetchPublic`) rechaza HTTP y direcciones de loopback, a propósito. En desarrollo, y solo si existe `SCORY_LOCAL_SUPABASE_URL`, deja pasar GET de `/storage/v1/object/public/` de ese único origen de loopback, y suma ese origen a su CSP. Con `NODE_ENV=production`, sin la variable o con un host que no es de loopback, el guard queda igual que antes (probado). `scripts/dev-local.mjs` pasa la variable solo en `--mode localsupabase`.
- Nota: mientras se trabajaba, otro proceso editó `presentationHtml.ts` con una variante (`storageImageSource`) que permitía cualquier origen `http:`. Se dejó una sola función, la de loopback.

### 2.5 Pruebas

Auth (script con el `@supabase/supabase-js` del repo, 2.105.4):

| Prueba | Resultado |
|---|---|
| Login con password | OK; REST 200 |
| `refreshSession` | OK: access y refresh token nuevos; REST 200 |
| `signOut` y luego el refresh token | 400 `refresh_token_not_found`; el primer refresh token también se rechaza |
| JWT vencido firmado con el JWT secret local | REST 401 `JWT expired`; el cliente con esa sesión guardada da `getSession()` null y `getUser()` con error: no autenticado |

Navegador (Puppeteer de `renderer/node_modules`; Playwright no está en el repo). Vite en `--mode localsupabase` en un puerto libre (3003), porque el `npm run dev` del usuario ocupa el 3000 contra el compartido y no se tocó:

| Paso | Resultado |
|---|---|
| Login con el formulario (usuario local) | OK; la sesión se guarda como `sb-127-auth-token`, separada de la del compartido |
| `/design-studio` | 9 imágenes de Storage local, 0 fallidas |
| `/presentations` | 5 imágenes locales en los slides, 0 fallidas (después de §2.4) |
| `/content-library` | carga |
| `/assets` | 54 imágenes locales, 0 fallidas |
| Generar 1 diseño (generate-design-html desde la app) y guardarlo en `presentations` | OK (§1.5) |
| Logout | la app vuelve al formulario de login. No tiene botón de cerrar sesión: se usó `supabase.auth.signOut()` del cliente de la app |
| Red | 0 requests al host compartido y 0 a cualquier `*.supabase.co` (2,937 en la 1.ª corrida y 2,507 en la 2.ª) |

Capturas: `artifacts/local-supabase-qa/01-login-form.png` a `08-after-logout.png` (carpeta ignorada por git). En la captura del login no se ven credenciales: se tomó antes de escribirlas.

### 2.6 Renderer: sin contenedor

No hace falta `compose.yaml`. `RENDER_SERVICE_URL` solo lo usa `render-design-png`, que se alcanza desde `pipeline-orchestrator` y `render-multichannel`, y estos desde código sin ruta (`CampaignWizardPage`/`CopyWorkstation`). Las rutas usan el renderer del host (`npm run dev:local` lo levanta en `127.0.0.1:3333`) para previews, referencias y exportación. En local, `render-design-png` sigue respondiendo 503, igual que en el compartido.

## 3. Verificación final

Se corrió una sola vez al final (resultados en §5):

- Tests de los archivos tocados: `src/lib/presentations` y `supabase/functions/_shared` con vitest; renderer `design-preview.test.js` con node:test.
- Suite completa de vitest, `validate:structure`, lint (se confirma que no hay errores nuevos sobre los 13 que ya existían en 9 archivos), `type-check`, `supabase db lint` local y `deno check` de las funciones tocadas.
- Escaneo de los archivos trackeados nuevos o modificados: sin secretos, keys, ref ni host compartido.

Resultados: §5.

## 4. Cómo volver

- App al compartido: `npm run dev` (sin cambios) o `npm run dev:local:shared`. `.env` no se modificó.
- Funciones: revertir el commit de Fase 6. El cambio de `?deps=` no altera la versión de supabase-js; solo fija storage-js.
- La fila de QA en `presentations` local se puede borrar desde la app.

## 5. Resultados de la verificación final

| Verificación | Resultado |
|---|---|
| Tests de los archivos tocados (vitest: `src/lib/presentations`, `src/constants`, `src/utils/design-studio`, `_shared` de funciones; renderer `design-preview.test.js`) | Pasan, salvo `designConversationRemote.test.ts`, que ya fallaba (§ siguiente). `addSlide.browser.test.ts` falló con el helper nuevo porque `import.meta.env` no existe en un bundle de esbuild; se corrigió con `import.meta.env?.` y pasa. Renderer: 4/4 |
| Suite completa (`npm test`) | 3,795 pasan; 10 tests en 14 archivos fallan. Los mismos fallan en `HEAD` sin estos cambios (worktree temporal): tests de PGlite que leen `supabase/migrations/2026091*` (archivadas en `b8864a7`), 4 de `pilotHttp`, 4 de `serverGeneration`, 1 de `htmlBackend`, 1 de `materialsBackend` y la demo de `docs/UI-handoffv2` |
| `validate:structure` | OK |
| `lint` | 13 errores en 9 archivos, los mismos de antes; 0 nuevos |
| `type-check` | OK |
| `supabase db lint --local` | `No schema errors found` |
| `deno check` (deno local) | OK: generate-design-html, generate-design-image, translate-text, desaing-state. Quedan 3 errores de tipos en líneas sin tocar de desaing-server (`statusCode` en `StorageError`) y render-design-png (genérico de `SupabaseClient`). En `HEAD` esas funciones ni siquiera resolvían los tipos de esm.sh. El runtime las arranca y responde (§1.5) |
| Escaneo de los archivos nuevos y modificados | 0 coincidencias (ref, host compartido, JWT, `sk-`, `sb_*`, anon/service locales, email, contraseña, UUID del dueño). `.env.localsupabase` y `supabase/functions/.env` ignorados |

## 6. No verificado

- Exportar PNG/PDF desde Presentaciones con el renderer del host en modo local: se probó el preview del renderer con una imagen local (`renderDesignPreview`, sin issue `blocked_resource`), pero no el botón de exportar en la UI.
- El renderer ya abierto del usuario (puerto 3333, iniciado el 10-10) no tiene `SCORY_LOCAL_SUPABASE_URL`: hay que cerrarlo y volver a correr `npm run dev:local` para que el preview cargue imágenes locales.
- Generación de imagen completa (`generate-design-image` en modo generate y `desaing-server`): no se hizo, por costo, y la política del negocio local está `enabled=false`.
- Las otras funciones de IA que `src` invoca (brand-onboarding, compliance-wizard, carousel, news, fx-daily, etc.): solo smoke de arranque, sin llamada a OpenAI.
