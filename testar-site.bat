@echo off
chcp 65001 >nul
title Teste do site - Sapataria
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install || (pause & exit /b 1)
)

rem Se ja existir catalogo real (exportar-catalogo.bat), usa ele. Senao, cria dados de exemplo.
set SAMPLE=0
if not exist public\data\catalog.json (
  echo Criando dados de exemplo...
  node dev\make-sample.mjs || (pause & exit /b 1)
  set SAMPLE=1
) else (
  echo Usando o catalogo real exportado em public\data
)

echo.
echo Abrindo http://localhost:4321  ^(Ctrl+C para encerrar^)
echo.
call npm run dev -- --open

if "%SAMPLE%"=="1" (
  del /q public\data\catalog.json 2>nul
  rmdir public\data 2>nul
)
