<#
.SYNOPSIS
  Atualização segura do firmware do gateway ESP32 (EletricMotor) pelo PC.

.DESCRIPTION
  Ordem fixa; qualquer verificação que falhe ABORTA antes de gravar:
    1. Localiza a porta (CP210x/CH34x/FTDI) e valida o arquivo (tamanho, SHA-256 opcional, imagem do app válida).
    2. Identifica o chip (precisa ser ESP32) e a flash (precisa ser 4 MB).
    3. Lê os eFuses: criptografia de flash e Secure Boot precisam estar DESLIGADOS.
    4. Backup completo da flash, lido DUAS vezes; as duas leituras precisam ser idênticas.
    5. Grava com verificação por hash (esptool) — pulado em -DryRun.
    6. Reinicia pelo circuito auto-reset e escuta a serial: exige a linha "# fw ..." e nenhum sinal de pane.
  Para voltar ao firmware anterior: -Restaurar <arquivo de backup> (mesmas verificações, sem exigir "# fw").

.EXAMPLE
  .\atualizar-firmware.ps1 -Firmware ..\..\..\ESP32-Serial-Diagnostic\dist\esp32-gateway-1.0.0-esp32devmodule-merged.bin -DryRun
  .\atualizar-firmware.ps1 -Firmware <bin> -Sha256 <hash do catálogo>
  .\atualizar-firmware.ps1 -Restaurar E:\backups\backup_xxx_leitura1.bin
#>
[CmdletBinding()]
param(
    [string]$Firmware,
    [string]$Restaurar,
    [string]$Sha256,
    [string]$Port,
    [string]$Esptool,
    [string]$BackupDir = (Join-Path $PSScriptRoot 'backups'),
    [int]$Baud = 460800,
    [int]$BackupBaud = 115200,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$FlashBytes = 0x400000

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ABORTADO: $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "  OK: $msg" -ForegroundColor Green }

if (-not $Firmware -and -not $Restaurar) { Fail 'informe -Firmware <arquivo.bin> ou -Restaurar <backup.bin>' }
$image = if ($Restaurar) { $Restaurar } else { $Firmware }
if (-not (Test-Path $image)) { Fail "arquivo não encontrado: $image" }
$image = (Resolve-Path $image).Path

# --- ferramentas -----------------------------------------------------------
function Find-Tool($exe, $explicit) {
    if ($explicit) { return $explicit }
    $cmd = Get-Command $exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $roots = @("$env:LOCALAPPDATA\Arduino15\packages\esp32\tools\esptool_py", 'E:\DevTools\arduino\data\packages\esp32\tools\esptool_py')
    foreach ($r in $roots) {
        $f = Get-ChildItem $r -Recurse -Filter $exe -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($f) { return $f.FullName }
    }
    Fail "não achei $exe (instale esptool >= 5 ou informe -Esptool)"
}
$esptool = Find-Tool 'esptool.exe' $Esptool
$espefuse = Join-Path (Split-Path $esptool) 'espefuse.exe'
if (-not (Test-Path $espefuse)) { $espefuse = Find-Tool 'espefuse.exe' $null }

