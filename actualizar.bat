@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   PULSO - Actualizando desde GitHub
echo ============================================
echo.
git pull
echo.
echo Listo. Si el servidor esta corriendo, la app se
echo actualiza sola. Solo refresca el navegador (F5).
echo.
pause
