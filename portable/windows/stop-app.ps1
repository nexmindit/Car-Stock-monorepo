# Stop VBeyond portable app (service and/or console process tree).
# Called by stop.bat - can also run directly: powershell -File stop-app.ps1

$ErrorActionPreference = 'Continue'

$VbHome = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$VbHome = (Resolve-Path -LiteralPath $VbHome).Path
$appRoot = [IO.Path]::GetFullPath((Join-Path $VbHome 'app'))
if (-not $appRoot.EndsWith([IO.Path]::DirectorySeparatorChar)) {
    $appRoot = $appRoot + [IO.Path]::DirectorySeparatorChar
}
$pidFile = Join-Path $VbHome 'data\status\app.pid'
$lockFile = Join-Path $VbHome 'data\status\app.lock'

$script:Killed = New-Object System.Collections.Generic.List[int]
$script:Notes = New-Object System.Collections.Generic.List[string]

function Test-UnderApp {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    try {
        $full = [IO.Path]::GetFullPath($Path)
    } catch {
        return $false
    }
    return $full.StartsWith($appRoot, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ExePath {
    param([int]$ProcessId)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc) {
        try {
            if ($proc.Path) { return $proc.Path }
        } catch { }
    }
    try {
        $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
        if ($cim -and $cim.ExecutablePath) { return $cim.ExecutablePath }
    } catch { }
    return $null
}

function Stop-PidUnderApp {
    param(
        [int]$ProcessId,
        [string]$Reason,
        [switch]$RequirePath
    )
    if ($ProcessId -le 0) { return }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }

    $path = Get-ExePath -ProcessId $ProcessId
    if ($path) {
        if (-not (Test-UnderApp -Path $path)) {
            $script:Notes.Add("Refusing PID $ProcessId outside app: $path") | Out-Null
            return
        }
    } elseif ($RequirePath) {
        $script:Notes.Add("PID $ProcessId has no resolvable path; will try app\ scan") | Out-Null
        return
    }

    $label = if ($path) { $path } else { '(path unknown)' }
    Write-Host "  taskkill PID $ProcessId ($Reason) path=$label"
    Start-Process -FilePath 'taskkill.exe' `
        -ArgumentList @('/PID', "$ProcessId", '/T', '/F') `
        -Wait -NoNewWindow | Out-Null
    if (-not ($script:Killed -contains $ProcessId)) {
        $script:Killed.Add($ProcessId) | Out-Null
    }
}

function Get-AppProcesses {
    @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -and (Test-UnderApp -Path $_.ExecutablePath) })
}

Write-Host "Stopping VBeyond (root=$VbHome)..."

# 1) Windows Service
$svc = Get-Service -Name 'VBeyondCarStock' -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "  Stopping service VBeyondCarStock (status=$($svc.Status))..."
    try {
        Stop-Service -Name 'VBeyondCarStock' -Force -ErrorAction Stop
        $script:Notes.Add('service Stop-Service issued') | Out-Null
    } catch {
        try {
            & net.exe stop VBeyondCarStock 2>&1 | Out-Null
            $script:Notes.Add('service net stop issued') | Out-Null
        } catch {
            $script:Notes.Add("service stop failed: $($_.Exception.Message)") | Out-Null
        }
    }
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        $s = Get-Service -Name 'VBeyondCarStock' -ErrorAction SilentlyContinue
        if (-not $s -or $s.Status -eq 'Stopped') { break }
        Start-Sleep -Milliseconds 400
    }
}

# 2) PID from app.pid
$appPid = 0
if (Test-Path -LiteralPath $pidFile) {
    $raw = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
    if ($raw) {
        [void][int]::TryParse($raw.Trim(), [ref]$appPid)
    }
}
if ($appPid -gt 0) {
    Write-Host "  app.pid = $appPid"
    Stop-PidUnderApp -ProcessId $appPid -Reason 'from app.pid' -RequirePath
}

# 3) Fallback: anything whose executable lives under app\
Write-Host '  Scanning processes under app\...'
foreach ($proc in (Get-AppProcesses)) {
    $id = [int]$proc.ProcessId
    if ($script:Killed -contains $id) { continue }
    Stop-PidUnderApp -ProcessId $id -Reason 'under app'
}

Start-Sleep -Milliseconds 500

# Cleanup status files after stop attempts
if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $lockFile) {
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

$left = Get-AppProcesses
foreach ($n in $script:Notes) {
    Write-Host "  note: $n"
}

if ($left.Count -gt 0) {
    $ids = ($left | ForEach-Object { $_.ProcessId }) -join ', '
    Write-Host "ERROR: still running under app\: $ids"
    Write-Host 'Try Task Manager -> end vbeyond-api.exe, or run this script as Administrator.'
    exit 1
}

if ($script:Killed.Count -gt 0) {
    Write-Host ("Stopped. Killed PID(s): {0}" -f ($script:Killed -join ', '))
} else {
    Write-Host 'Stopped. No app process was running.'
}
exit 0
