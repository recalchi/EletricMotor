# Painel ao vivo do teste do conector de 3 pinos: mostra o que o ESP32 lê no pino 34 (tensão da linha) e na UART2 (pino 16).
# Só lê a serial do ESP32; nada é enviado à moto. Log em hw-logs/moto/<data>/ao-vivo.log.
#   powershell -ExecutionPolicy Bypass -File scripts/moto/linha-ao-vivo.ps1
param([string]$Porta, [int]$Minutos = 60)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd'))
New-Item -ItemType Directory -Force $pasta | Out-Null
$log = Join-Path $pasta 'ao-vivo.log'
if (-not $Porta) {
  $cp = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'CP210|CH340|USB-SERIAL' -and $_.Name -match '\((COM\d+)\)' })
  if (-not $cp.Count) { throw 'Placa não encontrada: confira o cabo USB.' }
  $Porta = [regex]::Match($cp[0].Name, 'COM\d+').Value
}
$sp = New-Object System.IO.Ports.SerialPort $Porta, 115200, 'None', 8, 'One'
$sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.ReadTimeout = 500; $sp.NewLine = "`n"
$sp.Open()
Write-Host "Ao vivo em $Porta (Ctrl+C para parar). Pino 34 = tensão da linha; u2 = bytes no pino 16." -ForegroundColor Cyan
Add-Content $log "=== início $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
$visto = @{}
$end = (Get-Date).AddMinutes($Minutos)
try {
  while ((Get-Date) -lt $end) {
    try { $l = $sp.ReadLine().TrimEnd("`r") } catch [TimeoutException] { continue } catch {
      # cabo USB tirado (ex.: ESP32 passado para o power bank): espera a placa voltar e reabre
      Write-Host "$(Get-Date -Format 'HH:mm:ss')  ESP32 desconectado do notebook, aguardando voltar..." -ForegroundColor DarkYellow
      try { $sp.Close() } catch {}
      do { Start-Sleep -Seconds 2; try { $sp.Open() } catch {} } until ($sp.IsOpen -or (Get-Date) -ge $end)
      if ($sp.IsOpen) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  ESP32 de volta." -ForegroundColor Cyan }
      continue
    }
    $k = $l + '|' + (Get-Date -Format 'HHmmss')
    if ($visto.ContainsKey($k)) { continue }
    $visto[$k] = 1
    $t = Get-Date -Format 'HH:mm:ss'
    if ($l -match '"v34":([\d.]+)') {
      $v = [double]$Matches[1]
      $u = [regex]::Matches($l, '"u2([bnel])":(\d+)') | ForEach-Object { "$($_.Groups[1].Value)=$($_.Groups[2].Value)" }
      $st, $cor = if ($v -gt 3.0) { 'ALTO DEMAIS', 'Red' } elseif ($v -ge 2.3) { 'OK (linha alta)', 'Green' } elseif ($v -ge 0.3) { 'MEIO', 'Yellow' } else { 'BAIXO / sem nada', 'DarkGray' }
      $txt = "$t  pino34 = {0:N2} V  {1,-16}  u2: {2}" -f $v, $st, ($u -join ' ')
      Write-Host $txt -ForegroundColor $cor
      Add-Content $log $txt
    } elseif ($l -match '^# (u2|fw|v34)') {
      Write-Host "$t  $l" -ForegroundColor Magenta
      Add-Content $log "$t  $l"
    }
  }
} finally { $sp.Close(); Add-Content $log "=== fim $(Get-Date -Format 'HH:mm:ss') ===" }
