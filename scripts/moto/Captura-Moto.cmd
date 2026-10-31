@echo off
rem Captura guiada na moto (só recepção). Roteiro: docsehicle-evidence\CAPTURA-MOTO.md
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0captura-guiada.ps1" %*
