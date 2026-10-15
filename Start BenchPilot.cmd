@echo off
set "SCRIPT=%~dp0Launch BenchPilot.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
