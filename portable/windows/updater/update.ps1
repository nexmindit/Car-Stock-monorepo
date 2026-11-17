# VBeyond portable Windows updater
# Usage:
#   .\update.ps1 -Action Check
#   .\update.ps1 -Action Update [-Version 1.0.56] [-Force] [-DryRun]
#   .\update.ps1 -Action Update -LocalPackage D:\vbeyond-windows-v1.0.61.zip   (offline)
#   .\update.ps1 -Action Status
#   .\update.ps1 -Action Rollback -Version 1.0.55 [-RestoreBackup path]
#   .\update.ps1 -Action Backup

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Check', 'Update', 'Status', 'Rollback', 'Backup')]
    [string]$Action,

    [string]$Version = '',
    [switch]$Force,
    [switch]$SkipBackup,
    [switch]$DryRun,
    [string]$RestoreBackup = '',

    # Install from a zip already on this machine instead of fetching the feed and downloading
    # ~195MB. For sites with slow or no internet. Every safety step after Download still runs.
    [string]$LocalPackage = '',

    # Label written into the backup filename (-Action Backup). 'scheduled' marks a dump the
    # daily scheduler took, which is the only kind retention is allowed to delete.
    [ValidateSet('manual', 'scheduled')]
    [string]$BackupSuffix = 'manual'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
Initialize-VbPaths

function Invoke-Check {
    $current = Get-LocalVersion
    $result = [ordered]@{
        hasUpdate       = $false
        currentVersion  = $current
        latestVersion   = $current
        notes           = $null
        assetUrl        = $null
        sha256          = $null
        checkedAt       = (Get-Date).ToString('o')
    }

    try {
        $feed = Get-UpdateFeed
        $releases = @(Get-JsonProp $feed 'releases' @())
        $latest = Get-JsonProp $feed 'latest'
        if (-not $latest -and $releases.Count -gt 0) { $latest = $releases[0].version }
        if (-not $latest) { $latest = $current }
        $rel = $null
        if ($releases.Count -gt 0) {
            $rel = $releases | Where-Object { (Get-JsonProp $_ 'version') -eq $latest } | Select-Object -First 1
            if (-not $rel) { $rel = $releases | Select-Object -First 1 }
        }
        $result.latestVersion = $latest
        $result.hasUpdate = (Compare-SemVer $latest $current) -gt 0
        if ($rel) {
            $result.notes = Get-JsonProp $rel 'notes'
            $result.assetUrl = Get-JsonProp $rel 'assetUrl'
            $result.sha256 = Get-JsonProp $rel 'sha256'
        }
    } catch {
        Write-UpdaterLog "Check failed: $($_.Exception.Message)" 'ERROR' | Out-Null
        $json = ($result | ConvertTo-Json -Compress)
        Write-Output $json
        exit 1
    }

    $json = ($result | ConvertTo-Json -Compress)
    $tmp = "$($script:LastCheckFile).tmp"
    $json | Set-Content -LiteralPath $tmp -Encoding UTF8
    Move-Item -LiteralPath $tmp -Destination $script:LastCheckFile -Force
    Write-Output $json
    exit 0
}

function Invoke-BackupOnly {
    try {
        Acquire-UpdateLock
    } catch {
        Write-Error $_.Exception.Message
        exit 10
    }
    try {
        # The suffix lands in the filename and is what retention keys off: only 'scheduled'
        # dumps are auto-pruned. A 'manual' one was taken deliberately and a 'pre-update' one
        # is a rollback safety net - neither is the scheduler's to delete.
        $suffix = if ($BackupSuffix) { $BackupSuffix } else { 'manual' }
        $path = Invoke-PgDumpBackup -Suffix $suffix
        $item = Get-Item -LiteralPath $path
        $out = [ordered]@{
            message  = 'Backup completed'
            dump     = $path
            dumpSize = ('{0:N1} MB' -f ($item.Length / 1MB))
            sql      = ''
            sqlSize  = ''
        }
        Write-Output ($out | ConvertTo-Json -Compress)
        exit 0
    } catch {
        Write-Error $_.Exception.Message
        exit 13
    } finally {
        Release-UpdateLock
    }
}

