@echo off
REM Lanza el panel FOKO (servidor Vite) desde la carpeta del proyecto.
cd /d "%~dp0"
call npm run dev
