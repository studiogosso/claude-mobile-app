@echo off
chcp 65001 >nul
echo ==========================================
echo   Claude Mobile Assistant Server
echo ==========================================
echo.
echo   Local:     http://localhost:3456
echo   Phone:     http://100.79.34.10:3456
echo   Surface:   http://100.79.34.10:3456
echo.
echo   (Tailscale接続が必要です)
echo ==========================================
echo.

cd /d "%~dp0"
node server.js

pause
