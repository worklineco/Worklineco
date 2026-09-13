@echo off
REM ---------------------------------------------------------------
REM  WorkLine Co - one-click deploy
REM  Double-click this file to send the latest changes to GitHub.
REM  Vercel then rebuilds the site automatically.
REM ---------------------------------------------------------------

cd /d "%~dp0"

REM Never open the text editor during a merge.
set GIT_MERGE_AUTOEDIT=no

echo.
echo  WorkLine Co - sending changes to GitHub
echo  ---------------------------------------
echo.

REM Keep the temporary npm download folder out of the project.
git rm -r --cached --ignore-unmatch -q .npm-cache >nul 2>&1

echo  [1/4] Getting the latest from GitHub...
git pull --no-edit
if errorlevel 1 goto trouble

echo.
echo  [2/4] Collecting your changes...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo  Nothing new to send. Everything is already on GitHub.
  goto done
)

echo.
echo  [3/4] Saving...
set MESSAGE=%*
if "%MESSAGE%"=="" set MESSAGE=Update from WorkLine Co
git commit -m "%MESSAGE%"
if errorlevel 1 goto trouble

echo.
echo  [4/4] Sending to GitHub...
git push
if errorlevel 1 goto trouble

echo.
echo  ======================================================
echo   Done. Your site updates in a couple of minutes.
echo  ======================================================
goto done

:trouble
echo.
echo  ======================================================
echo   Something needs attention. Copy the message above
echo   and send it to Claude.
echo  ======================================================

:done
echo.
pause
