@echo off
rem Abre o Chat IA. Na primeira vez baixa o que precisa (precisa de internet).
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist node_modules\electron\dist\electron.exe node node_modules\electron\install.js
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
