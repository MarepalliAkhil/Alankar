@echo off
REM One-command browser test (Task 8c). Run from the repository root:
REM   scripts\e2e.cmd            runs every browser test (workflow, accessibility, phone width)
REM   scripts\e2e.cmd --headed   same, but you can watch the browser
REM First time only:  cd frontend ^& npm install ^& npx playwright install chromium
REM It uses its own throw-away database "alankar_e2e" and ports 8001 / 5174. Your real data is never touched.
cd /d "%~dp0..\backend"
call .venv\Scripts\activate
cd /d "%~dp0..\frontend"
call npx playwright test %*
set RC=%ERRORLEVEL%
echo.
if %RC%==0 (echo E2E PASSED) else (echo E2E FAILED - open the report with: npm run e2e:report)
exit /b %RC%
