@echo off
rem Launched daily at 21:30 by the Windows task "scorydesign-backup" (agents-finmarket runs at 21:00).
rem Output goes to E:\scorydesign-backups\backup.log.
cd /d "%~dp0.."
if not exist "E:\scorydesign-backups" mkdir "E:\scorydesign-backups"
node scripts\backup-local.mjs >> "E:\scorydesign-backups\backup.log" 2>&1
