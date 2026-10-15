@echo off
rem Launched daily at 21:30 by the Windows task "scorydesign-backup" (agents-finmarket runs at 21:00).
rem Output goes to E:\scorydesign-backups\backup.log.
rem If Docker Desktop is not running, it is started and the task waits for the
rem Supabase containers (restart policy unless-stopped) before backing up.
setlocal
cd /d "%~dp0.."
set "LOG=E:\scorydesign-backups\backup.log"
if not exist "E:\scorydesign-backups" mkdir "E:\scorydesign-backups"

docker info >nul 2>&1
if errorlevel 1 (
  echo %date% %time% Docker no responde; abriendo Docker Desktop >> "%LOG%"
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
)

rem Wait up to ~5 minutes for the Docker engine.
set /a tries=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto wait_db
set /a tries+=1
if %tries% geq 30 (
  echo %date% %time% Docker no arranco en 5 minutos; backup cancelado >> "%LOG%"
  exit /b 1
)
timeout /t 10 /nobreak >nul
goto wait_docker

rem Wait up to ~3 minutes for the database container to be healthy.
:wait_db
set /a tries=0
:wait_db_loop
for /f %%s in ('docker inspect -f "{{.State.Health.Status}}" supabase_db_scorydesign 2^>nul') do set "DBSTATE=%%s"
if "%DBSTATE%"=="healthy" goto run_backup
set /a tries+=1
if %tries% geq 18 (
  echo %date% %time% supabase_db_scorydesign no esta healthy; corre npm run supabase:start. Backup cancelado >> "%LOG%"
  exit /b 1
)
timeout /t 10 /nobreak >nul
goto wait_db_loop

:run_backup
node scripts\backup-local.mjs >> "%LOG%" 2>&1
