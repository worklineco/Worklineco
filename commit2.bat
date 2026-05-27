@echo off
chcp 65001 >nul
cd /d "C:\Users\SOMYA JAIN\OneDrive\Somya\New project\WorkLine Co"
git add -A
git commit -m "Move unique appeals to button row with inline styling" -m "- Repositioned unique appeals badge to button row" -m "- Matches white button styling (Import/Export buttons)" -m "- Positioned before Import Excel button" -m "- Saves vertical space by removing separate banner" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
echo Done!
