@echo off
set PHAROS_ROUTER_DEMO=1
cd /d D:\pharos-future-ideas\04-multi-agent-job-router\apps\api
node dist/src/main.js > api.log 2>&1
