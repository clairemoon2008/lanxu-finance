@echo off
setlocal
cd /d "%~dp0"

echo.
echo Lanxu Finance - DeepSeek daily brief
echo Please paste your DeepSeek API Key below. It will be used only in this window.
echo.
set /p DEEPSEEK_API_KEY=DeepSeek API Key: 

if "%DEEPSEEK_API_KEY%"=="" (
  echo No API Key entered. Cancelled.
  exit /b 1
)

set AI_PROVIDER=deepseek
set DEEPSEEK_MODEL=deepseek-v4-flash
set LANXU_USE_GDELT=

echo.
echo Generating daily brief...
python scripts\build_daily.py

echo.
echo Done. Open or refresh:
echo http://127.0.0.1:4173/
echo.
echo If the page is already open, press Ctrl+F5.
pause
