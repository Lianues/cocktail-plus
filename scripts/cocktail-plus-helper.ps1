# cocktail-plus SillyTavern backend plugin helper for Windows PowerShell
# Run this script on the machine that runs SillyTavern.

$ErrorActionPreference = 'Stop'

$PluginId = 'cocktail-plus'
$Script:SelectedConfigPath = $null
$Script:SelectedRoot = $null

function Write-Title([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Magenta
    Write-Host ('=' * [Math]::Min(70, [Math]::Max(10, $Text.Length))) -ForegroundColor DarkMagenta
}

function Write-Ok([string]$Text) { Write-Host $Text -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host $Text -ForegroundColor Yellow }
function Write-Info([string]$Text) { Write-Host $Text -ForegroundColor Cyan }

function Get-FullPathSafe([string]$Path) {
    try { return [System.IO.Path]::GetFullPath($Path) } catch { return $Path }
}

function Test-SillyTavernRoot([string]$Root) {
    if ([string]::IsNullOrWhiteSpace($Root)) { return $false }
    $rootFull = Get-FullPathSafe $Root
    return (
        (Test-Path -LiteralPath (Join-Path $rootFull 'config.yaml') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $rootFull 'server.js') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $rootFull 'package.json') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $rootFull 'public\index.html') -PathType Leaf)
    )
}

function Test-SillyTavernConfig([string]$ConfigPath) {
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) { return $false }
    $full = Get-FullPathSafe $ConfigPath
    if ((Test-Path -LiteralPath $full -PathType Container)) {
        $full = Join-Path $full 'config.yaml'
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $false }
    return Test-SillyTavernRoot (Split-Path -Parent $full)
}

function Set-SelectedConfig([string]$ConfigPath) {
    $full = Get-FullPathSafe $ConfigPath
    if ((Test-Path -LiteralPath $full -PathType Container)) {
        $full = Join-Path $full 'config.yaml'
    }
    if (-not (Test-SillyTavernConfig $full)) {
        throw "不是有效的 SillyTavern config.yaml: $ConfigPath"
    }
    $Script:SelectedConfigPath = $full
    $Script:SelectedRoot = Split-Path -Parent $full
    Write-Ok "当前 SillyTavern: $Script:SelectedRoot"
    Write-Host "config.yaml: $Script:SelectedConfigPath"
}

function Add-UniquePath([System.Collections.Generic.List[string]]$List, [string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $full = Get-FullPathSafe $Path
    if (-not $List.Contains($full)) { [void]$List.Add($full) }
}

function Find-SillyTavernConfigsFromProcesses {
    $configs = [System.Collections.Generic.List[string]]::new()
    try {
        $processes = Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -and ($_.CommandLine -match 'server\.js|Start\.bat|SillyTavern')
        }
        foreach ($p in $processes) {
            $cmd = [string]$p.CommandLine
            $matches = @()
            $matches += [regex]::Matches($cmd, '"([^"]*?(?:server\.js|Start\.bat))"') | ForEach-Object { $_.Groups[1].Value }
            $matches += [regex]::Matches($cmd, '([A-Za-z]:\\[^\r\n"]*?(?:server\.js|Start\.bat))') | ForEach-Object { $_.Groups[1].Value }

            foreach ($filePath in $matches) {
                if ([string]::IsNullOrWhiteSpace($filePath)) { continue }
                $root = Split-Path -Parent $filePath
                $config = Join-Path $root 'config.yaml'
                if (Test-SillyTavernConfig $config) { Add-UniquePath $configs $config }
            }
        }
    } catch {
        Write-Warn "进程探测失败：$($_.Exception.Message)"
    }
    return @($configs)
}

function Get-ParentDirectories([string]$Path) {
    $items = [System.Collections.Generic.List[string]]::new()
    try {
        $current = Get-FullPathSafe $Path
        while (-not [string]::IsNullOrWhiteSpace($current)) {
            Add-UniquePath $items $current
            $parent = Split-Path -Parent $current
            if ($parent -eq $current) { break }
            $current = $parent
        }
    } catch {}
    return @($items)
}

