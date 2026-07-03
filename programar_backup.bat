@echo off
:: ============================================================
::  Registra backup.py en el Programador de Tareas de Windows
::  para ejecutarse todos los días a las 23:00.
::
::  REQUISITO: Ejecutar este archivo como Administrador.
::             Clic derecho → "Ejecutar como administrador"
:: ============================================================

setlocal

set PYTHON=C:\Users\kevin\AppData\Local\Programs\Python\Python311\python.exe
set SCRIPT=C:\Users\kevin\Documents\parking-ia\backup.py
set TASK_NAME=ParkingIA_Backup

echo.
echo ============================================================
echo  Registrando tarea: %TASK_NAME%
echo  Script : %SCRIPT%
echo  Python : %PYTHON%
echo  Horario: todos los dias a las 23:00
echo ============================================================
echo.

:: Elimina la tarea si ya existía (evita duplicados)
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Crea la tarea nueva
:: /RU  "" → corre con el usuario actual (sin contraseña hardcodeada)
:: /IT    → solo cuando el usuario está iniciado (necesario para Docker Desktop)
:: /RL HIGH → nivel de privilegios elevado
schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "\"%PYTHON%\" \"%SCRIPT%\"" ^
  /SC DAILY ^
  /ST 23:00 ^
  /RU "%USERDOMAIN%\%USERNAME%" ^
  /IT ^
  /RL HIGH ^
  /F

if %ERRORLEVEL% == 0 (
    echo.
    echo [OK] Tarea registrada correctamente.
    echo.
    echo Para verificar:
    echo   schtasks /Query /TN "%TASK_NAME%" /FO LIST
    echo.
    echo Para probar ahora sin esperar las 23:00:
    echo   schtasks /Run /TN "%TASK_NAME%"
    echo.
    echo Para eliminar la tarea en el futuro:
    echo   schtasks /Delete /TN "%TASK_NAME%" /F
) else (
    echo.
    echo [ERROR] No se pudo registrar la tarea.
    echo Asegurate de ejecutar este archivo como Administrador.
)

echo.
pause
endlocal
