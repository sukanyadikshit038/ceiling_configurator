@echo off
rem Starts the AcoustiConfig server (if not already running) and opens the app.
start "AcoustiConfig Server" /min "C:\Program Files\nodejs\node.exe" "C:\Users\sukanya.d\Documents\AcoustiConfig\scripts\serve.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:4190
