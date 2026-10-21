# 智能题库 · 停止服务（只结束占用 3000 端口的 node 进程，不动其它程序）
$Port = 3000
$killed = @()
try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') {
            Stop-Process -Id $p.Id -Force
            $killed += $p.Id
        }
    }
} catch { }
if ($killed.Count -gt 0) {
    Write-Host ('题库服务已停止（PID: ' + ($killed -join ', ') + '）')
} else {
    Write-Host ('没有发现正在运行的题库服务（端口 ' + $Port + ' 未被 node 占用）。')
}