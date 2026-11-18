@echo off
chcp 65001 >nul
title Publicar catalogo na Locaweb
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)

if not exist node_modules ( call npm install || (pause & exit /b 1) )
if not exist tray\node_modules ( call npm --prefix tray install || (pause & exit /b 1) )

if not exist .deploy.env (
  echo Falta o arquivo .deploy.env. Copie .deploy.env.example para .deploy.env.
  pause & exit /b 1
)

echo.
echo Vai gerar o site e enviar para a Locaweb. O catalogo atual (public\data) e as fotos vao junto.
echo Se quiser atualizar os produtos antes, rode exportar-catalogo.bat primeiro.
echo.
node scripts\publicar-ftp.cjs %*
echo.
pause
