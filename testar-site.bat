@echo off
chcp 65001 >nul
title Teste do site - Sapataria
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install || (pause & exit /b 1)
)

echo Criando dados de exemplo...
node dev\make-sample.mjs || (pause & exit /b 1)

echo.
echo Abrindo http://localhost:4321  ^(Ctrl+C para encerrar^)
echo.
call npm run dev -- --open

rem Remove os dados de exemplo para nunca irem para a Locaweb
if exist public\data\catalog.json del /q public\data\catalog.json
rmdir public\data 2>nul
