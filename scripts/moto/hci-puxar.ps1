# Puxa o log Bluetooth (HCI) do celular pelo cabo USB e decodifica a conversa do APP OFICIAL com a moto.
#   powershell -ExecutionPolicy Bypass -File scripts/moto/hci-puxar.ps1 [-Valores "14:32:10=87,14:33:05=1234.5"]
#   powershell -ExecutionPolicy Bypass -File scripts/moto/hci-puxar.ps1 -Arquivo C:\caminho\bugreport.zip   (sem cabo)
# Só lê o celular do dono (relatório de bug do Android) e um arquivo no PC. Nada é enviado à moto.
# Guia completo: docs/vehicle-evidence/LOG-HCI-APP-OFICIAL.md
param([string]$Arquivo = '', [string]$Valores = '', [string]$Data = (Get-Date -Format 'yyyy-MM-dd'), [double]$AjusteHoras = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dir = Join-Path $root "hw-logs\moto\$Data\hci"   # hw-logs/ está no .gitignore
New-Item -ItemType Directory -Force $dir | Out-Null

if (-not $Arquivo) {
  $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
  if (-not $adb -and (Test-Path 'D:\DevTools\android-sdk\platform-tools\adb.exe')) { $adb = 'D:\DevTools\android-sdk\platform-tools\adb.exe' }
  if (-not $adb) { throw 'adb não encontrado. Use -Arquivo com o zip do relatório de bug copiado do celular.' }
  $lista = & $adb devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  if (-not $lista) { throw 'Nenhum celular no cabo. Ligue a "Depuração USB" (Opções do desenvolvedor) e plugue o cabo de dados.' }
  if ($lista -match 'unauthorized') { throw 'Celular pediu autorização: desbloqueie a tela, aceite "Permitir depuração USB" e rode de novo.' }
  if (@($lista).Count -gt 1) { throw 'Mais de um aparelho no adb. Deixe só o celular conectado.' }
  $Arquivo = Join-Path $dir 'bugreport.zip'
  Write-Host 'Gerando o relatório de bug no celular (leva de 1 a 5 minutos; não desconecte)...' -ForegroundColor Yellow
  & $adb bugreport $Arquivo
  if (-not (Test-Path $Arquivo)) {
    # alguns aparelhos gravam com nome próprio na pasta indicada
    $z = Get-ChildItem $dir -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $z) { throw 'O adb não gerou o zip. Gere pelo celular: Opções do desenvolvedor → Relatório de bug → Interativo.' }
    $Arquivo = $z.FullName
  }
} elseif (-not (Test-Path $Arquivo)) { throw "Arquivo não encontrado: $Arquivo" } else {
  Copy-Item $Arquivo $dir -Force
}

$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { throw 'Python não encontrado.' }
$argsPy = @('-I', (Join-Path $PSScriptRoot 'hci_decode.py'), $Arquivo, '--saida', $dir, '--ajuste-horas', $AjusteHoras)
if ($Valores) { $argsPy += @('--valores', $Valores) }
& $py @argsPy
if ($LASTEXITCODE -ne 0) { throw 'A decodificação falhou (veja a mensagem acima).' }

$od = @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($od) {
  $dst = Join-Path $od "EletricMotor-capturas\$Data\hci"
  New-Item -ItemType Directory -Force $dst | Out-Null
  Copy-Item (Join-Path $dir '*') $dst -Force
  Write-Host "Cópia privada na nuvem (OneDrive): $dst" -ForegroundColor Green
} else { Write-Warning 'OneDrive não encontrado: envie a pasta hw-logs\moto\<data>\hci por outro meio privado.' }
Write-Host ''
Write-Host "Pronto. Abra $dir\hci-resumo.md. O log bruto tem tudo o que o Bluetooth do celular fez: nunca vai para o git." -ForegroundColor Green
