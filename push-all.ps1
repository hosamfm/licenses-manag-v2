# سكريبت لدفع التغييرات إلى جميع المستودعات البعيدة
Write-Host "دفع التغييرات إلى جميع المستودعات البعيدة..." -ForegroundColor Green

# دفع التغييرات إلى المستودع الأول
Write-Host "`n[1/2] دفع التغييرات إلى المستودع الأول (licenses-manag-v2)..." -ForegroundColor Cyan
git push origin master

# دفع التغييرات إلى المستودع الثاني
Write-Host "`n[2/2] دفع التغييرات إلى المستودع الثاني (licenses-manag-aldoctorcenter)..." -ForegroundColor Cyan
git push aldoctorcenter master

Write-Host "`nتم الانتهاء من دفع التغييرات بنجاح!" -ForegroundColor Green
Write-Host "اضغط أي مفتاح للخروج..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
