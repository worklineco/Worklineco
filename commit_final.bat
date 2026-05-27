@echo off
chcp 65001 >nul
cd /d "C:\Users\SOMYA JAIN\OneDrive\Somya\New project\WorkLine Co"
git add -A
git commit -m "Configure feedback system to use existing SMTP variables" -m "- Updated feedback API to use SMTP_USER and SMTP_APP_PASSWORD" -m "- Uses existing Vercel environment variables" -m "- Feedback emails sent to somyajainworkline@gmail.com" -m "- Global search bar added to GSTAT register" -m "- Floating feedback button available on all pages" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
echo.
echo Deployment started! Changes pushed to Vercel.
echo.
echo Features ready:
echo ✓ Global search bar in GSTAT register
echo ✓ Floating feedback button on all pages
echo ✓ Email notifications to somyajainworkline@gmail.com
echo.
pause
