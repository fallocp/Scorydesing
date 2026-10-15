# Rollback y restauración

- Fecha: 14-10-2026 (Fase 8). Rama `feat/own-local-supabase`.
- Aplica a: desarrollo local de ScoryDesign. No hay producción configurada (ADR-0001).
- Sin secretos, keys, UUIDs, emails ni el ref del compartido.

## 1. Volver al Supabase compartido

```powershell
npm run dev
```

`npm run dev` sigue igual que antes de la migración: usa `.env` (no se modificó) contra el compartido. `npm run dev:local:shared` hace lo mismo con el renderer del host. No hace falta apagar el stack local; las sesiones de Auth no se pisan (`sb-127-auth-token` contra la del compartido).

**Advertencia:** lo que la app escribió en el local desde el cambio (Fase 7, 14-10-2026) **no existe en el compartido**: diseños, presentaciones, auditoría, objetos de Storage nuevos, etc. No hay sincronización de vuelta. Antes de volver para trabajar en serio:

1. `npm run backup:local` (deja una copia de lo hecho en local).
2. Decidir qué se rehace en el compartido a mano. No hay script de local → compartido, y el compartido no se toca desde este repo.

## 2. Reanudar el local

```powershell
npm run supabase:start
npm run dev:local
```

Los datos siguen en los volúmenes de Docker mientras no se use `--no-backup`, `docker volume rm` ni `prune` (runbook §7). Si los contenedores están `Up` pero los puertos responden `Empty reply`, ver runbook §11.

## 3. Re-ejecutar la copia desde el compartido

Solo si se necesita traer de nuevo el estado del compartido **antes de nuevas escrituras en el local**. Pasos y requisitos en `docs/DATA_MIGRATION_REPORT.md` §7 (`npm run migrate:shared:*`, credencial de solo lectura en `F:\ScoryDesign-ops\shared-readonly.env`).

- `migrate:shared:load -- --mode commit --truncate` vacía las 62 tablas del local: borra lo escrito en local después del cambio. Antes, `npm run backup:local`.
- Después de cargar: `verify`, `rewrite-urls` y `smoke`, y `npm run smoke:local`.
- Si ya se borraron la llave `scorydesign-migration` y `shared-readonly.env` (backlog de `MIGRATION_SCOPE.md` §6), este camino ya no existe: usar el backup local (§4).

## 4. Restaurar desde un backup local

Backups en `E:\scorydesign-backups\YYYY-MM-DD_HHmm\` (`database.dump`, `storage.tar.gz`, `manifest.json`; los pasos también están en el campo `restore` del manifest). Tarea diaria `scorydesign-backup` a las 21:30; a mano: `npm run backup:local`.

1. Probar el backup sin tocar lo live (crea y borra `scorydesign_restore_test` y extrae el Storage en un contenedor desechable):

   ```powershell
   npm run backup:restore-test -- --backup E:\scorydesign-backups\<carpeta>
   ```

   Debe terminar en `Restore test OK` (62/62 tablas, archivos y sha256 iguales). Evidencia en `<carpeta>\restore-test.json`.
2. Detener la app (Ctrl+C en `npm run dev:local`). El stack sigue arriba.
3. Respaldar el estado actual, aunque esté dañado: `npm run backup:local`.
4. Base (reemplaza los objetos del dump en la base live):

   ```powershell
   cmd /c "docker exec -i supabase_db_scorydesign pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner < E:\scorydesign-backups\<carpeta>\database.dump"
   ```

   El dump es de toda la base (`public`, `auth`, `storage`, ledger `supabase_migrations`). Avisos sobre objetos internos de Supabase (extensiones, roles del sistema) son esperables; las tablas de datos no deben fallar. Este paso no se probó sobre la base live, a propósito: lo probado es el restore en una base aparte (paso 1).
5. Archivos de Storage:

   ```powershell
   cmd /c "docker exec -i supabase_storage_scorydesign sh -c ""tar -xzf - -C /mnt"" < E:\scorydesign-backups\<carpeta>\storage.tar.gz"
   ```

   Sobrescribe y agrega archivos; no borra los que no estén en el backup. Los objetos que no existan en `storage.objects` restaurado quedan huérfanos en disco, sin efecto en la app.
6. `npm run supabase:stop` y `npm run supabase:start` (nunca `--no-backup`).
7. Verificar: `npm run smoke:local` (39/39) y `npm run dev:local` (login, imágenes de `/design-studio` y `/assets`). Comparar conteos con `rowCounts` y `storageBuckets` del manifest.

## 5. Revertir el código

- Fase 8 (backup, smoke, docs): revertir sus commits; no cambian la app.
- Fases 6-7: ver `docs/LOCAL_CUTOVER_REPORT.md` §4. Fase 5: `docs/DATA_MIGRATION_REPORT.md` §8.
- Tarea programada: `schtasks /Delete /TN "scorydesign-backup" /F` (no borra backups).
