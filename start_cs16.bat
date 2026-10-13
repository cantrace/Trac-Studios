@echo off
title Trac Studios - CS 1.6 Web Dedicated Server
echo ========================================================
echo   TRAC STUDIOS - COUNTER-STRIKE 1.6 WEB EDITION
echo ========================================================
echo.
cd cs16-web-main
echo Docker Compose baslatiliyor (cs16-web-main)...
docker compose up
if %errorlevel% neq 0 (
    echo.
    echo [BILGI] Docker Desktop yuklu veya acik degilse:
    echo 1. Docker Desktop uygulamasini baslatin veya kurun: https://www.docker.com/products/docker-desktop/
    echo 2. Veya siteden Dogrudan 'WebXash CS 1.6' ya da 'Play-CS' uzerinden kurulumsuz oynayin!
)
pause
