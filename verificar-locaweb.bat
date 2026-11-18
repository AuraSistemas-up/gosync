@echo off
chcp 65001 >nul
title Verificar site na Locaweb
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
node scripts\verificar-site.cjs %*
echo.
pause
