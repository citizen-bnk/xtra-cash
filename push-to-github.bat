@echo off
setlocal
title XTRA-CASH - Push to GitHub
set "REPO_URL=https://github.com/citizen-bnk/xtra-cash.git"
set "BRANCH=main"

rem Always run from the folder this file lives in (the xtra-cash project folder)
cd /d "%~dp0"

echo.
echo  ==============================================
echo    XTRA-CASH  -  Push to GitHub
echo    %REPO_URL%
echo  ==============================================
echo.

where git >nul 2>nul
if errorlevel 1 goto :nogit

if not exist ".git" goto :norepo

rem Make sure the GitHub remote is set correctly
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)

rem Git needs a name/email for commits; set them for this project only if missing
git config user.name >nul 2>nul || git config user.name "XTRA-CASH Developer"
git config user.email >nul 2>nul || git config user.email "meshthang@gmail.com"

git checkout -B %BRANCH% >nul 2>nul

rem Commit any changes you have made since the last push
git add -A
git diff --cached --quiet
if errorlevel 1 (
  echo  Saving your latest changes...
  git commit -m "Update from %COMPUTERNAME% on %DATE% %TIME%"
) else (
  echo  No new changes to save - pushing existing commits.
)

echo.
echo  Pushing to GitHub. If a GitHub sign-in window opens, sign in and approve.
echo.
git push -u origin %BRANCH%
if not errorlevel 1 goto :done

echo.
echo  GitHub has commits this computer doesn't have yet. Merging them in and trying again...
git pull origin %BRANCH% --allow-unrelated-histories --no-edit
if errorlevel 1 goto :conflict
git push -u origin %BRANCH%
if errorlevel 1 goto :failed

:done
echo.
echo  SUCCESS - your code is on GitHub:
echo  https://github.com/citizen-bnk/xtra-cash
echo.
pause
exit /b 0

:nogit
echo  Git is not installed on this computer.
echo  1. Download it from https://git-scm.com/download/win and install it (the default options are fine).
echo  2. Then double-click this file again.
echo.
start "" "https://git-scm.com/download/win"
pause
exit /b 1

:norepo
echo  This file must be inside the unzipped "xtra-cash" folder (the one that contains
echo  apps, packages and README.md). Move it there and double-click it again.
echo.
pause
exit /b 1

:conflict
echo.
echo  The changes on GitHub clash with the ones on this computer, so Git stopped.
echo  Nothing was lost. Ask Claude for help and paste the messages above.
echo.
pause
exit /b 1

:failed
echo.
echo  The push did not go through. Common causes:
echo   - You signed in with a GitHub account that has no write access to citizen-bnk/xtra-cash
echo   - No internet connection
echo  Read the messages above, fix the issue, then double-click this file again.
echo.
pause
exit /b 1
