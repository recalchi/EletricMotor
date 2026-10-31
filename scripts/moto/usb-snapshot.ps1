# Fotografia dos dispositivos USB/seriais presentes no computador (só leitura do Gerenciador de Dispositivos).
# Rode antes e depois de plugar algo no NOTEBOOK (ESP32, celular, medidor USB) para ver o que apareceu.
#   powershell -ExecutionPolicy Bypass -File scripts/moto/usb-snapshot.ps1 -Fase antes
param([Parameter(Mandatory)][string]$Fase, [string]$Pasta)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Pasta) { $Pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd')) }
New-Item -ItemType Directory -Force $Pasta | Out-Null
$devs = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(USB|USBSTOR|FTDIBUS|BTHENUM|BTHLE)' -or $_.Class -in 'Ports', 'USB', 'Bluetooth' } |
  ForEach-Object { [ordered]@{ fase = $Fase; nome = $_.FriendlyName; classe = "$($_.Class)"; status = "$($_.Status)"; id = $_.InstanceId } }
$out = Join-Path $Pasta "usb-$Fase.json"
$devs | ConvertTo-Json -Depth 3 | Set-Content -Path $out -Encoding UTF8
Write-Host "$(@($devs).Count) dispositivos registrados em $out" -ForegroundColor Green
