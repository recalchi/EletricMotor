# Captura guiada na moto (um clique): conduz as fases, cronometra e gera o relatório no fim.
#   scripts\moto\Captura-Moto.cmd   (ou: powershell -ExecutionPolicy Bypass -File scripts/moto/captura-guiada.ps1)
# Só recepção — nada é conectado nem enviado à moto. Veja docs/vehicle-evidence/CAPTURA-MOTO.md.
param([int]$Base = 60, [int]$Ligando = 45, [int]$Ligada = 120, [int]$Pareamento = 90, [int]$Desligando = 30)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$here = $PSScriptRoot
function Passo([string]$t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Yellow }
function Esperar([string]$t) { Read-Host "    $t  [Enter para continuar]" | Out-Null }

Passo 'Preparação'
Write-Host '    Notebook a 1–2 m da moto, Bluetooth do notebook LIGADO, moto DESLIGADA.'
Write-Host '    DESLIGUE o Bluetooth do celular por enquanto (se ele já for pareado com o painel, o painel conecta nele e para de anunciar).'
Write-Host '    NÃO ligue o notebook na entrada USB da moto (duas fontes de 5 V podem queimar as portas).'
Esperar 'Tudo pronto?'
& "$here\usb-snapshot.ps1" -Fase antes

Passo "1/5 Moto DESLIGADA — linha de base ($Base s + busca clássica). Não mexa na chave."
& "$here\ble-scan.ps1" -Fase base -Segundos $Base -Classico

Passo "2/5 LIGUE a moto agora (gire a chave / botão) — gravando $Ligando s"
Esperar 'Pressione Enter e ligue a moto em seguida'
& "$here\ble-scan.ps1" -Fase ligando -Segundos $Ligando

Passo "3/5 Moto LIGADA, painel aceso — $Ligada s + busca clássica. Pode navegar pelas telas do painel; não ande com a moto."
& "$here\ble-scan.ps1" -Fase ligada -Segundos $Ligada -Classico

Passo "4/5 MODO DE PAREAMENTO do painel — $Pareamento s + busca clássica"
Write-Host '    No painel, procure o menu Bluetooth/Conectar celular (ou o pareamento do app oficial Minha Voltz/Hello Voltz) e deixe-o'
Write-Host '    procurando/visível. Se não houver menu, pule com Enter e siga.'
Esperar 'Painel em modo de pareamento (ou sem menu)?'
& "$here\ble-scan.ps1" -Fase pareamento -Segundos $Pareamento -Classico

Passo 'Teste de SOM (opcional, recomendado)'
Write-Host '    Se apareceu um aparelho de áudio da moto: Configurações do Windows → Bluetooth → Adicionar dispositivo → escolha o'
Write-Host '    nome da moto e pareie COMO UMA CAIXA DE SOM. Depois rode o teste: uma frase e 3 bipes devem sair pela moto.'
$t = Read-Host '    Fazer o teste de som agora? (s/n)'
if ($t -match '^s') { & "$here\audio-teste.ps1" -Fase moto }

Passo "5/5 DESLIGUE a moto — gravando $Desligando s"
Esperar 'Pressione Enter e desligue a moto em seguida'
& "$here\ble-scan.ps1" -Fase desligando -Segundos $Desligando
& "$here\usb-snapshot.ps1" -Fase depois

Passo 'Notas (abrem no Bloco de Notas): preencha o que viu no painel, a porta USB da moto e os testes do celular.'
$dir = Join-Path (Resolve-Path "$here\..\..") ("hw-logs\moto\" + (Get-Date -Format 'yyyy-MM-dd'))
$notas = Join-Path $dir 'notas.md'
if (-not (Test-Path $notas)) { Copy-Item "$here\notas-modelo.md" $notas }
Start-Process notepad.exe $notas -Wait

Passo 'Relatório'
& "$here\relatorio.ps1"
Write-Host ''
Write-Host 'Concluído. Envie ao Claude: a pasta do OneDrive EletricMotor-capturas\<data> (privada) e faça commit só de' -ForegroundColor Green
Write-Host 'docs\vehicle-evidence\capturas\<data>.md (versão pública, sem dados de terceiros).' -ForegroundColor Green
Read-Host 'Enter para fechar' | Out-Null
