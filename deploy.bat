@echo off
cd /d "C:\Users\SOMYA JAIN\OneDrive\Somya\New project\WorkLine Co"

echo Staging changes...
git add -A

echo Committing changes...
git commit -m "Add real-time unique appeal filtering with live count display" -m "- Added filteredUniqueAppeals metric to count unique appeals among filtered results" -m "- Added hasActiveFilters detector to show/hide filter status" -m "- Updated header metric to display 'filtered / total' when filters are active" -m "- Added filter status message showing row count and unique appeal count" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo Pushing to remote...
git push

echo Deployment started on Vercel!
pause