function Search-ConfigYamlUnder([string]$Base, [int]$MaxDepth = 5, [int]$MaxResults = 40) {
    $results = [System.Collections.Generic.List[string]]::new()
    if ([string]::IsNullOrWhiteSpace($Base) -or -not (Test-Path -LiteralPath $Base -PathType Container)) { return @($results) }

    $skipNames = @('node_modules', '.git', 'dist', 'build', '.cache', 'cache', 'backups', '$Recycle.Bin', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData')
    $queue = [System.Collections.Generic.Queue[object]]::new()
    $queue.Enqueue([pscustomobject]@{ Path = (Get-FullPathSafe $Base); Depth = 0 })

    while ($queue.Count -gt 0 -and $results.Count -lt $MaxResults) {
        $item = $queue.Dequeue()
        $dir = [string]$item.Path
        $depth = [int]$item.Depth

        $config = Join-Path $dir 'config.yaml'
        if (Test-SillyTavernConfig $config) { Add-UniquePath $results $config }

        if ($depth -ge $MaxDepth) { continue }
        try {
            $children = Get-ChildItem -LiteralPath $dir -Directory -Force -ErrorAction SilentlyContinue
            foreach ($child in $children) {
                if ($skipNames -contains $child.Name) { continue }
                $queue.Enqueue([pscustomobject]@{ Path = $child.FullName; Depth = $depth + 1 })
            }
        } catch {}
    }
    return @($results)
}

function Find-SillyTavernConfigsByScan {
    $configs = [System.Collections.Generic.List[string]]::new()

    foreach ($dir in (Get-ParentDirectories (Get-Location).Path)) {
        $config = Join-Path $dir 'config.yaml'
        if (Test-SillyTavernConfig $config) { Add-UniquePath $configs $config }
    }

    $bases = [System.Collections.Generic.List[string]]::new()
    Add-UniquePath $bases (Get-Location).Path
    if ($env:USERPROFILE) {
        Add-UniquePath $bases (Join-Path $env:USERPROFILE 'Desktop')
        Add-UniquePath $bases (Join-Path $env:USERPROFILE 'Downloads')
        Add-UniquePath $bases (Join-Path $env:USERPROFILE 'Documents')
    }
    try {
        Get-PSDrive -PSProvider FileSystem | ForEach-Object { Add-UniquePath $bases ($_.Root) }
    } catch {}

    foreach ($base in $bases) {
        Write-Info "扫描：$base"
        foreach ($config in (Search-ConfigYamlUnder $base 5 40)) {
            Add-UniquePath $configs $config
        }
    }

    return @($configs)
}

function Select-ConfigFromList([string[]]$Configs) {
    $valid = @($Configs | Where-Object { Test-SillyTavernConfig $_ } | Select-Object -Unique)
    if ($valid.Count -eq 0) { return $null }
    if ($valid.Count -eq 1) {
        Write-Host "找到 SillyTavern：$((Split-Path -Parent $valid[0]))"
        $yes = Read-Host "使用这个目录？(Y/n)"
        if ([string]::IsNullOrWhiteSpace($yes) -or $yes.Trim().ToLower() -in @('y', 'yes')) { return $valid[0] }
        return $null
    }

    Write-Host ''
    Write-Host '找到多个候选 config.yaml：' -ForegroundColor Green
    for ($i = 0; $i -lt $valid.Count; $i++) {
        Write-Host "[$($i + 1)] $($valid[$i])"
    }
    $choice = Read-Host '请输入编号，或直接回车取消'
    if ([string]::IsNullOrWhiteSpace($choice)) { return $null }
    $index = [int]$choice - 1
    if ($index -lt 0 -or $index -ge $valid.Count) { throw '选择无效' }
    return $valid[$index]
}

function Invoke-AutoLocateConfig {
    Write-Title '自动定位 SillyTavern/config.yaml'
    Write-Info '优先从正在运行的 SillyTavern 进程中提取路径...'
    $fromProcesses = @(Find-SillyTavernConfigsFromProcesses)
    $chosen = Select-ConfigFromList $fromProcesses
    if ($chosen) { Set-SelectedConfig $chosen; return }

    Write-Warn '进程探测未定位到可用的 SillyTavern/config.yaml。'
    $scanConfirm = Read-Host '是否继续扫描常见目录和磁盘？可能需要一些时间。(y/N)'
    if ($scanConfirm.Trim().ToLower() -notin @('y', 'yes')) {
        Write-Warn '已跳过文件扫描。你可以选择“手动输入 config.yaml 路径”。'
        return
    }
    Write-Info '开始扫描常见目录和磁盘（可能需要一些时间）...'
    $fromScan = @(Find-SillyTavernConfigsByScan)
    $chosen = Select-ConfigFromList $fromScan
    if ($chosen) { Set-SelectedConfig $chosen; return }

    Write-Warn '没有自动找到 SillyTavern/config.yaml。'
}

function Invoke-ManualConfigInput {
    Write-Title '手动输入 config.yaml 路径'
    Write-Host '请输入 SillyTavern 的 config.yaml 路径。也可以输入 SillyTavern 文件夹，脚本会自动补 config.yaml。'
    $inputPath = Read-Host '路径'
    if ([string]::IsNullOrWhiteSpace($inputPath)) { return }
    Set-SelectedConfig $inputPath.Trim('"')
}

function Ensure-ConfigSelected {
    if ($Script:SelectedConfigPath -and (Test-SillyTavernConfig $Script:SelectedConfigPath)) { return }
    Invoke-AutoLocateConfig
    if (-not $Script:SelectedConfigPath) { Invoke-ManualConfigInput }
    if (-not $Script:SelectedConfigPath) { throw '未选择 SillyTavern/config.yaml' }
}

function Backup-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = "$Path.cocktail-plus.bak.$stamp"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    return $backup
}

