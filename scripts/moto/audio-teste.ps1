# Teste de áudio: toca uma frase e bipes na SAÍDA DE SOM PADRÃO do notebook. Se o notebook estiver pareado com a
# caixa de som/painel da moto (Configurações → Bluetooth → Adicionar dispositivo, como uma caixa de som comum) e ela
# for a saída escolhida, o som sai pela moto. Registra os dispositivos de áudio Bluetooth vistos.
#   powershell -ExecutionPolicy Bypass -File scripts/moto/audio-teste.ps1 -Fase moto
param([string]$Fase = 'moto', [string]$Pasta)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Pasta) { $Pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd')) }
New-Item -ItemType Directory -Force $Pasta | Out-Null

$bt = @(Get-PnpDevice -PresentOnly -Class AudioEndpoint, Media -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match 'BTH' -or $_.FriendlyName -match 'Bluetooth|Hands-Free|Stereo|A2DP' } |
    ForEach-Object { "$($_.FriendlyName) [$($_.Status)]" })
Write-Host 'Dispositivos de áudio Bluetooth vistos:' -ForegroundColor Cyan
if ($bt) { $bt | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  nenhum (pareie a moto em Configurações → Bluetooth primeiro)' }

Add-Type -AssemblyName System.Speech
$tts = New-Object System.Speech.Synthesis.SpeechSynthesizer
$saida = 'padrão do Windows'
$ok = $false
try {
  Write-Host 'Tocando: frase de teste + 3 bipes...' -ForegroundColor Cyan
  $tts.Volume = 100
  $tts.Speak('Teste de som do aplicativo Eletric Motor. Um, dois, três.')
  # bipes gerados em WAV (o [console]::beep sai pelo alto-falante interno, não pelo Bluetooth)
  $rate = 22050; $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
  $samples = New-Object Collections.Generic.List[int16]
  foreach ($freq in 440, 660, 880) { for ($i = 0; $i -lt $rate * 0.35; $i++) { $samples.Add([int16](12000 * [Math]::Sin(2 * [Math]::PI * $freq * $i / $rate))) }
    for ($i = 0; $i -lt $rate * 0.15; $i++) { $samples.Add(0) } }
  $data = $samples.Count * 2
  $bw.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $bw.Write([int](36 + $data)); $bw.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
  $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1); $bw.Write([int]$rate); $bw.Write([int]($rate * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([Text.Encoding]::ASCII.GetBytes('data')); $bw.Write([int]$data); foreach ($v in $samples) { $bw.Write($v) }
  $ms.Position = 0; (New-Object Media.SoundPlayer $ms).PlaySync()
  $ok = $true
} catch { Write-Warning "Falha ao tocar: $($_.Exception.Message)" }
$resp = Read-Host 'O som saiu pela caixa da MOTO? (s/n/parcial)'
[ordered]@{ fase = $Fase; saida = $saida; reproduziu = $(if ($ok) { "sim; ouvido na moto: $resp" } else { 'falhou' }); bt = $bt } |
  ConvertTo-Json | Set-Content (Join-Path $Pasta "audio-$Fase.json") -Encoding UTF8
Write-Host "Registrado em audio-$Fase.json" -ForegroundColor Green
