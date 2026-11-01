# Escuta uma linha serial da moto pelo ESP32 usado como "cabo USB-serial" (só recepção, nada é enviado).
# Montagem (guia: public/guia/teste-conector-3pinos.html): jumper EN→GND na placa (o ESP32 fica parado e o pino TX
# passa a ser a entrada da ponte CP2102), GND da placa → fio preto do conector, fio de sinal → resistor(es) → pino TX.
# Testa as velocidades comuns e guarda os bytes em hexa para decodificar depois.
#   powershell -ExecutionPolicy Bypass -File scripts/moto/uart-sniff.ps1 -Fase amarelo-ligada
#   (-Bauds 115200 para uma só; -Segundos por velocidade; -Porta COM3 se houver mais de uma placa)
param([Parameter(Mandatory)][string]$Fase, [string]$Bauds = '115200,9600,19200,38400,57600,4800,2400,1200',
  [int]$Segundos = 8, [string]$Porta, [string]$Pasta)
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

# -Bauds chega como texto quando o script é chamado com -File ("115200,9600")
$res = foreach ($b in @($Bauds -split '[,; ]+' | Where-Object { $_ } | ForEach-Object { [int]$_ })) {
  $sp = New-Object System.IO.Ports.SerialPort $Porta, $b, 'None', 8, 'One'
  $sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.Handshake = 'None'; $sp.ReadTimeout = 200
  $frames = 0
  $h = Register-ObjectEvent -InputObject $sp -EventName ErrorReceived -Action { $global:emFrames++ }
  $global:emFrames = 0
  try { $sp.Open() } catch { Unregister-Event -SourceIdentifier $h.Name; throw "Não abri $Porta ($($_.Exception.Message)). Feche o app/monitor que estiver usando a porta." }
  Start-Sleep -Milliseconds 200; $sp.DiscardInBuffer()
  Write-Host ("Ouvindo {0} baud por {1} s... (só recepção)" -f $b, $Segundos) -ForegroundColor Cyan
  $bytes = New-Object Collections.Generic.List[byte]
  $end = (Get-Date).AddSeconds($Segundos)
  try {
    while ((Get-Date) -lt $end) {
      $n = $sp.BytesToRead
      if ($n) { $buf = New-Object byte[] $n; $r = $sp.Read($buf, 0, $n); for ($i = 0; $i -lt $r; $i++) { $bytes.Add($buf[$i]) } }
      else { Start-Sleep -Milliseconds 20 }
    }
  } finally { $sp.Close(); Unregister-Event -SourceIdentifier $h.Name; $frames = $global:emFrames }

  $arr = $bytes.ToArray()
  $hex = ($arr | ForEach-Object { $_.ToString('X2') }) -join ' '
  Set-Content -Path (Join-Path $Pasta "uart-$Fase-$b.hex") -Value $hex -Encoding ASCII
  $print = @($arr | Where-Object { ($_ -ge 32 -and $_ -lt 127) -or $_ -in 10, 13 }).Count
  $distinct = @($arr | Select-Object -Unique).Count
  # bytes que mais se repetem: um cabeçalho de pacote costuma aparecer no topo
  $top = ($arr | Group-Object | Sort-Object Count -Descending | Select-Object -First 4 | ForEach-Object { '{0:X2}×{1}' -f [byte]$_.Name, $_.Count }) -join ' '
  $o = [pscustomobject]@{ baud = $b; bytes = $arr.Count; erros = $frames; ascii = $(if ($arr.Count) { [int](100 * $print / $arr.Count) } else { 0 })
    distintos = $distinct; topo = $top; inicio = (($arr | Select-Object -First 24 | ForEach-Object { $_.ToString('X2') }) -join ' ') }
  Write-Host ("  {0} bytes · erros de quadro {1} · ASCII {2}% · {3} valores distintos" -f $o.bytes, $o.erros, $o.ascii, $o.distintos)
  $o
}

# Velocidade certa: muitos bytes, poucos erros de quadro; bytes 00/FF sozinhos costumam ser velocidade errada
$best = $res | Where-Object bytes | Sort-Object @{ e = { $_.erros / [Math]::Max(1, $_.bytes) } }, @{ e = { -$_.distintos } } | Select-Object -First 1
$sum = @("## UART — fase $Fase ($(Get-Date -Format 'HH:mm'), $Porta, $Segundos s por velocidade)", '',
  '| baud | bytes | erros de quadro | ASCII | distintos | mais repetidos | primeiros bytes |', '|---|---|---|---|---|---|---|') +
  @($res | ForEach-Object { "| $($_.baud) | $($_.bytes) | $($_.erros) | $($_.ascii)% | $($_.distintos) | $($_.topo) | ``$($_.inicio)`` |" }) +
  @('', $(if ($best) { "Mais provável: **$($best.baud) baud** (arquivo uart-$Fase-$($best.baud).hex)." } else { 'Nenhum byte em nenhuma velocidade: linha parada, fio errado ou sem o jumper EN→GND.' }), '')
Add-Content -Path (Join-Path $Pasta 'uart-resumo.md') -Value $sum -Encoding UTF8
$sum | ForEach-Object { Write-Host $_ }
