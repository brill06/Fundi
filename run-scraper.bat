@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scraper\scrape.ps1"
echo.
pause
