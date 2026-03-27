# 1) GANTI nilai orderId dengan id hasil query SQL
# 2) Jalankan file ini di PowerShell (bukan SQL Editor)

$body = @{
  operation = "completeOrder"
  orderId = "PASTE_ID_DISINI"
  actorId = "owner_test"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "https://jsid.vercel.app/api/wallet/pay" -ContentType "application/json" -Body $body
