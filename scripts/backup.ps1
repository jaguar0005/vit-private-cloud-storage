<#
.SYNOPSIS
    VIT Private Cloud Storage - Disaster Recovery & Backup Script
.DESCRIPTION
    Automates backup of PostgreSQL database records, AES-256 encrypted vault storage pool,
    and metadata configuration with cryptographic SHA-256 verification manifests.
.PARAMETER TargetDir
    Destination folder for the timestamped backup bundle. Defaults to .\backups.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
#>

[CmdletBinding()]
param (
    [string]$TargetDir = ".\backups"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  VIT PRIVATE CLOUD STORAGE - DISASTER RECOVERY & BACKUP" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupRoot = [System.IO.Path]::GetFullPath($TargetDir)
$BundleDir = Join-Path $BackupRoot "vit_cloud_backup_$Timestamp"
$DbBackupFile = Join-Path $BundleDir "database_dump.sql"
$VaultBackupDir = Join-Path $BundleDir "vault_storage"
$ManifestFile = Join-Path $BundleDir "BACKUP_MANIFEST.json"

# 1. Ensure target directory exists
if (-not (Test-Path $BundleDir)) {
    New-Item -ItemType Directory -Path $BundleDir -Force | Out-Null
    Write-Host "[+] Created backup folder: $BundleDir" -ForegroundColor Green
}

# 2. Backup PostgreSQL Database
Write-Host "[*] Exporting PostgreSQL database schema and records..." -ForegroundColor Yellow
$DbUrl = $env:DATABASE_URL
if (-not $DbUrl -and (Test-Path ".\.env")) {
    $EnvContent = Get-Content ".\.env"
    foreach ($Line in $EnvContent) {
        if ($Line -match "^DATABASE_URL=(.+)$") {
            $DbUrl = $matches[1].Trim('"').Trim("'")
            break
        }
    }
}

if (-not $DbUrl) {
    $DbUrl = "postgresql://postgres:postgres@localhost:5432/vit_cloud_storage"
}

# Look for pg_dump tool
$PgDumpExe = Get-Command "pg_dump" -ErrorAction SilentlyContinue
if (-not $PgDumpExe) {
    # Check common Postgres paths on Windows
    $CommonPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Users\$env:USERNAME\.embedded-pg\bin\pg_dump.exe"
    )
    foreach ($Path in $CommonPaths) {
        if (Test-Path $Path) {
            $PgDumpExe = $Path
            break
        }
    }
}

if ($PgDumpExe) {
    Write-Host "    Executing pg_dump via $PgDumpExe..." -ForegroundColor Gray
    & $PgDumpExe --dbname="$DbUrl" --file="$DbBackupFile" --clean --if-exists
    Write-Host "[+] Database snapshot dumped successfully ($((Get-Item $DbBackupFile).Length) bytes)" -ForegroundColor Green
} else {
    Write-Host "[!] pg_dump executable not found in PATH. Executing database JSON export fallback..." -ForegroundColor Yellow
    # Fallback Node.js export script
    node -e "
        const { PrismaClient } = require('./server/node_modules/@prisma/client');
        const prisma = new PrismaClient();
        const fs = require('fs');
        async function run() {
            const data = {
                users: await prisma.user.findMany(),
                folders: await prisma.folder.findMany(),
                files: await prisma.file.findMany(),
                versions: await prisma.fileVersion.findMany(),
                shares: await prisma.shareLink.findMany(),
                quarantine: await prisma.quarantineLog.findMany(),
                audit: await prisma.auditLog.findMany(),
            };
            fs.writeFileSync('$($DbBackupFile.Replace('\', '/'))', JSON.stringify(data, null, 2));
            await prisma.`$disconnect();
        }
        run();
    "
    Write-Host "[+] Database JSON export fallback saved." -ForegroundColor Green
}

# 3. Snapshot Encrypted Storage Vault
Write-Host "[*] Copying AES-256-GCM encrypted vault objects..." -ForegroundColor Yellow
$SourceVaultDir = ".\storage\vault"
if (Test-Path $SourceVaultDir) {
    New-Item -ItemType Directory -Path $VaultBackupDir -Force | Out-Null
    Copy-Item -Path "$SourceVaultDir\*" -Destination $VaultBackupDir -Recurse -Force
    $EncFileCount = (Get-ChildItem -Path $VaultBackupDir -Filter "*.enc").Count
    Write-Host "[+] Backed up $EncFileCount encrypted vault object(s)." -ForegroundColor Green
} else {
    Write-Host "[!] Vault storage directory $SourceVaultDir was empty or not found." -ForegroundColor DarkYellow
}

# 4. Generate Cryptographic SHA-256 Manifest
Write-Host "[*] Computing SHA-256 integrity checksums for all backup artifacts..." -ForegroundColor Yellow
$ManifestItems = @()
$AllBackupFiles = Get-ChildItem -Path $BundleDir -Recurse -File | Where-Object { $_.FullName -ne $ManifestFile }

foreach ($File in $AllBackupFiles) {
    $Hash = (Get-FileHash -Path $File.FullName -Algorithm SHA256).Hash
    $RelPath = $File.FullName.Substring($BundleDir.Length).TrimStart("\", "/")
    $ManifestItems += @{
        path = $RelPath
        sizeBytes = $File.Length
        sha256 = $Hash
    }
}

$ManifestData = @{
    backupTimestamp = $Timestamp
    system = "VIT Private Cloud Storage"
    environment = "Local Host 20 GB Pool"
    fileCount = $ManifestItems.Count
    files = $ManifestItems
} | ConvertTo-Json -Depth 5

Set-Content -Path $ManifestFile -Value $ManifestData -Encoding UTF8
Write-Host "[+] Manifest written to $ManifestFile" -ForegroundColor Green

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  DISASTER RECOVERY BACKUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "  Location: $BundleDir" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
