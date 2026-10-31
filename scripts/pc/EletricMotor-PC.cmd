@echo off
rem Atalho de duplo clique: abre o EletricMotor no PC (Chrome/Edge em modo app, http://localhost:4173).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir-eletricmotor.ps1" %*
