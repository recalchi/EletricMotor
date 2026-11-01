# Lê o NOSSO gateway (ESP32 "Faísca", esp32-hub) pelo cabo USB, sem instalar nada (PowerShell + .NET do Windows).
# Só escuta: não envia nada à placa e não reinicia a placa (DTR/RTS desligados). A moto não é tocada.
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/moto/gateway-log.ps1 -Fase ligada -Segundos 120
#   (-Porta COM7 se houver mais de uma placa; sem -Porta acha a ponte CP210x sozinho)
# Saída: hw-logs/moto/<data>/gateway-<fase>.log (bruto) e gateway-resumo.md (uma seção por fase).
param([Parameter(Mandatory)][string]$Fase, [int]$Segundos = 60, [string]$Porta, [string]$Pasta)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Pasta) { $Pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd')) }
New-Item -ItemType Directory -Force $Pasta | Out-Null

if (-not $Porta) {
  $cp = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'CP210|CH340|USB-SERIAL' -and $_.Name -match '\((COM\d+)\)' })
  if (-not $cp.Count) { throw 'Placa não encontrada: confira o cabo USB (precisa ser cabo de DADOS) e o driver CP210x.' }
  $Porta = [regex]::Match($cp[0].Name, 'COM\d+').Value
  Write-Host "Placa achada em $Porta ($($cp[0].Name))"
}
$out = Join-Path $Pasta "gateway-$Fase.log"
$sp = New-Object System.IO.Ports.SerialPort $Porta, 115200
$sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.Handshake = 'None'
# Latin-1 = 1 byte por caractere: o lixo do boot do ESP32 (outra velocidade) não trava o decodificador
$sp.Encoding = [Text.Encoding]::GetEncoding(28591)
try { $sp.Open() } catch { throw "Não abri $Porta ($($_.Exception.Message)). Feche o app EletricMotor/monitor que estiver usando a porta." }
# Logo após abrir, o driver CP210x pode devolver o resto da sessão anterior milhares de vezes (visto em 01/11/2026)
Start-Sleep -Milliseconds 300; $sp.DiscardInBuffer()

Write-Host "Ouvindo o gateway ($Fase) por $Segundos s... (só recepção)" -ForegroundColor Cyan
$msgs = 0; $lost = 0; $lastSeq = $null; $fw = $null; $ds = @{}; $dsid = $null; $ble = 0; $heap = $null
$t1 = $null; $hash = [ordered]@{}; $bad = 0; $boots = @(); $up0 = $null; $t0 = Get-Date; $prev = $null; $dup = 0
$end = (Get-Date).AddSeconds($Segundos)
$w = New-Object System.IO.StreamWriter($out, $true, (New-Object Text.UTF8Encoding $false))
$buf = New-Object Text.StringBuilder
# ReadLine do .NET repete pedaços do buffer quando chegam bytes inválidos: lê o que houver e corta nas quebras de linha
$lines = {
  $buf.Append($sp.ReadExisting()) | Out-Null
  $s = $buf.ToString(); $i = $s.LastIndexOf("`n")
  if ($i -lt 0) { return }
  $buf.Clear().Append($s.Substring($i + 1)) | Out-Null
  $s.Substring(0, $i).Split("`n") | ForEach-Object { $_.TrimEnd("`r") }
}
try {
  while ((Get-Date) -lt $end) {
    if (-not $sp.BytesToRead) { Start-Sleep -Milliseconds 50; continue }
    foreach ($line in (& $lines)) {
    if (-not $line) { continue }
    # Mensagens têm seq e nunca se repetem; pedaço igual ao anterior é eco do driver
    if ($line -eq $prev -and -not $line.StartsWith('{')) { $dup++; continue }
    $prev = $line
    $w.WriteLine("$(Get-Date -Format 'HH:mm:ss.fff') $line")
    if ($line -match 'rst:0x[0-9a-f]+ \(([A-Z_]+)\)') { $boots += "$([int]((Get-Date) - $t0).TotalSeconds) s ($($Matches[1]))"; continue }
    if ($line.StartsWith('#')) {
      $k = $line -replace '\d+', 'N'
      if ($hash.Contains($k)) { $hash[$k].n++ } else { $hash[$k] = @{ n = 1; ex = $line }; Write-Host "  placa: $line" }
      continue
    }
    if (-not $line.StartsWith('{')) { continue }  # texto de boot do ESP32
    try { $m = $line | ConvertFrom-Json } catch { $bad++; continue }
    if ($m.dev -ne 'esp32-hub') { continue }
    $msgs++
    if ($null -eq $up0) { $up0 = $m.st.up }
    if ($null -ne $lastSeq -and $m.seq -gt $lastSeq + 1) { $lost += $m.seq - $lastSeq - 1 }
    $lastSeq = $m.seq
    if ($m.st) {
      if ($m.st.fw) { $fw = $m.st.fw }
      if ($m.st.ds) { $ds[$m.st.ds] = 1 + [int]$ds[$m.st.ds] }
      if ($m.st.dsid) { $dsid = $m.st.dsid }
      if ($m.st.ble) { $ble = 1 }
      $heap = $m.st.heap
    }
    if ($null -ne $m.ch.t1) {
      $v = [double]$m.ch.t1
      if (-not $t1) { $t1 = @{ min = $v; max = $v; last = $v } } else { $t1.min = [Math]::Min($t1.min, $v); $t1.max = [Math]::Max($t1.max, $v); $t1.last = $v }
    }
    if ($msgs % 10 -eq 1) { Write-Host ("  #{0} t1={1} ds={2} ble={3}" -f $m.seq, $m.ch.t1, $m.st.ds, $m.st.ble) }
    }
  }
} finally { $w.Close(); $sp.Close() }

$f = { param($x) if ($null -eq $x) { '—' } else { ([double]$x).ToString('0.00', [Globalization.CultureInfo]'pt-BR') } }
$sum = @(
  "## Gateway — fase $Fase ($(Get-Date -Format 'HH:mm'), $Segundos s, $Porta)"
  "- Mensagens: $msgs · perdidas: $lost · linhas inválidas: $bad$(if ($dup) { " · ecos do driver descartados: $dup" })"
  "- Reinícios da placa: $(if ($boots.Count) { $boots -join ', ' } else { 'nenhum' }) · placa ligada havia $(if ($null -ne $up0) { "$up0 s" } else { '—' }) na 1ª mensagem$(if ($boots.Count -and [int]$boots[0].Split(' ')[0] -le 2) { ' (o 1º reinício foi ao abrir a porta, não é da moto)' })"
  "- Firmware: $(if ($fw) { $fw } else { '—' }) · heap livre: $heap KB · Bluetooth com cliente: $(if ($ble) { 'sim' } else { 'não' })"
  "- Sensor de temperatura: $(if ($ds.Count) { ($ds.Keys | ForEach-Object { "$_ $($ds[$_])×" }) -join ', ' } else { '—' })$(if ($dsid) { " · id $dsid" })"
  "- t1 (°C): mín $(& $f $t1.min) · máx $(& $f $t1.max) · último $(& $f $t1.last)"
  "- Mensagens da placa: $(if ($hash.Count) { ($hash.Values | ForEach-Object { "``$($_.ex)`` ($($_.n)×)" }) -join '; ' } else { 'nenhuma' })"
  ""
)
Add-Content -Path (Join-Path $Pasta 'gateway-resumo.md') -Value $sum -Encoding UTF8
$sum | ForEach-Object { Write-Host $_ }
if (-not $msgs) { Write-Host 'Nenhuma mensagem: placa sem energia, cabo só de carga ou porta errada.' -ForegroundColor Yellow }
