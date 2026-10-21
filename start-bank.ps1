# 智能题库 · 一键启动脚本（Windows PowerShell 5.1 兼容）
#
# 修复的问题：
#   原来「题库启动器.vbs」直接跑 npm run start，但 .next 目录里只有 dev 模式的产物，
#   没有生产构建（缺 .next\BUILD_ID），next start 会在 1 秒内报错退出；
#   而 VBS 是隐藏窗口运行的，所以什么都看不到，浏览器只会显示「无法访问此网站」。
#
# 现在的行为：
#   1. 服务已经在运行时，直接打开页面，不会重复启动；
#   2. 有可用的生产构建就用 next start（快），否则自动用 next dev（一定能起来，不需要 build）；
#   3. 等端口和 /login 页面真正就绪后再打开浏览器，避免"打开太早"；
#   4. 全过程写入 启动日志.txt，失败时弹窗给出原因和日志路径。

param(
    [ValidateSet('auto', 'dev', 'prod')]
    [string]$Mode = 'auto',
    [switch]$Visible,     # 显示服务器窗口（最小化），默认完全隐藏
    [switch]$NoBrowser    # 只启动服务，不打开浏览器
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 供开机自启等场景使用：只起服务、不开浏览器
if ($env:STUDYBANK_NO_BROWSER -eq '1') { $NoBrowser = $true }

$Root    = $PSScriptRoot
$Port    = 3000
$Url     = "http://localhost:$Port"
$Login   = "$Url/login"
$LogFile = Join-Path $Root '启动日志.txt'
$OutLog  = Join-Path $Root '服务器输出.txt'
$ErrLog  = Join-Path $Root '服务器错误.txt'
$NextBin = Join-Path $Root 'node_modules\next\dist\bin\next'
$BuildId = Join-Path $Root '.next\BUILD_ID'

function Write-Log {
    param([string]$Message)
    $line = '[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Message
    try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { }
}

function Show-Box {
    param([string]$Text, [string]$Title = '智能题库')
    try { (New-Object -ComObject WScript.Shell).Popup($Text, 60, $Title, 16) | Out-Null } catch { }
}

function Test-PortOpen {
    param([int]$P)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $P)
        return $true
    } catch {
        return $false
    } finally {
        try { $client.Dispose() } catch { }
    }
}

function Open-Site {
    if (-not $NoBrowser) {
        try { Start-Process $Url | Out-Null } catch { Write-Log "打开浏览器失败：$($_.Exception.Message)" }
    }
}

function Fail {
    param([string]$Reason)
    Write-Log "失败：$Reason"
    Show-Box ("题库启动失败：`n`n" + $Reason + "`n`n详细日志：" + $LogFile)
    exit 1
}

# ---- 0. 单实例保护：连点两次不会起两个服务 ----
$mutex = New-Object System.Threading.Mutex($false, 'Local\StudyBank-Launcher')
$hasLock = $true
try { $hasLock = $mutex.WaitOne(0) } catch { $hasLock = $true }

try {
    Set-Content -LiteralPath $LogFile -Value ('=== 智能题库启动器 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ===') -Encoding UTF8
} catch {
    # 日志写不了也不能挡住启动
}

if (-not $hasLock) {
    Write-Log '已经有一个启动器在跑了，等它就绪后直接打开页面。'
    $d = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $d) {
        if (Test-PortOpen $Port) { Open-Site; exit 0 }
        Start-Sleep -Milliseconds 500
    }
    exit 0
}

