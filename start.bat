@echo off
Powershell.exe -executionpolicy remotesigned -File  ./misc/setup.ps1
node app.js
pause