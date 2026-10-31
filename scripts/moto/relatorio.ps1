# Gera o relatório da captura na moto a partir de hw-logs/moto/<data>/ (ble-*.jsonl, usb-*.json, notas.md).
#   powershell -ExecutionPolicy Bypass -File scripts/moto/relatorio.ps1 [-Data 2026-10-31] [-SemNuvem]
# Saídas:
#   hw-logs/moto/<data>/relatorio.md                 completo (fica no computador)
#   docs/vehicle-evidence/capturas/<data>.md         versão PÚBLICA: só candidatos da moto, endereços mascarados
#   <OneDrive>/EletricMotor-capturas/<data>/         cópia privada de tudo (bruto + relatório) para análise
# Privacidade: aparelhos que já estavam no ar com a moto desligada (celulares, relógios, vizinhos) não entram em
# nenhum relatório — só a contagem. Nada de SSID, localização ou dados pessoais.
param([string]$Data = (Get-Date -Format 'yyyy-MM-dd'), [switch]$SemNuvem)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dir = Join-Path $root "hw-logs\moto\$Data"
if (-not (Test-Path $dir)) { throw "Nada capturado em $dir" }

$NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'  # nosso gateway (Faísca)
$COMPANY = @{ '0x004C' = 'Apple'; '0x0006' = 'Microsoft'; '0x0075' = 'Samsung'; '0x00E0' = 'Google'; '0x0157' = 'Huami/Amazfit';
  '0x038F' = 'Xiaomi'; '0x027D' = 'Huawei'; '0x0171' = 'Amazon'; '0x0087' = 'Garmin'; '0x0059' = 'Nordic (genérico)';
  '0x02E5' = 'Espressif (genérico)'; '0x0499' = 'Ruuvi'; '0x0822' = 'adafruit'
}
$PHONEISH = 'Apple', 'Microsoft', 'Samsung', 'Google', 'Huami/Amazfit', 'Xiaomi', 'Huawei', 'Amazon', 'Garmin'

# ── Bluetooth: agrega por endereço e fase
$rows = foreach ($f in Get-ChildItem $dir -Filter 'ble-*.jsonl') { Get-Content $f.FullName -Encoding UTF8 | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json } }
$rows = @($rows | Where-Object { $_.fase -ne 'teste' })
$fases = @($rows.fase | Select-Object -Unique)
$byAddr = $rows | Group-Object addr
$devs = foreach ($g in $byAddr) {
  $r = $g.Group
  $per = @{}
  foreach ($fg in ($r | Group-Object fase)) { $per[$fg.Name] = [ordered]@{ n = $fg.Count; rssiMax = ($fg.Group.rssi | Measure-Object -Maximum).Maximum } }
  $names = @($r.name | Where-Object { $_ } | Select-Object -Unique)
  $uuids = @($r.uuids | ForEach-Object { $_ } | Where-Object { $_ } | Select-Object -Unique)
  $comps = @($r.mfr | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { $_.company } | Select-Object -Unique)
  $vendor = @($comps | ForEach-Object { if ($COMPANY[$_]) { $COMPANY[$_] } else { $_ } })
  $samples = @($r.mfr | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { "$($_.company):$($_.hex)" } | Select-Object -Unique | Select-Object -First 6)
  $svc = @($r.svcData | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { "$($_.type):$($_.hex)" } | Select-Object -Unique | Select-Object -First 6)
  $inBase = $per.ContainsKey('base')
  $onAfter = @('ligando', 'ligada') | Where-Object { $per.ContainsKey($_) }
  $jump = if ($inBase -and $onAfter) { ($onAfter | ForEach-Object { $per[$_].rssiMax } | Measure-Object -Maximum).Maximum - $per['base'].rssiMax } else { $null }
  $ours = $uuids -contains $NUS
  $phone = @($vendor | Where-Object { $_ -in $PHONEISH }).Count -gt 0
  $named = @($names | Where-Object { $_ -match 'voltz|evs|bms|batt|tft|dash|moto|scooter|ev[-_ ]|ctrl|vcu|ecu|lock|key' }).Count -gt 0
  $why = @()
  if ($ours) { $why += 'nosso gateway (Faísca)' }
  elseif (-not $inBase -and $onAfter) { $why += 'apareceu só com a moto ligada' }
  if ($jump -ne $null -and $jump -ge 10) { $why += "sinal subiu $jump dB ao ligar" }
  if ($named) { $why += 'nome sugere veículo/bateria' }
  $cand = (-not $ours) -and (-not $phone -or $named) -and $why.Count -gt 0
  [pscustomobject]@{ addr = $g.Name; per = $per; names = $names; uuids = $uuids; vendor = $vendor; samples = $samples; svc = $svc
    kinds = @($r.kind | Select-Object -Unique); ours = $ours; phone = $phone; cand = $cand; why = ($why -join '; ') }
}
$cands = @($devs | Where-Object cand | Sort-Object { - (($_.per.Values | ForEach-Object { $_.rssiMax } | Measure-Object -Maximum).Maximum) })
$ourDev = @($devs | Where-Object ours)
$others = @($devs | Where-Object { -not $_.cand -and -not $_.ours }).Count

