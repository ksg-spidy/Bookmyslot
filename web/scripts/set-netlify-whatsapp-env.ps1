# Set WhatsApp env vars on Netlify for bookbadmintonslot.
# Prereqs: npm i -g netlify-cli (or npx netlify-cli), then: netlify login
# Run from repo:  .\web\scripts\set-netlify-whatsapp-env.ps1

param(
  [string]$Site = "bookbadmintonslot",
  [string]$PhoneNumberId = "1064878106717930",
  [string]$VerifyToken = "bookmyslot-wa-verify-2026",
  [string]$AccessToken = "",
  [string]$AppSecret = ""
)

$ErrorActionPreference = "Stop"

if (-not $AccessToken) {
  $AccessToken = Read-Host "Paste WHATSAPP_ACCESS_TOKEN (Meta → API Setup → Generate access token)"
}
if (-not $AppSecret) {
  $AppSecret = Read-Host "Paste WHATSAPP_APP_SECRET (Meta → App settings → Basic → App secret)"
}

$vars = @{
  WHATSAPP_PHONE_NUMBER_ID = $PhoneNumberId
  WHATSAPP_VERIFY_TOKEN     = $VerifyToken
  WHATSAPP_ACCESS_TOKEN     = $AccessToken
  WHATSAPP_APP_SECRET       = $AppSecret
}

Write-Host "Setting WhatsApp env on site: $Site"
foreach ($key in $vars.Keys) {
  $val = $vars[$key]
  npx --yes netlify-cli env:set $key $val --context production --site $Site
  npx --yes netlify-cli env:set $key $val --context deploy-preview --site $Site
  Write-Host "  set $key"
}

Write-Host ""
Write-Host "Done. Trigger a new deploy:"
Write-Host "  npx netlify-cli deploy --prod --site $Site --build"
Write-Host ""
Write-Host "Meta webhook (WhatsApp → Configuration):"
Write-Host "  URL:   https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp"
Write-Host "  Token: $VerifyToken"
Write-Host "  Subscribe: messages"