function Set-ConfigBool([string]$ConfigPath, [string]$Key, [bool]$Value) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw "配置文件不存在：$ConfigPath" }
    $backup = Backup-File $ConfigPath
    $boolText = if ($Value) { 'true' } else { 'false' }
    $lines = @(Get-Content -LiteralPath $ConfigPath -ErrorAction Stop)
    $found = $false
    $next = foreach ($line in $lines) {
        if (-not $found -and $line -match "^\s*$([regex]::Escape($Key))\s*:") {
            $found = $true
            "${Key}: $boolText"
        } else {
            $line
        }
    }
    if (-not $found) { $next += "${Key}: $boolText" }
    Set-Content -LiteralPath $ConfigPath -Value $next -Encoding UTF8
    if ($backup) { Write-Host "已备份配置：$backup" }
    Write-Ok "$Key 已设置为 $boolText"
}

function Get-ConfigScalar([string]$ConfigPath, [string]$Key, [string]$DefaultValue) {
    try {
        $line = Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*:" } | Select-Object -Last 1
        if (-not $line) { return $DefaultValue }
        $value = ($line -replace '^\s*[^:]+\s*:\s*', '').Trim()
        $value = ($value -replace '\s+#.*$', '').Trim()
        $value = $value.Trim('"').Trim("'")
        if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
        return $value
    } catch {
        return $DefaultValue
    }
}

function Resolve-DataRoot([string]$Root, [string]$ConfigPath) {
    $value = Get-ConfigScalar $ConfigPath 'dataRoot' './data'
    if ([System.IO.Path]::IsPathRooted($value)) { return Get-FullPathSafe $value }
    return Get-FullPathSafe (Join-Path $Root $value)
}

function Find-FrontendBackendSource([string]$Root, [string]$ConfigPath) {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $dataRoot = Resolve-DataRoot $Root $ConfigPath

    Add-UniquePath $candidates (Join-Path $Root "public\scripts\extensions\third-party\$PluginId\server-plugins\$PluginId")
    Add-UniquePath $candidates (Join-Path $dataRoot "default-user\extensions\$PluginId\server-plugins\$PluginId")

    if (Test-Path -LiteralPath $dataRoot -PathType Container) {
        try {
            Get-ChildItem -LiteralPath $dataRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                Add-UniquePath $candidates (Join-Path $_.FullName "extensions\$PluginId\server-plugins\$PluginId")
            }
        } catch {}
    }

    foreach ($candidate in $candidates) {
        if ((Test-Path -LiteralPath $candidate -PathType Container) -and (Test-Path -LiteralPath (Join-Path $candidate 'index.mjs') -PathType Leaf)) {
            return $candidate
        }
    }

    Write-Warn '已尝试以下前端内置后端插件路径：'
    foreach ($candidate in $candidates) { Write-Host "- $candidate" }
    return $null
}

