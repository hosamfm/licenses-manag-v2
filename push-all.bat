@echo off
chcp 65001 > nul
echo دفع التغييرات إلى جميع المستودعات البعيدة...
git push origin master
git push aldoctorcenter master
echo تم الانتهاء من دفع التغييرات بنجاح!
pause
