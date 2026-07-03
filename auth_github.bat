@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   GitHub CLI login (one-time setup)
echo ========================================
echo.
echo A browser window will open.
echo Copy the code shown below and paste it on the page.
echo.
"C:\Program Files\GitHub CLI\gh.exe" auth login -h github.com -p https -w
echo.
if errorlevel 1 (
  echo Login failed. Try again.
  pause
  exit /b 1
)
echo Login OK. Running setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_github.ps1"
pause
