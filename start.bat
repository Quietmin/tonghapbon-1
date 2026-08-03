@echo off
chcp 65001 >nul
title Plant Ops Hub - 개발 서버
cd /d "%~dp0"

echo.
echo   ========================================
echo    Plant Ops Hub  개발 서버
echo   ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [오류] Node.js가 설치되어 있지 않습니다.
  echo.
  echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤
  echo   이 파일을 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   처음 실행이라 필요한 패키지를 내려받습니다.
  echo   2~3분 걸립니다. 창을 닫지 마세요.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [오류] 패키지 설치에 실패했습니다. 인터넷 연결을 확인하세요.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo   서버를 시작합니다. 잠시 후 브라우저가 자동으로 열립니다.
echo   열리지 않으면 http://localhost:3000 으로 접속하세요.
echo.
echo   끝낼 때는 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요.
echo.

start "" /min cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"
call npm run dev

echo.
echo   서버가 종료되었습니다.
pause