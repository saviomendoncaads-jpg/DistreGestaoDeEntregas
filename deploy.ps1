# Execute no servidor após revisão do PR e backup SQL verificado.
# Compila e testa em estágio antes de publicar arquivos e reiniciar.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Invoke-CheckedNative {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Command (código $LASTEXITCODE). Publicação interrompida." }
}
$dirtyFiles = & git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar o repositório.' }
if ($dirtyFiles) { throw 'Há alterações locais. Preserve e versione o trabalho antes de publicar.' }
Invoke-CheckedNative 'git' @('pull', '--ff-only')
Invoke-CheckedNative 'npm' @('--prefix', 'backend', 'ci', '--no-fund')
Invoke-CheckedNative 'npm' @('--prefix', 'frontend', 'ci', '--no-fund')
Invoke-CheckedNative 'npm' @('--prefix', 'backend', 'test')
$releaseId = Get-Date -Format 'yyyyMMdd-HHmmss'
$stageRoot = Join-Path $PSScriptRoot ".release-staging\$releaseId"
$backupRoot = Join-Path $PSScriptRoot ".release-backups\$releaseId"
$backendStage = Join-Path $stageRoot 'backend'
$frontendStage = Join-Path $stageRoot 'frontend'
$backendDist = Join-Path $PSScriptRoot 'backend\dist'
$frontendDist = Join-Path $PSScriptRoot 'frontend\dist'
New-Item -ItemType Directory -Path $stageRoot, $backupRoot -Force | Out-Null
Push-Location backend
try { Invoke-CheckedNative 'npx' @('tsc', '--outDir', $backendStage) }
finally { Pop-Location }
Push-Location frontend
try {
    Invoke-CheckedNative 'npx' @('tsc', '-b')
    Invoke-CheckedNative 'npx' @('vite', 'build', '--outDir', $frontendStage)
} finally { Pop-Location }
if (Test-Path -LiteralPath $backendDist) { Copy-Item -LiteralPath $backendDist -Destination (Join-Path $backupRoot 'backend') -Recurse }
if (Test-Path -LiteralPath $frontendDist) { Copy-Item -LiteralPath $frontendDist -Destination (Join-Path $backupRoot 'frontend') -Recurse }
(& git rev-parse HEAD) | Set-Content -LiteralPath (Join-Path $backupRoot 'new-revision.txt')
New-Item -ItemType Directory -Path $backendDist, $frontendDist -Force | Out-Null
Copy-Item -Path (Join-Path $backendStage '*') -Destination $backendDist -Recurse -Force
# Publica assets com hash antes do HTML, preservando os chunks antigos.
Copy-Item -LiteralPath (Join-Path $frontendStage 'assets') -Destination $frontendDist -Recurse -Force
Get-ChildItem -LiteralPath $frontendStage -File | Copy-Item -Destination $frontendDist -Force
Invoke-CheckedNative 'pm2' @('restart', 'distre')
$healthPort = if ($env:PORT) { $env:PORT } else { '5000' }
$ready = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$healthPort/health" -TimeoutSec 2
        if ($health.status -eq 'saudavel') { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (!$ready) { throw "A publicação não ficou saudável. Restaure os artefatos em $backupRoot conforme o procedimento de release." }
Write-Host "Publicação verificada. Backup dos artefatos: $backupRoot" -ForegroundColor Green