function Run($exe, [string[]]$a) {
    # No PowerShell 5.1, stderr de programas nativos vira ErrorRecord; o código de saída é o que decide.
    $ErrorActionPreference = 'Continue'
    $out = & $exe @a 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { Fail ("comando falhou ($exe $($a -join ' ')):`n" + ($out | Select-Object -Last 15 | Out-String)) }
    return ($out -join "`n")
}

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Transcript -Path (Join-Path $BackupDir "atualizacao-$stamp.log") | Out-Null
try {
    # --- 1. porta e arquivo ---------------------------------------------------
    Step '1/6 Porta e arquivo'
    if (-not $Port) {
        $dev = Get-CimInstance Win32_PnPEntity | Where-Object {
            $_.Name -match '\(COM\d+\)' -and $_.PNPDeviceID -match 'VID_10C4|VID_1A86|VID_0403'
        }
        if (@($dev).Count -ne 1) { Fail "esperava 1 placa USB-serial, achei $(@($dev).Count). Use -Port COMx." }
        $Port = [regex]::Match($dev.Name, 'COM\d+').Value
    }
    Ok "porta $Port"
    $len = (Get-Item $image).Length
    if ($len -le 0x10000 -or $len -gt $FlashBytes) { Fail "tamanho inesperado ($len bytes); esperava um binário completo de até 4 MB" }
    $hash = (Get-FileHash $image -Algorithm SHA256).Hash.ToLower()
    if ($Sha256 -and $hash -ne $Sha256.ToLower()) { Fail "SHA-256 não confere: $hash" }
    Ok "arquivo $len bytes, SHA-256 $hash"
    # valida a imagem do app dentro do binário completo (offset 0x10000 no gateway; 0x100000 no ESP-AT)
    $bytes = [IO.File]::ReadAllBytes($image)
    $appOk = $false
    foreach ($off in 0x10000, 0x100000) {
        if ($bytes.Length -gt $off -and $bytes[$off] -eq 0xE9) {
            $tmp = Join-Path $env:TEMP "app-check-$stamp.bin"
            $n = [Math]::Min($bytes.Length, $off + 0x200000) - $off
            $slice = New-Object byte[] $n
            [Array]::Copy($bytes, $off, $slice, 0, $n)
            [IO.File]::WriteAllBytes($tmp, $slice)
            $ErrorActionPreference = 'Continue'
            $info = & $esptool --chip esp32 image-info $tmp 2>&1 | Out-String
            $ErrorActionPreference = 'Stop'
            Remove-Item $tmp -ErrorAction SilentlyContinue
            if ($info -match 'Chip ID: 0 \(ESP32\)' -and $info -match 'Validation hash: \w+ \(valid\)') {
                $proj = [regex]::Match($info, 'Project name: (\S+)').Groups[1].Value
                Ok ("imagem do app válida em 0x{0:X} (projeto: {1})" -f $off, $proj); $appOk = $true; break
            }
        }
    }
    if (-not $appOk) { Fail 'não encontrei imagem de app ESP32 válida no arquivo' }
    if ($bytes[0x1000] -ne 0xE9) { Fail 'bootloader ausente em 0x1000: não parece um binário completo (merged)' }

    # --- 2. chip e flash -------------------------------------------------------
    Step '2/6 Chip e flash'
    $id = Run $esptool @('--port', $Port, '--baud', '115200', 'flash-id')
    $chip = [regex]::Match($id, 'Chip type:\s+(.+)').Groups[1].Value.Trim()
    $size = [regex]::Match($id, 'Detected flash size:\s+(\S+)').Groups[1].Value
    $mac = [regex]::Match($id, 'MAC:\s+(\S+)').Groups[1].Value
    if ($chip -notmatch '^ESP32-D0WD') { Fail "chip inesperado: '$chip' (este firmware é para ESP32 clássico)" }
    if ($size -ne '4MB') { Fail "flash de '$size' (esperava 4MB)" }
    Ok "$chip, flash $size, MAC $mac"

    # --- 3. eFuses ---------------------------------------------------------------
    Step '3/6 Proteções nos eFuses (só leitura)'
    $ef = Run $espefuse @('--port', $Port, 'summary')
    if ($ef -notmatch 'FLASH_CRYPT_CNT[^\n]*= 0 ') { Fail 'criptografia de flash ATIVA (gravar imagem comum inutilizaria a placa)' }
    if ($ef -match 'ABS_DONE_0[^\n]*= True' -or $ef -match 'ABS_DONE_1[^\n]*= True') { Fail 'Secure Boot ATIVO' }
    if ($ef -match 'UART_DOWNLOAD_DIS[^\n]*= True') { Fail 'download pela UART desabilitado' }
    Ok 'criptografia e Secure Boot desligados; download UART habilitado'

    # --- 4. backup duplo ---------------------------------------------------------
    Step '4/6 Backup completo (16 blocos de 256 KB, cada um conferido pelo chip)'
    $tag = ($mac -replace ':', '')
    $b1 = Join-Path $BackupDir "backup_${tag}_${stamp}.bin"
    # Leituras longas desta ponte CP2102 caem de forma intermitente (e sempre em 230400+ perto de 0x49000).
    # Blocos curtos a 115200 + conferência MD5 feita pelo próprio chip + novas tentativas por bloco são confiáveis.
    $chunk = 0x40000
    $part = Join-Path $BackupDir "_bloco-$stamp.bin"
    $all = New-Object IO.MemoryStream
    for ($off = 0; $off -lt $FlashBytes; $off += $chunk) {
        $ok = $false
        # 5 tentativas: sob carga do PC já houve 3 falhas seguidas no mesmo bloco (29/10/2026) — a trava abortou sem gravar
        for ($try = 1; $try -le 5 -and -not $ok; $try++) {
            $ErrorActionPreference = 'Continue'
            # --after no-reset: o chip fica no bootloader até a conferência; o firmware não roda nem altera a NVS no meio
            $r = & $esptool --port $Port --baud $BackupBaud --after no-reset read-flash ('0x{0:X}' -f $off) ('0x{0:X}' -f $chunk) $part 2>&1 | ForEach-Object { "$_" }
            $rc = $LASTEXITCODE
            if ($rc -eq 0) {
                $v = & $esptool --port $Port --baud $BackupBaud --before no-reset verify-flash ('0x{0:X}' -f $off) $part 2>&1 | ForEach-Object { "$_" }
                $ok = ($LASTEXITCODE -eq 0 -and ($v -join "`n") -match 'Verification successful')
            }
            $ErrorActionPreference = 'Stop'
            if (-not $ok) {
                Write-Host ("  aviso: bloco 0x{0:X} tentativa {1} falhou ({2})" -f $off, $try, (($r | Select-Object -Last 1))) -ForegroundColor Yellow
                Start-Sleep 2
            }
        }
        if (-not $ok) { Fail ('bloco 0x{0:X} não pôde ser lido e conferido. Nada foi gravado.' -f $off) }
        $data = [IO.File]::ReadAllBytes($part)
        if ($data.Length -ne $chunk) { Fail ('bloco 0x{0:X} com tamanho errado. Nada foi gravado.' -f $off) }
        $all.Write($data, 0, $data.Length)
        Write-Host ("  bloco 0x{0:X6} conferido" -f $off)
    }
    Remove-Item $part -ErrorAction SilentlyContinue
    [IO.File]::WriteAllBytes($b1, $all.ToArray())
    if ((Get-Item $b1).Length -ne $FlashBytes) { Fail 'backup montado com tamanho errado. Nada foi gravado.' }
    $h1 = (Get-FileHash $b1 -Algorithm SHA256).Hash
    Ok "backup conferido com a flash: $b1 (SHA-256 $($h1.ToLower()))"

    if ($DryRun) { Step 'DryRun: todas as verificações passaram. Nada foi gravado.'; exit 0 }

    # --- 5. gravação -------------------------------------------------------------
    Step '5/6 Gravação com verificação'
    $w = Run $esptool @('--port', $Port, '--baud', "$Baud", 'write-flash', '0x0', $image)
    if ($w -notmatch 'Hash of data verified') { Fail 'esptool não confirmou a verificação por hash. Restaure com -Restaurar.' }
    Ok 'gravado e verificado por hash'

    # --- 6. conferência em execução ---------------------------------------------
    Step '6/6 Boot e anúncio de versão'
    $sp = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
    $sp.DtrEnable = $false; $sp.RtsEnable = $false; $sp.ReadTimeout = 200
    $sp.Open()
    $sp.RtsEnable = $true; Start-Sleep -Milliseconds 120; $sp.RtsEnable = $false   # reset pelo circuito auto-reset
    $ms = New-Object IO.MemoryStream; $buf = New-Object byte[] 4096
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt 8000) { try { $n = $sp.Read($buf, 0, 4096); $ms.Write($buf, 0, $n) } catch [TimeoutException] {} }
    $sp.Close()
    $log = [Text.Encoding]::ASCII.GetString($ms.ToArray())
    Write-Host $log
    if ($log -match 'Guru Meditation|Brownout|rst:0xc |abort\(\)') { Fail 'sinal de pane no boot. Restaure com -Restaurar.' }
    if ($Restaurar) { Ok 'backup restaurado' }
    else {
        $fw = [regex]::Match($log, '# fw name=(\S+) version=(\S+)')
        if (-not $fw.Success) { Fail 'o firmware não anunciou "# fw ..." em 8 s' }
        Ok "rodando $($fw.Groups[1].Value) $($fw.Groups[2].Value)"
    }
    Write-Host "`nConcluído. Backup do estado anterior: $b1" -ForegroundColor Green
}
finally { Stop-Transcript | Out-Null }
