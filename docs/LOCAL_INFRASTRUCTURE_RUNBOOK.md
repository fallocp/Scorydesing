# Runbook de infraestructura local

- **Estado:** primer arranque hecho el 13-10-2026 (cierre de Fase 3). Disco de Docker en `F:\DockerDesktopWSL`, regla de Firewall creada. Resultado en §6.1. Fase 8 (14-10-2026): backup diario con restore probado (§12), smoke de privilegios (§13) y problema conocido de Docker Desktop (§11).
- **Afecta únicamente:** desarrollo local de ScoryDesign.
- **Producción:** no configurada (ADR-0001). Desde la Fase 7, `npm run dev:local` usa el Supabase local y `npm run dev` sigue contra el compartido (§6.2).

## 1. Requisitos

- Docker Desktop con el disco de datos **en F:** (ver §8). Al menos 5 GB libres en el disco de Docker antes de arrancar y unos 4 GB más para la copia de datos de la Fase 5.
- Node 22 y `npm install` hecho en `F:\ScoryDesign`. La CLI está fijada: `supabase@2.117.0` (devDependency, la misma de agents-finmarket). Usar siempre `npm run supabase:*` o `node_modules\.bin\supabase`, no la CLI global.
- `supabase\.temp` sin `project-ref` ni `linked-project.json` (el repo no está vinculado a ningún proyecto). `supabase status` debe decir `Not linked.`

## 2. Puertos

Todos dentro de 55320-55329. agents-finmarket usa 54320-54329: conviven.

| Servicio | Puerto host | `config.toml` |
|---|---|---|
| Shadow DB (`db diff`) | 55320 | `db.shadow_port` |
| API (Kong: REST, Auth, Storage, Functions) | 55321 | `api.port` |
| PostgreSQL | 55322 | `db.port` |
| Studio | 55323 | `studio.port` |
| Mailpit (`local_smtp`) | 55324 | `local_smtp.port` |
| SMTP / POP3 de Mailpit | 55325 / 55326 (comentados, no se publican) | `local_smtp.smtp_port` / `pop3_port` |
| Analytics (apagado) | 55327 | `analytics.port` |
| Inspector del edge runtime (solo con `--inspect`) | 55328 | `edge_runtime.inspector_port` |
| Pooler (apagado) | 55329 | `db.pooler.port` |

Servicios: `realtime` y `analytics` apagados; `edge_runtime` encendido; `local_smtp` en lugar de `[inbucket]`; `db.major_version = 17`; `[db.seed]` apagado; `auth.enable_signup = false`; `site_url = http://127.0.0.1:3000` (Vite).

## 3. Red (una sola vez)

Creada el 13-10-2026:

```powershell
docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 scorydesign-supabase-local
```

`npm run supabase:start` ya pasa `--network-id scorydesign-supabase-local`. En agents-finmarket esta opción no bastó en Docker Desktop: los puertos quedaron en `0.0.0.0`. Por eso hace falta también el Firewall.

## 4. Windows Firewall (PowerShell como administrador)

Creada por el usuario el 13-10-2026 (grupo `scorydesign`, Inbound, Block, TCP 55320-55329, `LocalSubnet,Internet`, `EdgeTraversalPolicy Block`, perfil Any). Comando usado, por si hay que recrearla:

```powershell
New-NetFirewallRule -DisplayName "scorydesign - Supabase local only" -Group "scorydesign" -Direction Inbound -Action Block -Enabled True -Profile Any -Protocol TCP -LocalPort 55320-55329 -RemoteAddress LocalSubnet,Internet -EdgeTraversalPolicy Block
```

Verificar:

```powershell
Get-NetFirewallRule -DisplayName "scorydesign - Supabase local only" | Format-List DisplayName,Enabled,Direction,Action,Profile
Get-NetFirewallRule -DisplayName "scorydesign - Supabase local only" | Get-NetFirewallPortFilter | Format-List Protocol,LocalPort
Get-NetFirewallRule -DisplayName "scorydesign - Supabase local only" | Get-NetFirewallAddressFilter | Format-List RemoteAddress
```

Rollback, solo con decisión explícita: `Remove-NetFirewallRule -DisplayName "scorydesign - Supabase local only"`. No modificar las reglas generales de Docker Desktop.

## 5. Sesión normal

