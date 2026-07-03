@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   GitHub setup (web token)
echo ========================================
echo.
echo Step 1: Create token on GitHub
echo   Opening: Settings - Tokens (classic) - Generate new token
echo.
start https://github.com/settings/tokens
echo.
echo Step 2: On GitHub page, click
echo   "Generate new token" -^> "Generate new token (classic)"
echo.
echo Step 3: Check ALL 3 scopes (can select together, not either-or):
echo.
echo   [x] repo          -- at the TOP of the list
echo   [x] workflow      -- scroll down a bit
echo   [x] read:org      -- scroll DOWN to "admin:org" section
echo                       only tick "read:org", NOT admin:org
echo.
echo Step 4: Generate token, copy ALL of ghp_... (no spaces)
echo.
set /p PAT=Paste token here and press Enter: 
if "%PAT%"=="" (
  echo No token entered.
  pause
  exit /b 1
)
set PAT=%PAT: =%
echo.
echo Logging in...
echo %PAT%| "C:\Program Files\GitHub CLI\gh.exe" auth login --with-token
if errorlevel 1 (
  echo.
  echo Login failed. Please check:
  echo   1. All 3 scopes: repo + workflow + read:org
  echo   2. Token copied fully, no space in the middle
  echo   3. Token not expired / not deleted
  pause
  exit /b 1
)
set PAT=
echo Login OK.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_github.ps1"
pause
