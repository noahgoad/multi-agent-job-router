@echo off
REM Watchdog for the Pharos API server. Restarts the API
REM immediately if it crashes, so the dashboard never sees a
REM long outage.
REM
REM Usage: run this script detached (`start /B`) so it survives
REM the calling shell exiting.

set ROOT=D:\pharos-future-ideas\04-multi-agent-job-router
set API=%ROOT%\apps\api\dist\src\main.js
set LOG=%ROOT%\apps\api\watch.log

:loop
echo [%date% %time%] watch-api: starting API... >> "%LOG%"
node "%API%" >> "%LOG%" 2>&1
set EXITCODE=%ERRORLEVEL%
echo [%date% %time%] watch-api: API exited with code %EXITCODE%, restarting in 3s... >> "%LOG%"
timeout /t 3 /nobreak > nul
goto loop
