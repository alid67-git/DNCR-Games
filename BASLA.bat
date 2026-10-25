@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js yuklu degil. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Bagimliliklar kuruluyor...
  call npm install
)
echo.
echo Tarayicide acilan adresi arkadasinla paylas (ayni Wi-Fi).
echo.
node server.js
pause
