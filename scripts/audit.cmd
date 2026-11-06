@echo off
REM Dependency audit. Needs internet. Run from the repository root.
REM   scripts\audit.cmd
cd /d "%~dp0..\backend"
call .venv\Scripts\activate
python -m pip install -r requirements-dev.txt -q
echo === pip-audit (Python) ===
pip-audit -r requirements.txt
set PYRC=%ERRORLEVEL%
cd /d "%~dp0..\frontend"
echo === npm audit (production dependencies) ===
call npm audit --omit=dev
set NPMRC=%ERRORLEVEL%
echo === npm audit (dev tools, informational) ===
call npm audit
echo.
echo pip-audit exit code: %PYRC%   npm audit (prod) exit code: %NPMRC%   (0 = nothing found)