function Mask([string]$a) { $a.Substring(0, 6) + '…' + (([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($a)) | Select-Object -First 2 | ForEach-Object { $_.ToString('x2') }) -join '') }
function Lines($list, [bool]$public) {
  foreach ($d in $list) {
    $addr = if ($public) { Mask $d.addr } else { $d.addr }
    $ph = ($fases | ForEach-Object { if ($d.per[$_]) { "$_ $($d.per[$_].n)× (máx $($d.per[$_].rssiMax) dBm)" } else { "$_ —" } }) -join ' · '
    "### $addr $(if ($d.names) { '— ' + ($d.names -join ', ') })"
    "- Por que: $($d.why)"
    "- Fases: $ph"
    "- Tipo de anúncio: $($d.kinds -join ', ')"
    if ($d.uuids) { "- Serviços anunciados: $($d.uuids -join ', ')" }
    if ($d.vendor) { "- Fabricante (company ID): $($d.vendor -join ', ')" }
    if ($d.samples) { "- Dados de fabricante (amostras): ``$($d.samples -join '`` ``')``" }
    if ($d.svc) { "- Dados de serviço (amostras): ``$($d.svc -join '`` ``')``" }
    ''
  }
}

# ── USB: diferenças entre fotografias
$usb = @{}
foreach ($f in Get-ChildItem $dir -Filter 'usb-*.json') { $usb[$f.BaseName.Substring(4)] = @(Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json) }
$usbLines = @()
$keys = @($usb.Keys | Sort-Object)
for ($i = 1; $i -lt $keys.Count; $i++) {
  $a = @($usb[$keys[$i - 1]].id); $b = $usb[$keys[$i]]
  $new = @($b | Where-Object { $_.id -notin $a })
  $usbLines += "- **$($keys[$i - 1]) → $($keys[$i])**: " + $(if ($new) { ($new | ForEach-Object { "$($_.nome) [$($_.classe)] ``$($_.id -replace '\\[^\\]*$', '')``" }) -join '; ' } else { 'nada novo' })
}

$notas = Join-Path $dir 'notas.md'
$notasTxt = if (Test-Path $notas) { Get-Content $notas -Raw -Encoding UTF8 } else { '_(sem notas — preencha hw-logs/moto/<data>/notas.md)_' }
$head = @("# Captura na moto — $Data", '', "Fases capturadas: $($fases -join ', ') · $($rows.Count) anúncios · $(@($devs).Count) aparelhos distintos", '',
  '> Somente recepção: nada foi conectado nem enviado a aparelhos da moto. Aparelhos que já estavam no ar com a moto',
  "> desligada não aparecem aqui ($others descartados por privacidade).", '')
$body = @('## Candidatos da moto (Bluetooth LE)', '')
$tail = @('## Nosso gateway', '', $(if ($ourDev) { "Faísca visto: $((($ourDev[0].per.Values | ForEach-Object { $_.rssiMax }) | Measure-Object -Maximum).Maximum) dBm de sinal máximo." } else { 'Não visto (normal se ficou em casa).' }), '',
  '## USB (dispositivos que apareceram no notebook)', '', $(if ($usbLines) { $usbLines } else { '_(sem fotografias USB)_' }), '', '## Notas do teste', '', $notasTxt)
$none = @('Nenhum aparelho Bluetooth LE novo apareceu ao ligar a moto. Conclusão provável: a moto não anuncia Bluetooth LE', '(pode ainda ter Bluetooth clássico — confira a lista "dispositivos disponíveis" do celular nas notas).', '')
$full = $head + $body + $(if ($cands) { Lines $cands $false } else { $none }) + $tail
$pub = $head + $body + $(if ($cands) { Lines $cands $true } else { $none }) + $tail
Set-Content -Path (Join-Path $dir 'relatorio.md') -Value $full -Encoding UTF8
$pubDir = Join-Path $root 'docs\vehicle-evidence\capturas'
New-Item -ItemType Directory -Force $pubDir | Out-Null
Set-Content -Path (Join-Path $pubDir "$Data.md") -Value $pub -Encoding UTF8
Write-Host "Relatório: $(Join-Path $dir 'relatorio.md')" -ForegroundColor Green
Write-Host "Versão pública: docs\vehicle-evidence\capturas\$Data.md ($($cands.Count) candidato(s))" -ForegroundColor Green

if (-not $SemNuvem) {
  $od = @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($od) {
    $dst = Join-Path $od "EletricMotor-capturas\$Data"
    New-Item -ItemType Directory -Force $dst | Out-Null
    Copy-Item (Join-Path $dir '*') $dst -Recurse -Force
    Write-Host "Cópia privada na nuvem (OneDrive): $dst" -ForegroundColor Green
  } else { Write-Warning 'OneDrive não encontrado neste computador: envie a pasta hw-logs\moto\<data> por outro meio privado.' }
}
