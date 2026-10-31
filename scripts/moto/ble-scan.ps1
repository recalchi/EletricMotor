# Escuta PASSIVA de anúncios Bluetooth LE (Windows 10/11, sem instalar nada). Não conecta, não envia nada a nenhum
# aparelho: só registra o que é anunciado no ar. Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/moto/ble-scan.ps1 -Fase base -Segundos 60
# Fases sugeridas: base (moto desligada) · ligando (girar a chave) · ligada (painel aceso) · desligando.
# Saída: hw-logs/moto/<AAAA-MM-DD>/ble-<fase>.jsonl (bruto, fica só no computador — hw-logs está no .gitignore).
param([Parameter(Mandatory)][string]$Fase, [int]$Segundos = 60, [string]$Pasta)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Pasta) { $Pasta = Join-Path $root ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd')) }
New-Item -ItemType Directory -Force $Pasta | Out-Null
$out = Join-Path $Pasta "ble-$Fase.jsonl"

# O PowerShell 5.1 não assina eventos WinRT: um ouvinte mínimo em C# (EmBle.cs), compilado na primeira vez com o csc
# que já vem no Windows (.NET Framework 4) e as bibliotecas do próprio Windows — nada é baixado ou instalado.
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$wm = "$env:WINDIR\System32\WinMetadata"
$exe = Join-Path $env:TEMP 'em-ble-scan.exe'
$src = Join-Path $PSScriptRoot 'EmBle.cs'
if (-not (Test-Path $exe) -or (Get-Item $src).LastWriteTime -gt (Get-Item $exe).LastWriteTime) {
  & "$fw\csc.exe" /nologo /out:$exe /r:"$wm\Windows.Devices.winmd" /r:"$wm\Windows.Foundation.winmd" `
    /r:"$wm\Windows.Storage.winmd" /r:"$fw\System.Runtime.WindowsRuntime.dll" /r:"$fw\System.Runtime.dll" /r:"$fw\System.Runtime.InteropServices.WindowsRuntime.dll" $src
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o ouvinte Bluetooth (veja acima).' }
}
Write-Host "Escutando Bluetooth LE ($Fase) por $Segundos s... (só recepção)" -ForegroundColor Cyan
& $exe $Segundos $out $Fase
$n = if (Test-Path $out) { (Get-Content $out | Measure-Object -Line).Lines } else { 0 }
Write-Host "Pronto: $n anúncios em $out" -ForegroundColor Green
