# Gera o APK de depuração do EletricMotor (Android).
# Ferramentas em D:\DevTools (fora do C:). Uso:  powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = 'D:\DevTools\jdk21'
$env:ANDROID_HOME = 'D:\DevTools\android-sdk'
$env:GRADLE_USER_HOME = 'D:\DevTools\gradle-home'

Set-Location $root
# O login Google nativo inicializa o Firebase Android a partir deste arquivo; sem ele o app fecharia ao abrir.
$gs = Join-Path $root 'android\app\google-services.json'
if (-not (Test-Path $gs)) {
  throw "Falta $gs (Firebase Console > Configurações do projeto > app Android). Veja docs/android.md."
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Falha no build web' }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Falha no cap sync' }

Set-Location (Join-Path $root 'android')
.\gradlew.bat assembleDebug
$gradleExit = $LASTEXITCODE
# Encerra o daemon do Gradle: ele segura vários GB de RAM e derruba o próximo build web por falta de memória
.\gradlew.bat --stop | Out-Null
if ($gradleExit -ne 0) { throw 'Falha no Gradle' }

$out = Join-Path $root 'apk'
New-Item -ItemType Directory -Force $out | Out-Null
$dest = Join-Path $out 'EletricMotor-debug.apk'
Copy-Item (Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk') $dest -Force
Write-Host "APK gerado: $dest"