try {
    # ---- 1. 服务已经在跑 ----
    if (Test-PortOpen $Port) {
        Write-Log "端口 $Port 上已经有服务在运行，直接打开浏览器。"
        Open-Site
        exit 0
    }

    # ---- 2. 环境检查 ----
    if (-not (Test-Path -LiteralPath $NextBin)) {
        Fail ("找不到 Next.js：" + $NextBin + "`n请先在本目录执行 npm install。")
    }

    $nodeExe = $null
    $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCmd) { $nodeExe = $nodeCmd.Source }
    if (-not $nodeExe -or -not (Test-Path -LiteralPath $nodeExe)) {
        foreach ($c in @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
            if (Test-Path -LiteralPath $c) { $nodeExe = $c; break }
        }
    }
    if (-not $nodeExe) { Fail '找不到 node.exe，请先安装 Node.js：https://nodejs.org' }

    # ---- 3. 决定用生产模式还是 dev 模式 ----
    $useProd = $false
    if ($Mode -eq 'prod') {
        if (-not (Test-Path -LiteralPath $BuildId)) {
            Fail '指定了 prod 模式，但 .next 里没有生产构建。请先执行：npm run build'
        }
        $useProd = $true
    } elseif ($Mode -eq 'auto') {
        if (Test-Path -LiteralPath $BuildId) {
            $buildTime = (Get-Item -LiteralPath $BuildId).LastWriteTime
            $sources = @()
            $srcDir = Join-Path $Root 'src'
            if (Test-Path -LiteralPath $srcDir) { $sources += Get-ChildItem -LiteralPath $srcDir -Recurse -File -ErrorAction SilentlyContinue }
            foreach ($f in @('package.json', 'next.config.mjs', 'tailwind.config.ts', 'postcss.config.js', 'tsconfig.json', '.env.local')) {
                $p = Join-Path $Root $f
                if (Test-Path -LiteralPath $p) { $sources += Get-Item -LiteralPath $p }
            }
            $newest = $sources | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($newest -and ($newest.LastWriteTime -gt $buildTime)) {
                Write-Log ('生产构建已过期（最新改动：' + $newest.Name + ' ' + $newest.LastWriteTime + '），本次改用 dev 模式。')
            } else {
                $useProd = $true
            }
        } else {
            Write-Log '没有找到生产构建（.next\BUILD_ID），本次用 dev 模式启动（不需要 build，一定能起来）。'
        }
    }

    # ---- 4. 依次尝试候选启动方式：生产模式起不来就自动退回 dev 模式 ----
    $candidates = @('dev')
    if ($useProd) { $candidates = @('start', 'dev') }
    if ($Mode -eq 'prod') { $candidates = @('start') }

    $windowStyle = 'Hidden'
    if ($Visible) { $windowStyle = 'Minimized' }

    $proc = $null
    $portOpen = $false
    $lastTail = ''
    foreach ($verb in $candidates) {
        Write-Log ('启动命令：node "' + $NextBin + '" ' + $verb + ' -p ' + $Port)
        $proc = Start-Process -FilePath $nodeExe `
            -ArgumentList @(('"' + $NextBin + '"'), $verb, '-p', "$Port") `
            -WorkingDirectory $Root `
            -WindowStyle $windowStyle `
            -RedirectStandardOutput $OutLog `
            -RedirectStandardError $ErrLog `
            -PassThru
        Write-Log ('服务进程 PID：' + $proc.Id)

        # ---- 5. 等端口就绪 ----
        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
            if (Test-PortOpen $Port) { $portOpen = $true; break }
            if ($proc.HasExited) { break }
            Start-Sleep -Milliseconds 500
        }
        if ($portOpen) { break }

        $lastTail = ''
        foreach ($f in @($ErrLog, $OutLog)) {
            if (Test-Path -LiteralPath $f) { $lastTail = $lastTail + (Get-Content -LiteralPath $f -Tail 20 -Encoding UTF8 | Out-String) }
        }
        if ($proc.HasExited) {
            Write-Log ('以 ' + $verb + ' 方式启动失败：进程已退出，退出码 ' + $proc.ExitCode)
        } else {
            Write-Log ('以 ' + $verb + ' 方式启动失败：等待 90 秒端口仍未就绪')
        }
        if ($verb -eq 'start' -and $candidates -contains 'dev') { Write-Log '改用 dev 模式重试…' }
    }

    if (-not $portOpen) {
        Write-Log $lastTail
        Show-Box ("题库启动失败，端口 $Port 没有起来。`n`n$lastTail`n完整日志：$LogFile")
        exit 1
    }
    Write-Log "端口 $Port 已就绪（$verb 模式），等待页面可访问…"

    # ---- 6. 等页面真正能打开（dev 模式首次访问要现场编译） ----
    $pageOk = $false
    $httpDeadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $httpDeadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Login -UseBasicParsing -TimeoutSec 60
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) { $pageOk = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 800
    }

    if ($pageOk) {
        Write-Log '页面自检通过（/login 正常响应），打开浏览器。'
    } else {
        Write-Log '页面自检未通过，仍然打开浏览器，若显示错误请刷新一次。'
    }

    Open-Site
    Write-Log '启动完成。要关闭服务，双击「停止题库.bat」。'
    exit 0
} finally {
    if ($hasLock) { try { $mutex.ReleaseMutex() } catch { } }
    try { $mutex.Dispose() } catch { }
}
