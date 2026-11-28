# Construit l'AAB de production signé. Les mots de passe sont saisis ICI, au clavier : ils ne sont ni écrits dans un
# fichier, ni passés sur la ligne de commande, et sont effacés à la fin.
# Avant : le dossier app\android doit venir d'un prebuild avec APP_VARIANT=production.
$ErrorActionPreference = 'Stop'
$app = Join-Path (Split-Path $PSScriptRoot -Parent) 'app'
$cle = Join-Path $app '@maxpyroli__grand-paname.jks'
if (-not (Test-Path -LiteralPath $cle)) { throw "Fichier de clé introuvable : $cle" }
$gradle = Join-Path $app 'android\app\build.gradle'
if (-not (Test-Path -LiteralPath $gradle)) { throw "Dossier app\android absent : faire d'abord le prebuild de production." }
if (-not (Select-String -LiteralPath $gradle -Pattern "applicationId 'fun.grandpaname.app'" -SimpleMatch -Quiet)) { throw "Le dossier app\android n'est pas celui de production." }

function ConvertTo-Clair([System.Security.SecureString]$s) {
  [System.Net.NetworkCredential]::new('', $s).Password
}

$alias = Read-Host 'Alias de la clé'
$motCle = ConvertTo-Clair (Read-Host 'Mot de passe du keystore' -AsSecureString)
$motAlias = ConvertTo-Clair (Read-Host 'Mot de passe de la clé (Entrée si identique)' -AsSecureString)
if (-not $motAlias) { $motAlias = $motCle }

$variables = @{
  'ORG_GRADLE_PROJECT_android.injected.signing.store.file'     = $cle
  'ORG_GRADLE_PROJECT_android.injected.signing.store.password' = $motCle
  'ORG_GRADLE_PROJECT_android.injected.signing.key.alias'      = $alias
  'ORG_GRADLE_PROJECT_android.injected.signing.key.password'   = $motAlias
  'APP_VARIANT'                                                = 'production'
  'JAVA_HOME'                                                  = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
}
$avant = @{}
foreach ($nom in $variables.Keys) { $avant[$nom] = [Environment]::GetEnvironmentVariable($nom, 'Process') }

try {
  foreach ($nom in $variables.Keys) { [Environment]::SetEnvironmentVariable($nom, $variables[$nom], 'Process') }
  Push-Location (Join-Path $app 'android')
  try {
    # --no-daemon : aucun processus Gradle ne reste en mémoire avec les mots de passe.
    .\gradlew.bat bundleRelease --console=plain --no-daemon
    $code = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  foreach ($nom in $variables.Keys) { [Environment]::SetEnvironmentVariable($nom, $avant[$nom], 'Process') }
  $motCle = $null; $motAlias = $null; $variables = $null
}

if ($code -ne 0) { Write-Host "ECHEC du build (code $code)." -ForegroundColor Red; exit $code }
Write-Host "AAB construit : $app\android\app\build\outputs\bundle\release\app-release.aab" -ForegroundColor Green