function Invoke-Status {
    if (Test-Path -LiteralPath $script:StatusFile) {
        Get-Content -LiteralPath $script:StatusFile -Raw
    } else {
        Write-Output (@{
            step = 0; totalSteps = 10; stepName = 'Idle'; status = 'idle'
            message = 'No update in progress'; startedAt = ''; updatedAt = (Get-Date).ToString('o'); logs = @()
        } | ConvertTo-Json -Compress)
    }
    exit 0
}

function Restore-AppFromRelease {
    param([string]$VersionDir)
    if (Test-Path -LiteralPath $script:AppDir) {
        $failed = Join-Path $script:ReleasesDir ("{0}-failed-{1:yyyyMMdd_HHmmss}" -f (Get-LocalVersion), (Get-Date))
        Move-Item -LiteralPath $script:AppDir -Destination $failed -Force
    }
    Copy-Item -LiteralPath $VersionDir -Destination $script:AppDir -Recurse -Force
}

function Invoke-Rollback {
    if (-not $Version) {
        throw 'Rollback requires -Version (folder under releases\)'
    }

    try {
        $src = Resolve-ReleaseDir -Version $Version
    } catch {
        Write-Error $_.Exception.Message
        exit 1
    }

    try {
        Acquire-UpdateLock
    } catch {
        # Same reason as Invoke-Update: the UI is already polling a seeded 'running' status.
        Write-UpdateStatus -Step 1 -StepName 'Lock' -Status 'error' `
            -Message 'Another update is already running' `
            -TargetVersion $Version -ErrorText $_.Exception.Message `
            -ExtraLog @((Write-UpdaterLog "Rollback lock busy: $($_.Exception.Message)" 'ERROR'))
        Write-Error $_.Exception.Message
        exit 10
    }

    try {
        Write-UpdateStatus -Step 1 -StepName 'Rollback' -Status 'rolling_back' -Message "Rolling back to $Version" -TargetVersion $Version -ExtraLog @((Write-UpdaterLog "Rollback to $Version"))
        $null = Invoke-PgDumpBackup -Suffix 'pre-rollback'
        Stop-VbApp
        Start-Sleep -Seconds 2
        Restore-AppFromRelease -VersionDir $src

        if ($RestoreBackup) {
            if (-not (Test-Path -LiteralPath $RestoreBackup)) {
                throw "Restore backup not found: $RestoreBackup"
            }
            Invoke-PgRestoreBackup -DumpPath $RestoreBackup
        }

        Start-VbApp
        if (-not (Wait-VbHealth)) {
            throw 'Health check failed after rollback'
        }
        Write-UpdateStatus -Step 10 -StepName 'Finalize' -Status 'success' -Message "Rollback to $Version complete" -ExtraLog @((Write-UpdaterLog 'Rollback success'))
        exit 0
    } catch {
        Write-UpdateStatus -Step 0 -StepName 'Rollback' -Status 'failed' -Message $_.Exception.Message -ErrorText $_.Exception.Message -ExtraLog @((Write-UpdaterLog $_.Exception.Message 'ERROR'))
        exit 20
    } finally {
        Release-UpdateLock
    }
}

function Invoke-Update {
    $current = Get-LocalVersion
    $target = $Version
    $assetUrl = $null
    $expectedSha = $null
    $notes = $null
    # Declared up front: the catch block reads both, and Set-StrictMode throws on an
    # uninitialised variable if the run failed before the Backup/Swap steps assigned them.
    $backupFile = $null
    $prevDir = $null
    # Dedicated migrate/health rollback paths start the app themselves. Outer catch must
    # not Start-VbApp again (second start.bat fights the first via app.lock / ~60s health).
    $appRecoveryStarted = $false

    try {
        Acquire-UpdateLock
    } catch {
        # The API seeds a 'running' status before launching us, so bailing out without writing
        # one leaves the UI polling something that never advances until its 10-minute timeout.
        # A stale lock from a crashed run blocks for 2h, which makes this very reachable.
        Write-UpdateStatus -Step 1 -StepName 'Lock' -Status 'error' `
            -Message 'Another update is already running' `
            -CurrentVersion $current -ErrorText $_.Exception.Message `
            -ExtraLog @((Write-UpdaterLog "Update lock busy: $($_.Exception.Message)" 'ERROR'))
        Write-Error $_.Exception.Message
        exit 10
    }

    try {
        Write-UpdateStatus -Step 1 -StepName 'Lock' -Status 'running' -Message 'Update lock acquired' -CurrentVersion $current -ExtraLog @((Write-UpdaterLog 'Update started'))

        if ($LocalPackage) {
            # Offline install from a package already on the machine (USB stick, RDP copy).
            # Only Resolve and Download need the network - every later step, including the
            # database backup and both rollback paths, is local and still runs in full.
            Write-UpdateStatus -Step 2 -StepName 'Resolve' -Status 'running' -Message "Using local package $LocalPackage" -CurrentVersion $current
            if (-not (Test-Path -LiteralPath $LocalPackage -PathType Leaf)) {
                throw "Local package not found: $LocalPackage"
            }
            $zipPath = (Resolve-Path -LiteralPath $LocalPackage).Path

            # The download step clears staging\ before writing into it. A package left there
            # would be deleted before it could be extracted, so refuse it with a clear reason
            # instead of failing later with "file not found".
            $stagingFull = [IO.Path]::GetFullPath($script:StagingDir)
            if (-not $stagingFull.EndsWith([IO.Path]::DirectorySeparatorChar)) {
                $stagingFull = $stagingFull + [IO.Path]::DirectorySeparatorChar
            }
            if ($zipPath.StartsWith($stagingFull, [StringComparison]::OrdinalIgnoreCase)) {
                throw ('Move the package out of the staging folder first - that folder is cleared during update: ' + $zipPath)
            }

            # A file carried across on a USB stick is exactly the case worth checksumming.
            # pack-windows.sh emits <name>.zip.sha256 next to the zip; use it when it came along.
            $shaSidecar = "$zipPath.sha256"
            if (Test-Path -LiteralPath $shaSidecar) {
                $expectedSha = ((Get-Content -LiteralPath $shaSidecar -Raw).Trim() -split '\s+')[0]
                Write-UpdaterLog "Local package sha256 from sidecar: $expectedSha" | Out-Null
            } else {
                Write-UpdaterLog 'No .sha256 sidecar next to local package - integrity not verified' 'WARN' | Out-Null
            }

            Write-UpdateStatus -Step 3 -StepName 'Download' -Status 'running' -Message 'Skipped - installing from local package' -ExtraLog @((Write-UpdaterLog "Local package $zipPath"))
            # Clear only the extract target. Wiping all of staging\ is the download path's job.
            $staleExtract = Join-Path $script:StagingDir 'extracted'
            if (Test-Path -LiteralPath $staleExtract) {
                Remove-Item -LiteralPath $staleExtract -Recurse -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-UpdateStatus -Step 2 -StepName 'Resolve' -Status 'running' -Message 'Resolving target version'
            if (-not $target -or -not $Force) {
                $feed = Get-UpdateFeed
                $releases = @(Get-JsonProp $feed 'releases' @())
                if (-not $target) {
                    $target = Get-JsonProp $feed 'latest'
                    if (-not $target -and $releases.Count -gt 0) { $target = $releases[0].version }
                }
                $rel = $releases | Where-Object { (Get-JsonProp $_ 'version') -eq $target } | Select-Object -First 1
                if (-not $rel) { throw "Version $target not found in feed" }
                $assetUrl = Get-JsonProp $rel 'assetUrl'
                $expectedSha = Get-JsonProp $rel 'sha256'
                $notes = Get-JsonProp $rel 'notes'
            }

            # Skipped for -LocalPackage: handing the updater a specific file IS the intent,
            # and $target is unknown until the package is extracted.
            if (-not $Force -and (Compare-SemVer $target $current) -le 0) {
                Write-UpdateStatus -Step 10 -StepName 'Finalize' -Status 'success' -Message 'Already on target version' -TargetVersion $target -ExtraLog @((Write-UpdaterLog 'Already current'))
                exit 11
            }

            if (-not $assetUrl) {
                if ($env:UPDATE_ASSET_URL_TEMPLATE) {
                    $assetUrl = $env:UPDATE_ASSET_URL_TEMPLATE.Replace('{version}', $target)
                } else {
                    throw 'No assetUrl for target version'
                }
            }

            Write-UpdateStatus -Step 3 -StepName 'Download' -Status 'running' -Message "Downloading $assetUrl" -TargetVersion $target -ExtraLog @((Write-UpdaterLog "Download $assetUrl"))
            Get-ChildItem -LiteralPath $script:StagingDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            $zipPath = Join-Path $script:StagingDir "vbeyond-windows-v$target.zip"
            $headers = @{}
            if ($env:GITHUB_TOKEN) { $headers['Authorization'] = "Bearer $($env:GITHUB_TOKEN)" }
            Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -Headers $headers -UseBasicParsing
        }

        if ($expectedSha) {
            $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($hash -ne $expectedSha.ToLowerInvariant()) {
                throw "SHA256 mismatch: expected $expectedSha got $hash"
            }
        }

        if ($DryRun) {
            Write-UpdateStatus -Step 10 -StepName 'Finalize' -Status 'success' -Message 'DryRun: download verified' -ExtraLog @((Write-UpdaterLog 'DryRun complete'))
            exit 0
        }

        Write-UpdateStatus -Step 4 -StepName 'Verify' -Status 'running' -Message 'Extracting package'
        $extractRoot = Join-Path $script:StagingDir 'extracted'
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
        # Zip may contain a single top-level folder
        $newApp = $extractRoot
        $children = @(Get-ChildItem -LiteralPath $extractRoot -Directory)
        if ((Test-Path (Join-Path $extractRoot 'VERSION')) -eq $false -and $children.Count -eq 1) {
            $newApp = $children[0].FullName
        }
        # Prefer nested app\ if present
        if (Test-Path (Join-Path $newApp 'app\VERSION')) {
            $payloadRoot = $newApp
            $newApp = Join-Path $newApp 'app'
        } else {
            $payloadRoot = $null
        }
        if (-not (Test-Path (Join-Path $newApp 'VERSION'))) {
            throw 'Package missing VERSION'
        }
        # -LocalPackage skips the feed, so this is the first point the target version is known.
        # Status messages and the Finalize record need it; the feed path already set it.
        if (-not $target) {
            $target = (Get-Content -LiteralPath (Join-Path $newApp 'VERSION') -Raw).Trim()
            Write-UpdaterLog "Local package version: $target (current $current)" | Out-Null
        }

        # Merge updater scripts if present in payload
        $updSrc = if ($payloadRoot) { Join-Path $payloadRoot 'updater' } else { Join-Path (Split-Path $newApp -Parent) 'updater' }
        if (-not (Test-Path $updSrc)) {
            $updSrc = Join-Path $extractRoot 'updater'
        }

        if (-not $SkipBackup) {
            Write-UpdateStatus -Step 5 -StepName 'BackupDB' -Status 'running' -Message 'Backing up database'
            $backupFile = Invoke-PgDumpBackup -Suffix 'pre-update'
            Write-UpdateStatus -Step 5 -StepName 'BackupDB' -Status 'running' -Message "Backup: $backupFile" -BackupFile $backupFile -ExtraLog @((Write-UpdaterLog "Backup $backupFile"))
        } else {
            Write-UpdateStatus -Step 5 -StepName 'BackupDB' -Status 'running' -Message 'Skipped backup (CI only)'
        }

        Write-UpdateStatus -Step 6 -StepName 'StopApp' -Status 'running' -Message 'Stopping application'
        Stop-VbApp
        Start-Sleep -Seconds 2

        Write-UpdateStatus -Step 7 -StepName 'Swap' -Status 'running' -Message 'Swapping app directory'
        # $current comes from a file (app\VERSION) and is about to be used to build a path
        # that gets Remove-Item -Recurse -Force'd. Validate it the same way the rollback path
        # validates a caller-supplied version, so a corrupted VERSION can never point the
        # delete outside releases\.
        Assert-SafeReleaseVersion -Version $current
        $prevDir = Join-Path $script:ReleasesDir $current
        if (Test-Path -LiteralPath $prevDir) {
            Remove-Item -LiteralPath $prevDir -Recurse -Force
        }
        if (Test-Path -LiteralPath $script:AppDir) {
            Move-Item -LiteralPath $script:AppDir -Destination $prevDir -Force
        }
        New-Item -ItemType Directory -Path $script:AppDir -Force | Out-Null
        Copy-Item -Path (Join-Path $newApp '*') -Destination $script:AppDir -Recurse -Force

        if ($updSrc -and (Test-Path $updSrc)) {
            $updDst = Join-Path $script:VbHome 'updater'
            Copy-Item -Path (Join-Path $updSrc '*') -Destination $updDst -Recurse -Force
        }
        # Launchers live at VB_HOME, not inside app\. Without this, a fix to start/stop/setup
        # only ever reaches a fresh install - an updated site keeps running the old scripts.
        if ($payloadRoot) {
            foreach ($launcher in @(
                'start.bat', 'stop.bat', 'stop-app.ps1', 'setup.bat',
                'install-service.ps1', 'uninstall-service.ps1',
                'install-service.bat', 'uninstall-service.bat'
            )) {
                $launcherSrc = Join-Path $payloadRoot $launcher
                if (Test-Path -LiteralPath $launcherSrc) {
                    Copy-Item -LiteralPath $launcherSrc -Destination (Join-Path $script:VbHome $launcher) -Force
                }
            }
        }
        # Refresh env example only
        $envExample = if ($payloadRoot) { Join-Path $payloadRoot 'config\.env.example' } else { $null }
        if ($envExample -and (Test-Path $envExample)) {
            Copy-Item -LiteralPath $envExample -Destination (Join-Path $script:VbHome 'config\.env.example') -Force
        }

        Write-UpdateStatus -Step 8 -StepName 'Migrate' -Status 'running' -Message 'Running migrations' -PreviousAppDir $prevDir
        try {
            Invoke-MigrateDeploy
        } catch {
            Write-UpdaterLog "Migrate failed; rolling back DB + app from $prevDir" 'ERROR' | Out-Null
            try {
                Restore-AppTree -SourceDir $prevDir -BackupFile $backupFile
            } catch {
                Write-UpdaterLog "Full rollback failed: $($_.Exception.Message)" 'ERROR' | Out-Null
                throw "Migrate failed and rollback incomplete: $($_.Exception.Message)"
            }
            Start-VbApp
            $appRecoveryStarted = $true
            throw
        }

        Write-UpdateStatus -Step 9 -StepName 'StartApp' -Status 'running' -Message 'Starting application'
        Start-VbApp
        if (-not (Wait-VbHealth -TimeoutSec 60)) {
            Write-UpdaterLog 'Health failed; rolling back DB + previous app' 'ERROR' | Out-Null
            Stop-VbApp
            try {
                Restore-AppTree -SourceDir $prevDir -BackupFile $backupFile
            } catch {
                Write-UpdaterLog "Full rollback failed: $($_.Exception.Message)" 'ERROR' | Out-Null
                throw "Health check failed and rollback incomplete: $($_.Exception.Message)"
            }
            Start-VbApp
            $appRecoveryStarted = $true
            throw 'Health check failed after update'
        }

        # Prune old releases
        $keep = 3
        if ($env:KEEP_RELEASES) { [int]$keep = $env:KEEP_RELEASES }
        # By LastWriteTime, not Name: these folders are named after versions, and a string
        # sort puts "1.0.7" above "1.0.66" - so the release you would actually roll back to
        # was the one being pruned. Newest-kept is what "keep the last 3" means anyway.
        Get-ChildItem -LiteralPath $script:ReleasesDir -Directory |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip $keep |
            ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

        Get-ChildItem -LiteralPath $script:StagingDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        Write-UpdateStatus -Step 10 -StepName 'Finalize' -Status 'success' -Message "Updated to $target" -CurrentVersion $target -TargetVersion $target -ExtraLog @((Write-UpdaterLog "Success $current -> $target"))
        exit 0
    } catch {
        $msg = $_.Exception.Message
        # Steps 6-9 leave the app stopped unless a dedicated rollback path already restarted
        # it. Outer recovery must not double-start (start.bat single-instance lock fights the
        # in-flight start and can leave a false "previous release" log with a broken site).
        try {
            if ($appRecoveryStarted) {
                if (Wait-VbHealth -TimeoutSec 60) {
                    Write-UpdaterLog 'Update failed; rolled back and previous release is healthy' 'WARN' | Out-Null
                } else {
                    Write-UpdaterLog 'Update failed; rollback start is still unhealthy' 'ERROR' | Out-Null
                }
            } elseif (-not (Wait-VbHealth -TimeoutSec 5)) {
                $didRestore = $false
                $appVersionPath = Join-Path $script:AppDir 'VERSION'
                if ($prevDir -and (Test-Path -LiteralPath $prevDir)) {
                    if (-not (Test-Path -LiteralPath $appVersionPath)) {
                        # Swap incomplete - put previous tree back.
                        Restore-AppTree -SourceDir $prevDir -BackupFile $backupFile
                        $didRestore = $true
                    } else {
                        # New tree present but unhealthy / never finished starting. Prefer
                        # previous release so frequent update failures do not leave a half-applied app\.
                        Stop-VbApp
                        Restore-AppTree -SourceDir $prevDir -BackupFile $backupFile
                        $didRestore = $true
                    }
                }
                Start-VbApp
                if (Wait-VbHealth -TimeoutSec 60) {
                    if ($didRestore) {
                        Write-UpdaterLog 'Update failed; app restarted on the previous release' 'WARN' | Out-Null
                    } else {
                        Write-UpdaterLog 'Update failed; app restarted on current app\ tree (no previous release to restore)' 'WARN' | Out-Null
                    }
                } else {
                    Write-UpdaterLog 'Update failed; recovery start did not become healthy' 'ERROR' | Out-Null
                }
            }
        } catch {
            Write-UpdaterLog "Recovery after failed update did not complete: $($_.Exception.Message)" 'ERROR' | Out-Null
        }
        Write-UpdateStatus -Step 0 -StepName 'Failed' -Status 'failed' -Message $msg -ErrorText $msg -ExtraLog @((Write-UpdaterLog $msg 'ERROR'))
        if ($msg -match 'already running') { exit 10 }
        if ($msg -match 'SHA256|Download') { exit 12 }
        if ($msg -match 'pg_dump|Backup') { exit 13 }
        if ($msg -match 'migrate') { exit 14 }
        if ($msg -match 'Health') { exit 15 }
        exit 1
    } finally {
        Release-UpdateLock
    }
}

switch ($Action) {
    'Check' { Invoke-Check }
    'Update' { Invoke-Update }
    'Status' { Invoke-Status }
    'Rollback' { Invoke-Rollback }
    'Backup' { Invoke-BackupOnly }
}
