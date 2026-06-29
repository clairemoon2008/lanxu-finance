@echo off
setlocal
cd /d "%~dp0"

echo Lanxu Finance local preview
echo.
echo Opening:
echo http://localhost:4173/
echo.

start "" "http://localhost:4173/"
python -m http.server 4173
