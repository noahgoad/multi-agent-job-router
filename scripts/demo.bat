@echo off
REM Start the web demo in a new window so it survives the
REM parent terminal session exiting. The window title helps
REM users find it in the taskbar; it can be closed with the
REM X button (which triggers the demo's SIGINT handler).
setlocal
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
start "pharos-router-demo" cmd /c "cd /d %PROJECT_ROOT% && node scripts\demo.mjs"
endlocal
