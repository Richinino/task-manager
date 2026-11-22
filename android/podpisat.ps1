# Podpíše .apk Task manažéra tvojím kľúčom a vypíše odtlačok pre Vercel.
#
# Spustenie (z priečinka android):  .\podpisat.ps1
#
# Pri prvom spustení vytvorí podpisový kľúč. Heslo zadávaš LEN TY, priamo
# do terminálu — skript ho nikam neukladá ani nevypisuje.
#
# KĽÚČ SI ODLOŽ (napr. do správcu hesiel alebo na USB). Bez neho sa appka
# už nikdy nedá aktualizovať — každá nová verzia musí byť podpísaná tým istým.

$ErrorActionPreference = "Stop"

$jbr        = "C:\Program Files\Android\Android Studio\jbr\bin"
# apksigner.bat hľadá Javu cez JAVA_HOME — Java z Android Studia v PATH nie je.
$env:JAVA_HOME = Split-Path $jbr -Parent
$buildTools = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Directory |
              Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } |
              Select-Object -Last 1 -ExpandProperty FullName
$keyDir     = Join-Path $env:USERPROFILE ".android-kluce"
$keystore   = Join-Path $keyDir "ulohy.keystore"
$alias      = "ulohy"

$unsigned = Join-Path $PSScriptRoot "app\build\outputs\apk\release\app-release-unsigned.apk"
$aligned  = Join-Path $PSScriptRoot "app\build\outputs\apk\release\app-release-aligned.apk"
$signed   = Join-Path $PSScriptRoot "Ulohy.apk"

if (-not (Test-Path $unsigned)) {
  throw "Nenašiel som $unsigned. Najprv treba postaviť appku (gradlew assembleRelease)."
}

# 1. Kľúč — len pri prvom spustení.
if (-not (Test-Path $keystore)) {
  New-Item -ItemType Directory -Force $keyDir | Out-Null
  Write-Host ""
  Write-Host "Vytváram podpisový kľúč v $keystore" -ForegroundColor Cyan
  Write-Host "Vymysli si heslo (aspoň 6 znakov) a zadaj ho dvakrát. Zapíš si ho." -ForegroundColor Cyan
  & "$jbr\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore $keystore `
    -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
    -dname "CN=Task manazer, O=Osobne, C=SK"
  if ($LASTEXITCODE -ne 0) { throw "Kľúč sa nevytvoril." }
}

# 2. Zarovnanie a podpis.
& "$buildTools\zipalign.exe" -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign zlyhal." }

Write-Host ""
Write-Host "Podpisujem. Zadaj heslo ku kľúču:" -ForegroundColor Cyan
& "$buildTools\apksigner.bat" sign --ks $keystore --ks-key-alias $alias --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw "Podpis zlyhal (zlé heslo?)." }

# 3. Odtlačok pre Vercel (ANDROID_CERT_FINGERPRINTS).
$certs = & "$buildTools\apksigner.bat" verify --print-certs $signed
$hex = ($certs | Select-String "SHA-256 digest: ([0-9a-f]+)").Matches[0].Groups[1].Value.ToUpper()
$fingerprint = ($hex -split '(..)' | Where-Object { $_ }) -join ':'

Write-Host ""
Write-Host "Hotovo: $signed" -ForegroundColor Green
Write-Host ""
Write-Host "Do Vercelu (Settings → Environment Variables, prostredie Production):"
Write-Host "  ANDROID_PACKAGE_NAME      = sk.taskmanazer.app"
Write-Host "  ANDROID_CERT_FINGERPRINTS = $fingerprint"