function Install-BackendPlugin {
    Ensure-ConfigSelected
    Write-Title '安装后端扩展'
    $src = Find-FrontendBackendSource $Script:SelectedRoot $Script:SelectedConfigPath
    if (-not $src) { throw '找不到前端扩展内置的 server-plugins/cocktail-plus。请确认前端扩展已安装。' }

    $pluginsDir = Join-Path $Script:SelectedRoot 'plugins'
    $dst = Join-Path $pluginsDir $PluginId
    New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null

    if (Test-Path -LiteralPath $dst) {
        $backupRoot = Join-Path $pluginsDir '.cocktail-plus-backups'
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        $backup = Join-Path $backupRoot ("$PluginId-" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
        Move-Item -LiteralPath $dst -Destination $backup -Force
        Write-Host "已备份旧后端插件：$backup"
    }

    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $true

    Write-Ok "后端插件已安装到：$dst"
    Write-Warn '请重启 SillyTavern 后生效。'
}

function Remove-BackendPlugin {
    Ensure-ConfigSelected
    Write-Title '删除后端扩展'
    $dst = Join-Path (Join-Path $Script:SelectedRoot 'plugins') $PluginId
    if (-not (Test-Path -LiteralPath $dst)) {
        Write-Warn "后端插件不存在：$dst"
        return
    }
    $confirm = Read-Host "确认删除 $dst ? (y/N)"
    if ($confirm.Trim().ToLower() -notin @('y', 'yes')) { Write-Warn '已取消'; return }
    Remove-Item -LiteralPath $dst -Recurse -Force
    Write-Ok '后端插件已删除。'
    Write-Warn '请重启 SillyTavern 后生效。'
}

function Show-CurrentSelection {
    Write-Title '当前选择'
    if ($Script:SelectedConfigPath) {
        Write-Host "SillyTavern: $Script:SelectedRoot"
        Write-Host "config.yaml: $Script:SelectedConfigPath"
        Write-Host "dataRoot: $(Resolve-DataRoot $Script:SelectedRoot $Script:SelectedConfigPath)"
    } else {
        Write-Warn '尚未选择 SillyTavern/config.yaml'
    }
}

function Show-Menu {
    Write-Title 'cocktail-plus 后端插件助手'
    Write-Host '[1] 自动探测 SillyTavern/config.yaml（进程优先，失败后扫描文件）'
    Write-Host '[2] 手动输入 SillyTavern/config.yaml 路径'
    Write-Host '[3] 安装/更新 cocktail-plus 后端扩展，并开启 enableServerPlugins'
    Write-Host '[4] 删除 cocktail-plus 后端扩展文件夹'
    Write-Host '[5] 开启 enableServerPlugins: true'
    Write-Host '[6] 关闭 enableServerPlugins: false（会禁用所有后端插件）'
    Write-Host '[7] 显示当前选择'
    Write-Host '[0] 退出'
}

while ($true) {
    try {
        Show-Menu
        $choice = Read-Host '请选择'
        switch ($choice.Trim()) {
            '1' { Invoke-AutoLocateConfig }
            '2' { Invoke-ManualConfigInput }
            '3' { Install-BackendPlugin }
            '4' { Remove-BackendPlugin }
            '5' { Ensure-ConfigSelected; Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $true; Write-Warn '请重启 SillyTavern 后生效。' }
            '6' {
                Ensure-ConfigSelected
                Write-Warn '注意：这会禁用所有 SillyTavern Server Plugins，不只是 cocktail-plus。'
                $confirm = Read-Host '确认关闭？(y/N)'
                if ($confirm.Trim().ToLower() -in @('y', 'yes')) { Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $false; Write-Warn '请重启 SillyTavern 后生效。' }
            }
            '7' { Show-CurrentSelection }
            '0' { break }
            default { Write-Warn '无效选项。' }
        }
    } catch {
        Write-Host ''
        Write-Host "错误：$($_.Exception.Message)" -ForegroundColor Red
    }
}

