# Escuta o gateway (firmware >= 1.4.0) pelo USB e guarda o que ele ouviu no fio de sinal da moto (UART2, GPIO16).
# O ESP32 só recebe; este script só lê a serial do ESP32. Guia: public/guia/teste-conector-3pinos.html
#   powershell -ExecutionPolicy Bypass -File scripts/moto/u2-escuta.ps1 -Fase verde-ligada -Segundos 120
param([Parameter(Mandatory)][string]$Fase, [int]$Segundos = 120, [string]$Porta, [string]$Pasta)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Pasta) { $Pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd')) }
New-Item -ItemType Directory -Force $Pasta | Out-Null
if (-not $Porta) {
  $cp = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'CP210|CH340|USB-SERIAL' -and $_.Name -match '\((COM\d+)\)' })
  if (-not $cp.Count) { throw 'Placa não encontrada: confira o cabo USB e o driver CP210x.' }
  $Porta = [regex]::Match($cp[0].Name, 'COM\d+').Value
}
$sp = New-Object System.IO.Ports.SerialPort $Porta, 115200, 'None', 8, 'One'
$sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.ReadTimeout = 500; $sp.NewLine = "`n"
$sp.Open()
$log = Join-Path $Pasta "u2-$Fase.log"
$linhas = New-Object Collections.Generic.List[string]
$visto = @{}
$end = (Get-Date).AddSeconds($Segundos)
Write-Host "Escutando $Porta por $Segundos s (fase $Fase)..." -ForegroundColor Cyan
try {
  while ((Get-Date) -lt $end) {
    try { $l = $sp.ReadLine().TrimEnd("`r") } catch [TimeoutException] { continue }
    # o driver CP210x às vezes repete uma linha em rajada (eco): guarda cada linha uma vez por segundo
    $k = $l + '|' + (Get-Date -Format 'HHmmss')
    if ($visto.ContainsKey($k)) { continue }
    $visto[$k] = 1
    if ($l -match '^# u2|"u2b"') {
      $linhas.Add((Get-Date -Format 'HH:mm:ss') + ' ' + $l)
      if ($l -match '^# u2') { Write-Host $l -ForegroundColor Yellow }
    }
  }
} finally { $sp.Close() }
Set-Content -Path $log -Value $linhas -Encoding UTF8

$hex = @($linhas | Where-Object { $_ -match '# u2 baud' })
$porBaud = $hex | ForEach-Object { if ($_ -match 'baud=(\d+) n=(\d+) err=(\d+)') { [pscustomobject]@{ baud = [int]$Matches[1]; n = [int]$Matches[2]; err = [int]$Matches[3] } } } |
  Group-Object baud | ForEach-Object { [pscustomobject]@{ baud = $_.Name; bytes = ($_.Group | Measure-Object n -Sum).Sum; erros = ($_.Group | Measure-Object err -Sum).Sum } }
$trava = $linhas | Where-Object { $_ -match 'travada em (\d+)' } | Select-Object -Last 1
$sum = @("## UART2 (GPIO16) — fase $Fase ($(Get-Date -Format 'HH:mm'), $Segundos s)", '',
  '| baud | bytes | erros de quadro/break |', '|---|---|---|') +
  @($porBaud | ForEach-Object { "| $($_.baud) | $($_.bytes) | $($_.erros) |" }) +
  @('', $(if ($trava) { "Travou: $($trava -replace '^.*# u2 ', '')." } elseif ($hex.Count) { 'Chegaram bytes, sem travar numa velocidade.' } else { 'Nenhum byte em nenhuma velocidade.' }), "Log: u2-$Fase.log", '')
Add-Content -Path (Join-Path $Pasta 'uart-resumo.md') -Value $sum -Encoding UTF8
$sum | ForEach-Object { Write-Host $_ }
