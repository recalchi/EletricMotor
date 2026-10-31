# Abre o EletricMotor no PC como um app (janela própria do Chrome/Edge), servido em http://localhost:4173.
# - Recompila sozinho quando algo em src/, public/, index.html ou .env.local mudou depois do último build.
# - Reaproveita o servidor se ele já estiver rodando. Para parar: scripts/pc/abrir-eletricmotor.ps1 -Parar
# localhost é contexto seguro: USB (Web Serial), Bluetooth (Web Bluetooth) e login Google funcionam.
# -SemJanela: só garante build + servidor (usado para testes automatizados e pelo canal ao vivo)
# -Usb: abre direto no assistente do gateway e conecta sozinho à porta USB já autorizada no Chrome
param([switch]$Parar, [switch]$SemJanela, [switch]$Usb)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$port = 4173
$url = "http://localhost:$port/"
$pidFile = Join-Path $root 'dist\.preview.pid'

function Test-Up {
  # o Vite pode escutar só em ::1 (localhost em IPv6) — testa os dois, com espera curta
  foreach ($h in '::1', '127.0.0.1') {
    $ip = [Net.IPAddress]::Parse($h)
    $c = New-Object Net.Sockets.TcpClient($ip.AddressFamily)
    try { if ($c.ConnectAsync($ip, $port).Wait(300) -and $c.Connected) { return $true } } catch { } finally { $c.Close() }
  }
  $false
}

if ($Parar) {
  if (Test-Path $pidFile) { Stop-Process -Id (Get-Content $pidFile) -Force -ErrorAction SilentlyContinue; Remove-Item $pidFile }
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Write-Host 'Servidor do EletricMotor parado.'
  exit 0
}

Set-Location $root
if (-not (Test-Up)) {
  $index = Join-Path $root 'dist\index.html'
  $built = if (Test-Path $index) { (Get-Item $index).LastWriteTime } else { [datetime]::MinValue }
  $changed = Get-ChildItem src, public, index.html, .env.local -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
  if ($changed) {
    Write-Host 'Compilando a versão mais recente (só quando há mudanças, ~30 s)...' -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Read-Host 'Falha ao compilar — veja acima. Enter para sair'; exit 1 }
  }
  Write-Host 'Iniciando o servidor local...' -ForegroundColor Cyan
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npx vite preview --port $port --strictPort" `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru
  $p.Id | Set-Content $pidFile
  for ($i = 0; $i -lt 60 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Up)) { Read-Host 'O servidor não respondeu na porta 4173. Enter para sair'; exit 1 }
}

if ($Usb) { $url += 'conectividade?auto=usb' }
if ($SemJanela) { Write-Host "Servidor pronto em $url"; exit 0 }
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) { Start-Process $exe "--app=$url" } else { Start-Process $url }