```powershell
npm run supabase:start    # supabase start --network-id scorydesign-supabase-local
npm run supabase:status
npm run supabase:stop     # conserva volúmenes (nunca --no-backup)
```

La salida de `start` y `status` trae la anon key, la service role y el JWT secret **locales**. No pegarlas en archivos del repo, issues ni chats; si se comparte la salida, redactarlas.

## 6. Verificación después de arrancar

```powershell
docker ps --filter name=_scorydesign --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"
```

- Contenedores `supabase_*_scorydesign` sin `unhealthy` ni reinicios; 0 contenedores de `analytics`/`vector`.
- Puertos publicados: anotar si quedan en `127.0.0.1` o en `0.0.0.0` (en el segundo caso, el Firewall es la protección).
- HTTP 200 vía 127.0.0.1: `http://127.0.0.1:55321/rest/v1/` (con header `apikey`), `/auth/v1/health`, `/storage/v1/status` y Studio `http://127.0.0.1:55323`.
- `docker exec supabase_db_scorydesign pg_isready -U postgres`.
- Antes de la Fase 4: 0 tablas de app en `public`.
- `npm run supabase:status` limpio y `supabase\.temp` sin `project-ref` ni `linked-project.json`.

### 6.1 Primer arranque (13-10-2026)

- Antes: C: 48.4 GB libres, F: 1,353.9 GB; puertos 55320-55329 sin listeners; `supabase\.temp` solo con `cli-latest`; `supabase\migrations` solo con `README.md`.
- Contenedores (`docker ps --filter name=_scorydesign`), todos con 0 reinicios: `supabase_db_scorydesign`, `supabase_kong_scorydesign`, `supabase_auth_scorydesign`, `supabase_rest_scorydesign`, `supabase_storage_scorydesign`, `supabase_pg_meta_scorydesign`, `supabase_studio_scorydesign`, `supabase_inbucket_scorydesign` (Mailpit) y `supabase_edge_runtime_scorydesign`. Con healthcheck: todos `healthy`; rest y edge runtime no tienen healthcheck. 0 contenedores de analytics/vector; realtime, imgproxy y pooler apagados.
- **Binding observado: `0.0.0.0` y `[::]`** en 55321 (Kong), 55322 (Postgres), 55323 (Studio) y 55324 (Mailpit), igual que en agents-finmarket. La red `scorydesign-supabase-local` no lo evita en Docker Desktop; la protección es la regla de Firewall de §4. La propia CLI lo avisa al arrancar.
- HTTP 200 vía 127.0.0.1: `/rest/v1/` (con `apikey`), `/auth/v1/health`, `/storage/v1/status` y Studio. `pg_isready`: `accepting connections`. Edge runtime 1.74.3 (Deno 2.1.4) arriba y sirviendo las funciones de `supabase/functions` (una ruta inexistente responde 404).
- `supabase status`: `Not linked.`. La CLI 2.117 crea `supabase\.temp\start-secrets` al arrancar (secretos locales; la carpeta está ignorada por git). No hay `project-ref` ni `linked-project.json`.
- agents-finmarket (`supabase_*_agents-finmarket`) y scory-production siguieron arriba.

## 6.2 Correr la app contra el Supabase local (Fase 7)

Una sola vez:

- `supabase/functions/.env` con los nombres de `supabase/functions/.env.example`. `OPENAI_API_KEY` la pone el dueño; cada llamada cuesta.
- `.env.localsupabase` con los nombres de `.env.localsupabase.example`: `VITE_SUPABASE_URL=http://127.0.0.1:55321` y la anon key local de `npm run supabase:status`. Nunca `VITE_AUTH_PASSWORD`.

Cada sesión:

```powershell
npm run supabase:start
npm run dev:local         # renderer en 127.0.0.1:3333 + Vite en http://127.0.0.1:3000 (modo localsupabase)
```

- Login con el formulario de la app y el usuario local (`F:\ScoryDesign-ops\local-owner-login.txt`).
- Si ya hay un renderer abierto en el 3333 de antes, ciérralo primero: el renderer nuevo recibe `SCORY_LOCAL_SUPABASE_URL` para mostrar imágenes locales en el preview.
- Si cambias `supabase/functions/.env` o `[functions.*]` de `config.toml`, corre `npm run supabase:stop` y después `npm run supabase:start`.

