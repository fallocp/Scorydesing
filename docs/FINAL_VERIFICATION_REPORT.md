# Verificación final de la separación (Fase 8)

- Fecha: 14-10-2026. Rama `feat/own-local-supabase`, base `0b82927`.
- Destino: Supabase local `scorydesign` (API `http://127.0.0.1:55321`). El compartido no se tocó en esta fase (ni lectura).
- Sin secretos, keys, UUIDs, emails ni el ref del compartido. Salidas crudas fuera del repo, en `F:\ScoryDesign-ops\phase8\`.

## 1. Verificación del repo

| Verificación | Resultado |
|---|---|
| `npm test` (suite completa) | 3,938 pasan. 5 archivos con Puppeteer fallaron por timeout bajo carga (`designConversationInspection`, `designElementTools`, `designLogo`, `styleTransfer.browser`, `assetGeneration`); al reintentarlos solos pasan 42/42. Quedan **12 tests en 6 archivos, los mismos que fallan en `0b82927`** (ver abajo) |
| Tests PGlite (arreglo de esta fase) | 9 archivos fallaban con `ENOENT`: leían `supabase/migrations/2026091*`/`202610*`, que `b8864a7` (esta rama) archivó en `supabase/legacy_shared_migrations/`. Se cambió solo la ruta en los tests; ahora corren 149 tests que antes se saltaban: 147 pasan y 2 de `productionBackend` fallan igual que en la base |
| `npm run lint` | 13 errores en 9 archivos, los mismos de antes; **0 nuevos**. Los scripts y tests tocados: 0 errores |
| `npm run type-check` | OK |
| `npm run validate:structure` | OK |
| `supabase db lint --local` (CLI 2.117.0 del repo) | `No schema errors found` |
| `deno check` de las 35 funciones (`index.ts`) | 29 OK. Con errores de tipos, sin cambios en esta fase: brand-onboarding (12), compliance-wizard (15), generate-ideas (7), desaing-server (2), hydrate-templates (1), render-design-png (1). El runtime local las arranca (Fase 6) |

Comparación con la base: worktree temporal de `0b82927` en `F:\ScoryDesign-ops\phase8\base` con el `node_modules` del repo enlazado (la rama solo agrega la CLI `supabase`), corriendo los 14 archivos que fallaban. En la base fallan 12 tests en 6 archivos: `pilotHttp` 4, `serverGeneration` 4, `htmlBackend` 1, `materialsBackend` 1, `productionBackend` 2 y la demo de `docs/UI-handoffv2`. Después del arreglo de rutas, la rama falla exactamente en esos 12. El worktree se quitó (`git worktree remove`) después de soltar los enlaces.

## 2. Smoke de privilegios (`npm run smoke:local`)

**39/39 OK.** Keys locales de `supabase status -o json` en memoria, JWT del dueño por password grant, salida redactada.

| Prueba | Resultado |
|---|---|
| Tablas principales (16): anon sin JWT | 0 filas (RLS) o 401 en `desaing_audit`, `desaing_state`, `desaing_explorations` |
| Mismas tablas con el JWT del dueño | lee todas sus filas (p. ej. `design_mockups` 814/814, `copy_bank_items` 599/599, `presentations` 9/9). `desaing_explorations` es solo de servidor (sin grants para `authenticated`): 403 para el dueño, como se espera |
| Buckets privados (`desaing-assets`, `desaing-conversation-references`, `desaing-materials`, `brand-assets`): anon lista | 200 con 0 objetos |
| Anon sube un PNG de 1×1 (4 privados + `design-images` + `Brand`) | 400 en los 6; no quedó ningún objeto |
| GET público sin headers (`design-images`, `Brand`) | 200, bytes iguales al tamaño guardado |
| Dueño vs policies (API == SQL evaluado como el dueño) | `desaing-assets`: 224/230 visibles; uno visible 200, uno no visible 400, anon 400. `desaing-conversation-references`: 23/23; 200 y anon 400. `desaing-materials`: 0/2 (solo servidor); 400. `brand-assets`: vacío |
| Signup público | 422 `signup_disabled` |
| Link remoto en `supabase\.temp` | ninguno |
| Hosts de Supabase hosted en la base local (308 columnas de texto/json de las 62 tablas, `storage.objects`, `auth.users`) | 0 |
| Hosts del compartido en archivos cambiados desde `0b82927` | 0 |
| Puertos publicados del stack | 55321, 55322, 55323, 55324 (9 contenedores) |
| Regla de Firewall `scorydesign - Supabase local only` | habilitada, Inbound, Block, TCP 55320-55329 |

Paridad heredada, backlog (se listan, no se corrigieron; `MIGRATION_SCOPE.md` §6):

- 42 tablas en alcance con ALL para `anon` (protegidas solo por RLS).
- `set_active_business(uuid)` y `user_is_member_of(uuid)`: SECURITY DEFINER con EXECUTE para PUBLIC.
- Policies de `design-images`: lectura pública, y upload y delete para cualquier autenticado.
- 12 archivos trackeados anteriores a la rama (`scripts/desaing/*` y 4 docs) nombran el ref del compartido.

## 3. Backup local (`npm run backup:local`)

- Ruta: `E:\scorydesign-backups\2026-10-14_1912\` (1 min 50 s).
- `database.dump`: 552,889,798 bytes; `pg_dump -Fc --no-owner` de toda la base como `supabase_admin`; `pg_restore --list` con 1,280 entradas; trae datos de `public`, `auth`, `storage` y `supabase_migrations` (ledger `20261013000`-`005`).
- `storage.tar.gz`: 1,766,753,012 bytes; `/mnt` de `supabase_storage_scorydesign`: 1,600 archivos, 1,881,721,856 bytes.
- `manifest.json`: sha256 y bytes de los dos archivos, filas de las 62 tablas (3,457: las 3,456 copiadas más la presentación de QA de Fase 7) y de `auth.users` (1), `storage.objects` (1,600), objetos y bytes por bucket (iguales a la Fase 5) y los pasos de restore.
- Se escribe en `.partial` y se renombra al final. Una primera corrida falló al verificar el dump (`pg_restore --list` cierra stdin antes de leer todo y Node lo tomó como error); se corrigió el script, se borró esa carpeta `.partial` y se volvió a correr.

## 4. Restore probado sin tocar lo live (`npm run backup:restore-test`)

| Parte | Resultado |
|---|---|
| sha256 de `database.dump` y `storage.tar.gz` | iguales al manifest |
| Base: `CREATE DATABASE scorydesign_restore_test` + `pg_restore --no-owner` | exit 0, 0 errores, 29 s |
| Tablas en alcance (filas + md5 por tabla, restaurada vs live) | **62/62 iguales**, 3,457 filas |
| Sistema (`auth.users`, `auth.identities`, `storage.buckets`, `storage.objects`, ledger) | 5/5 iguales |
| `DROP DATABASE scorydesign_restore_test` | hecho; 0 bases `scorydesign%` después |
| Storage: tar extraído en un contenedor `postgres:17` desechable (`--rm --network none`, sin volumen) | **1,600 archivos, 1,881,721,856 bytes**, igual al `/mnt` live y al manifest; sha256 de los 1,600 archivos iguales a los del `/mnt` live (67 s) |

Evidencia: `E:\scorydesign-backups\2026-10-14_1912\restore-test.json` (copia en `F:\ScoryDesign-ops\phase8\restore-test.json`). La base live solo se leyó y el `/mnt` live solo se leyó.

## 5. Tarea programada

Creada sin admin, como el usuario actual:

```powershell
schtasks /Create /SC DAILY /ST 21:30 /TN "scorydesign-backup" /TR "F:\ScoryDesign\scripts\backup-task.cmd"
```

Estado `Ready`, diaria a las 21:30, modo `Interactive only` (corre solo con la sesión iniciada). Log: `E:\scorydesign-backups\backup.log`. La primera corrida programada no se observó.

## 6. No verificado

- La restauración sobre la base y el `/mnt` live (`docs/ROLLBACK.md` §4, pasos 4-5): a propósito; se probó en una base y un contenedor aparte.
- La ejecución de la tarea programada y la retención con backups de más de 30 días.
- Volver al compartido con `npm run dev`: no se corrió en esta fase (no se toca el compartido); el `.env` sigue sin cambios desde Fase 7.
- Funciones de IA: no se invocaron.

## 7. Datos afectados

- Base local: ninguna fila escrita. Se creó y se borró `scorydesign_restore_test`. El smoke intentó 6 subidas anónimas, todas rechazadas, y un signup, rechazado.
- Disco: un backup de ≈ 2.3 GB en `E:\scorydesign-backups\`. El contenedor del restore de Storage se borró al terminar.
- Compartido: nada.
