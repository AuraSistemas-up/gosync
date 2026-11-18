@echo off
chcp 65001 >nul
title Exportar catalogo do banco Firebird
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install || (pause & exit /b 1)
)

rem Dados de conexao ficam em .fb.env (fora do Git). Veja .fb.env.example.
if not exist .fb.env (
  echo Falta o arquivo .fb.env. Copie .fb.env.example para .fb.env e preencha o caminho do banco e a senha.
  pause & exit /b 1
)

echo Exportando produtos, variacoes e fotos do banco Firebird...
echo (leva alguns minutos; o banco e apenas lido)
echo.
node scripts\exportar-firebird.cjs
if errorlevel 1 (echo. & echo Falhou. Confira se o Firebird 5 esta rodando na porta 3060. & pause & exit /b 1)

echo.
echo Pronto! Agora execute testar-site.bat para ver o catalogo.
pause
