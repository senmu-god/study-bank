@echo off
chcp 65001 >nul
rem Visible mode: a minimized server window stays open so you can read logs.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bank.ps1" -Visible
if errorlevel 1 pause