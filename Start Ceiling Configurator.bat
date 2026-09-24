@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  UniVicoustic Ceiling Configurator - local launcher
rem
rem  Starts the Vite dev server and opens the app in your browser.
rem
rem  Every path is resolved from THIS script's own location (%~dp0), so the repo
rem  can be moved or cloned anywhere and this file keeps working. The previous
rem  launcher hardcoded C:\Users\...\Documents\AcoustiConfig and broke the
rem  moment the repo moved.
rem ---------------------------------------------------------------------------

set "APPDIR=%~dp0app"
set "PORT=5190"
set "URL=http://localhost:%PORT%/ceiling/"

title Ceiling Configurator launcher

rem --- Node present? ---------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install the LTS build from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

rem --- Already running? Just open it. ----------------------------------------
curl -s -m 2 -o nul "%URL%" >nul 2>&1
if not errorlevel 1 (
  echo   Already running - opening %URL%
  start "" "%URL%"
  exit /b 0
)

rem --- Find the app ----------------------------------------------------------
if not exist "%APPDIR%\package.json" (
  echo.
  echo   Could not find the app at:
  echo     %APPDIR%
  echo   Keep this script in the repository root, next to the "app" folder.
  echo.
  pause
  exit /b 1
)
cd /d "%APPDIR%"

rem --- First run: install dependencies ---------------------------------------
rem  npm is a .cmd, so it needs CALL - without it this script would exit here.
if not exist "node_modules" (
  echo.
  echo   First run - installing dependencies. This takes a minute.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. Scroll up for the reason.
    echo.
    pause
    exit /b 1
  )
)

rem --- Start the server ------------------------------------------------------
echo   Starting the dev server on port %PORT%...
start "Ceiling Configurator server" /min cmd /c "npm run dev"

rem --- Wait for it to answer, then open the browser --------------------------
rem  Polling beats a fixed sleep: a cold start that has to rebuild the model
rem  manifest takes longer than a warm one, and a fixed wait either opens a
rem  dead tab or wastes time.
set /a TRIES=0
:wait
set /a TRIES+=1
if %TRIES% gtr 60 (
  echo.
  echo   The server did not answer within 60 seconds.
  echo   Check the minimised "Ceiling Configurator server" window for errors -
  echo   the usual cause is port %PORT% already being used by something else.
  echo.
  pause
  exit /b 1
)
curl -s -m 2 -o nul "%URL%" >nul 2>&1
if errorlevel 1 (
  ping -n 2 127.0.0.1 >nul
  goto wait
)

start "" "%URL%"
echo.
echo   Running at %URL%
echo   Close the minimised "Ceiling Configurator server" window to stop it.
echo.
timeout /t 5 >nul 2>&1
exit /b 0
