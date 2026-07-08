@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   PULSO - Iniciando aplicacion
echo ============================================
echo.
echo [1/2] Bajando ultimos cambios desde GitHub...
git pull
echo.
echo [2/2] Arrancando el servidor local...
echo   Cuando diga "Ready", abri http://localhost:3000
echo   Para cerrar: cerra esta ventana o apreta Ctrl + C
echo.
npm run dev
pause
