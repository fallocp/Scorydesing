# Runbook de infraestructura local

- **Estado:** configuración lista (Fase 3). **Primer arranque pendiente por disco**: C: tenía 2.46 GB libres el 13-10-2026 y el disco de Docker Desktop vive en C:.
- **Afecta únicamente:** desarrollo local de ScoryDesign.
- **Producción:** no configurada (ADR-0001). La app sigue contra el Supabase compartido hasta la Fase 7.

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

La regla no existe todavía (13-10-2026). Crearla una vez:

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

## 7. Lo que nunca se hace

Los volúmenes de Docker son la única copia de los datos nuevos.

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

- El disco de datos de Docker Desktop estaba en `C:\Users\fallo\AppData\Local\Docker\wsl\disk\docker_data.vhdx` (≈47 GB) y C: tenía 2.46 GB libres. **El disco de Docker debe vivir en F:** (Docker Desktop → Settings → Resources → Advanced → Disk image location). Lo mueve el usuario; no se usa `prune` para liberar espacio.
- Medir antes de cada arranque, pull o build: `Get-PSDrive C,F`. Si el disco de Docker tiene menos de 5 GB libres, no arrancar.
- Imágenes: la CLI 2.117 usa las mismas que agents-finmarket (ya descargadas). El edge runtime puede requerir una imagen extra (≈1.1 GB) si su versión no está en caché.
- Fase 5 suma ≈775 MB de tablas y ≈1.73 GiB de objetos dentro del disco de Docker, más los dumps temporales (en F:, fuera del repo).

## 9. Convivencia con agents-finmarket

- Contenedores distintos (`supabase_*_agents-finmarket` vs `supabase_*_scorydesign`), redes distintas (`agents-finmarket-supabase-local` vs `scorydesign-supabase-local`) y puertos sin solapamiento.
- No apagar ni tocar el stack de agents-finmarket desde este repo.
- Ambos stacks juntos usan más RAM; si Docker Desktop se queda corto, parar uno con su `npm run supabase:stop`.

## 10. Rollback

- La app sigue con su env actual contra el compartido hasta la Fase 7; no hay nada que revertir en la app.
- Apagar el local: `npm run supabase:stop` (conserva datos).
- La configuración vive en git (`supabase/config.toml`, `package.json`); las migraciones legacy siguen en `supabase/legacy_shared_migrations/`.
- La red se quita solo con decisión explícita y con el stack apagado: `docker network rm scorydesign-supabase-local`.