Volver al compartido: `npm run dev` (el `.env` no cambió) o `npm run dev:local:shared`. Las sesiones no se pisan (`sb-127-auth-token` contra la del proyecto compartido). Lo que la app escriba en modo local queda solo en el local.

Resultados de la prueba: `docs/LOCAL_CUTOVER_REPORT.md`.

## 7. Lo que nunca se hace

Los volúmenes de Docker son la única copia viva de los datos nuevos; fuera de ellos solo está el backup diario (§12).

```text
docker compose down -v
supabase stop --no-backup
docker volume rm ...
docker system prune ...
supabase link / supabase db push / supabase migration repair / cualquier --linked
supabase functions deploy / supabase secrets set
cualquier comando con --project-ref del compartido
```

Tampoco se ejecutan `scripts/desaing/deploy-prompt-admin.ps1` ni `scripts/desaing/supabase-query.ps1 -Write` (apuntan al compartido).

## 8. Espacio en disco

- El disco de datos de Docker Desktop estaba en `C:\Users\fallo\AppData\Local\Docker\wsl\disk\docker_data.vhdx` (≈47 GB) con C: casi lleno. El usuario lo movió a **`F:\DockerDesktopWSL`** (Docker Desktop → Settings → Resources → Advanced → Disk image location); después C: quedó con ≈48 GB libres. No se usa `prune` para liberar espacio.
- Medir antes de cada arranque, pull o build: `Get-PSDrive C,F`. Si el disco de Docker tiene menos de 5 GB libres, no arrancar.
- Imágenes: la CLI 2.117 usa las mismas que agents-finmarket (ya descargadas). El edge runtime puede requerir una imagen extra (≈1.1 GB) si su versión no está en caché.
- Fase 5 suma ≈775 MB de tablas y ≈1.75 GiB de objetos dentro del disco de Docker, más el dump (766 MB) y la copia extra de objetos (1.75 GiB) en `F:\ScoryDesign-ops\phase5\`, fuera del repo.

## 8.1 Datos copiados del compartido (Fase 5)

- Hecho el 13-10-2026: 62 tablas (3,456 filas) y 1,600 objetos (1.75 GiB) copiados y verificados; URLs del Storage reescritas a `http://127.0.0.1:55321`. Detalle: `docs/DATA_MIGRATION_REPORT.md`.
- Login local del dueño (mismo UUID que en el compartido, contraseña nueva): `F:\ScoryDesign-ops\local-owner-login.txt`, fuera del repo. No copiarlo a `.env` de la app ni a chats.
- `[auth.email] enable_signup` está en `true` a propósito: en la CLI ese flag habilita el proveedor de email (con `false` el login responde `email_provider_disabled`). El registro público lo cierra `[auth] enable_signup = false`.
- `[storage.image_transformation]` sigue apagado: ninguna URL guardada usa `/render/image/`.

