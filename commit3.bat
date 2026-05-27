@echo off
chcp 65001 >nul
cd /d "C:\Users\SOMYA JAIN\OneDrive\Somya\New project\WorkLine Co"
git add -A
git commit -m "Add feedback form and global search functionality" -m "- Added floating feedback button on all pages with image upload" -m "- Integrated Gmail SMTP for feedback email notifications" -m "- Added global search bar to GSTAT register for cross-field searching" -m "- Feedback emails sent to somyajainworkline@gmail.com with attachments" -m "- Added nodemailer dependency for email handling" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
echo.
echo Setup Instructions:
echo ==================
echo.
echo 1. Get Gmail App Password from: https://myaccount.google.com/apppasswords
echo 2. Add to .env.local:
echo    GMAIL_APP_PASSWORD=your_password_here
echo 3. Run: npm install
echo 4. Test locally: npm run dev
echo.
pause