Re-ejecutar la copia (scripts en `scripts/shared-migration/`, credenciales del compartido en `F:\ScoryDesign-ops\shared-readonly.env`, salidas en `F:\ScoryDesign-ops\phase5\`):

```powershell
npm run migrate:shared:owner
npm run migrate:shared:export
npm run migrate:shared:load -- --mode rehearsal
npm run migrate:shared:load -- --mode commit --truncate
npm run migrate:shared:storage -- --mode full
npm run migrate:shared:verify
npm run migrate:shared:rewrite-urls
npm run migrate:shared:smoke
```

`--truncate` vacía las 62 tablas en alcance del local. Desde la Fase 7 la app escribe en el local: **no usar `--truncate`**, porque borraría datos nuevos. El compartido solo se lee (`default_transaction_read_only=on`, `pg_dump`, Storage GET).

## 9. Convivencia con agents-finmarket

- Contenedores distintos (`supabase_*_agents-finmarket` vs `supabase_*_scorydesign`), redes distintas (`agents-finmarket-supabase-local` vs `scorydesign-supabase-local`) y puertos sin solapamiento.
- No apagar ni tocar el stack de agents-finmarket desde este repo.
- Ambos stacks juntos usan más RAM; si Docker Desktop se queda corto, parar uno con su `npm run supabase:stop`.

## 10. Rollback

- La app sigue con su env actual contra el compartido hasta la Fase 7; no hay nada que revertir en la app.
- Apagar el local: `npm run supabase:stop` (conserva datos).
- La configuración vive en git (`supabase/config.toml`, `package.json`); las migraciones legacy siguen en `supabase/legacy_shared_migrations/`.
- La red se quita solo con decisión explícita y con el stack apagado: `docker network rm scorydesign-supabase-local`.
- Volver al compartido, reanudar el local y restaurar un backup: `docs/ROLLBACK.md`.

## 11. Problema conocido: contenedores `Up` con puertos que no responden

Después de reiniciar Docker Desktop o mover su disco, los contenedores pueden seguir `Up` (incluso `healthy`) mientras `http://127.0.0.1:55321` o `55322` devuelven `Empty reply from server` o la conexión se cae. `npm run dev:local` avisa que Supabase local no responde.

```powershell
docker restart supabase_kong_scorydesign        # el que no responde (kong = API, db = Postgres)
```

Si sigue igual, reiniciar el stack completo (conserva volúmenes):

```powershell
npm run supabase:stop
npm run supabase:start
```

Nunca `supabase stop --no-backup`, `docker compose down -v` ni `docker volume rm` para "arreglarlo" (§7).

## 12. Backup diario y restore

- `npm run backup:local` (`scripts/backup-local.mjs`): `E:\scorydesign-backups\YYYY-MM-DD_HHmm\` (hora de America/Mexico_City; otra raíz con `BACKUP_DIR`) con `database.dump` (`pg_dump -Fc --no-owner` de toda la base como `supabase_admin`, verificado con `pg_restore --list`), `storage.tar.gz` (`/mnt` de `supabase_storage_scorydesign`) y `manifest.json` (sha256, bytes, filas por tabla, objetos y bytes por bucket, ledger y pasos de restore). Se escribe en `<carpeta>.partial` y se renombra al final. Falla si los contenedores no corren.
- Retención: `BACKUP_KEEP_DAYS` (30). Solo borra carpetas con fecha y `manifest.json` válido, nunca la recién creada.
- Tarea de Windows `scorydesign-backup`, diaria a las 21:30 (agents-finmarket corre a las 21:00), usuario actual, solo con sesión iniciada. Ejecuta `conhost.exe --headless "F:\ScoryDesign\scripts\backup-task.cmd"` (sin ventana: la primera corrida del 14-10-2026 abrió una consola, se cerró y terminó con `0xC000013A`) y escribe en `E:\scorydesign-backups\backup.log`. Ver: `schtasks /Query /TN "scorydesign-backup" /V /FO LIST`.
- `backup-task.cmd` abre Docker Desktop si no responde, espera hasta 5 min al engine y hasta 3 min a que `supabase_db_scorydesign` esté `healthy` (los contenedores tienen `restart: unless-stopped`); si no, anota el motivo en el log y no hace backup.
- Recomendado: Docker Desktop → Settings → General → "Start Docker Desktop when you sign in to your computer".
- Tamaño (14-10-2026): ≈ 2.3 GB por backup (dump 553 MB + Storage 1.77 GB). 30 días ≈ 70 GB en E:.
- Probar un backup sin tocar lo live: `npm run backup:restore-test` (último) o `-- --backup <carpeta>`. Crea `scorydesign_restore_test`, restaura, compara filas y md5 de las 62 tablas contra la base live y la borra; extrae el Storage en un contenedor `postgres:17` desechable y compara archivos, bytes y sha256 con `/mnt`. Evidencia en `<carpeta>\restore-test.json`.
- Restaurar de verdad: `docs/ROLLBACK.md` §4. El backup incluye `auth` (hash de la contraseña del dueño): queda en esta máquina.

## 13. Smoke de privilegios

`npm run smoke:local` (`scripts/smoke-local-privileges.mjs`, keys locales en memoria, salida redactada). Comprueba: anon sin JWT no lee las tablas principales y el JWT del dueño sí; tablas solo de servidor bloqueadas para los dos; anon no lista ni sube en buckets privados ni sube en públicos; GET público de `design-images` y `Brand`; acceso del dueño a objetos privados igual al que dan las policies; signup rechazado; sin link remoto; 0 hosts de Supabase hosted en la base local y en archivos cambiados en la rama; puertos solo en 55320-55329 y la regla de Firewall habilitada. Lo heredado por paridad sale como `BACKLOG` y no falla. Con `SMOKE_REPORT_FILE=<ruta>` escribe el reporte en JSON.
