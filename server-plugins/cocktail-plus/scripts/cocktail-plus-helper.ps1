# cocktail-plus SillyTavern backend plugin helper for Windows PowerShell
# Run this script on the machine that runs SillyTavern.

$ErrorActionPreference = 'Stop'

$PluginId = 'cocktail-plus'
$Script:SelectedConfigPath = $null
$Script:SelectedRoot = $null
$Script:BackendUpdateNotice = $null
$Script:BackendUpdateCheckError = $null
$Script:BackendUpdateCheckJob = $null
$Script:BackendUpdateCheckStartedAt = $null

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
    try { Start-BackendUpdateCheck } catch {}
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

function Restore-CocktailPlusIndexHtml {
    param(
        [switch]$NoBackup
    )
    Ensure-ConfigSelected
    $indexPath = Join-Path $Script:SelectedRoot 'public\index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        Write-Warn "index.html 不存在，跳过恢复：$indexPath"
        return
    }

    $html = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
    $next = $html
    $markerStart = '<!-- cocktail-plus early bridge start -->'
    $markerEnd = '<!-- cocktail-plus early bridge end -->'
    $markerRegex = "(?s)$([regex]::Escape($markerStart)).*?$([regex]::Escape($markerEnd))\s*"

    # Remove Early Bridge block first. This usually also removes the importmap block.
    $next = [regex]::Replace($next, $markerRegex, '')

    # Safety cleanup for partially edited HTML: remove remaining cocktail-plus importmap / bridge script tags.
    $next = [regex]::Replace($next, '<script\b[^>]*\bid=["'']cocktail-plus-module-import-map["''][\s\S]*?</script>\s*', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $next = [regex]::Replace($next, '<script\b[^>]*\bid=["'']cocktail-plus-early-bridge["''][\s\S]*?</script>\s*', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    # Restore module proxy tags back to their original src.
    $scriptRegex = '(?im)^(?<indent>[ \t]*)<script\b[^>]*\bdata-cp-module-proxy-original=["''](?<orig>[^"'']+)["''][^>]*>\s*</script>[ \t]*(?:\r?\n)?'
    $next = [regex]::Replace($next, $scriptRegex, {
        param($match)
        $indent = $match.Groups['indent'].Value
        $orig = $match.Groups['orig'].Value
        return "$indent<script type=`"module`" src=`"$orig`"></script>`r`n"
    }, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    # If script.js is missing after restoring i18n.js, insert it back.
    $hasScriptJs = [regex]::IsMatch($next, '<script\b(?=[^>]*\btype=["'']module["''])(?=[^>]*\bsrc=["'']/?script\.js["''])[^>]*>\s*</script>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $hasScriptJs) {
        $i18nRegex = '(?im)^(?<indent>[ \t]*)<script\b(?=[^>]*\btype=["'']module["''])(?=[^>]*\bsrc=["'']scripts/i18n\.js["''])[^>]*>\s*</script>[ \t]*(?:\r?\n)?'
        $next = [regex]::Replace($next, $i18nRegex, {
            param($match)
            $indent = $match.Groups['indent'].Value
            return $match.Value.TrimEnd() + "`r`n$indent<script type=`"module`" src=`"script.js`"></script>`r`n"
        }, 1)
    }

    # Remove duplicate script.js module tags, keeping the first one.
    $scriptJsLineRegex = '(?im)^(?<line>[ \t]*<script\b(?=[^>]*\btype=["'']module["''])(?=[^>]*\bsrc=["'']/?script\.js["''])[^>]*>\s*</script>)\s*$'
    $script:cpSeenScriptJsForRepair = $false
    $next = [regex]::Replace($next, $scriptJsLineRegex, {
        param($match)
        if ($script:cpSeenScriptJsForRepair) { return '' }
        $script:cpSeenScriptJsForRepair = $true
        return $match.Groups['line'].Value
    })
    Remove-Variable -Name cpSeenScriptJsForRepair -Scope Script -ErrorAction SilentlyContinue

    $next = [regex]::Replace($next, "\n{3,}", "`n`n")
    if ($next -eq $html) {
        Write-Warn 'index.html 未发现 cocktail-plus 注入或 module proxy 改写。'
        return
    }

    $backup = $null
    if (-not $NoBackup) { $backup = Backup-File $indexPath }
    Set-Content -LiteralPath $indexPath -Value $next -Encoding UTF8
    if ($backup) { Write-Host "已备份 index.html：$backup" }
    Write-Ok 'index.html 已恢复，cocktail-plus Early Bridge 注入已移除。'
}

function Repair-BackendUninstallBlackScreen {
    Ensure-ConfigSelected
    Write-Title '修复卸载后端扩展后启动立马黑屏问题'
    Restore-CocktailPlusIndexHtml -NoBackup
    Write-Ok '已直接修复 index.html：移除 Early Bridge 注入，并恢复 i18n.js/script.js module 脚本。'
}



function Get-ChatsEnoentPatchPath {
    Ensure-ConfigSelected
    $chatsPath = Join-Path $Script:SelectedRoot 'src\endpoints\chats.js'
    if (-not (Test-Path -LiteralPath $chatsPath -PathType Leaf)) {
        throw "找不到 chats.js：$chatsPath"
    }
    return $chatsPath
}

function Apply-SillyTavernChatsEnoentPatch {
    $chatsPath = Get-ChatsEnoentPatchPath
    $text = Get-Content -LiteralPath $chatsPath -Raw -Encoding UTF8
    $original = $text

    $oldStat = '        const stats = await fs.promises.stat(pathToFile);'
    $newStat = @'
        let stats;
        try {
            stats = await fs.promises.stat(pathToFile);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                console.debug(`Chat file no longer exists, skipping: ${pathToFile}`);
                res({});
                return;
            }
            console.warn('Failed to stat chat file:', pathToFile, error);
            res({});
            return;
        }
'@.TrimEnd()

    if ($text -notlike '*Chat file no longer exists, skipping*') {
        if (-not $text.Contains($oldStat)) { throw '未找到 stat 补丁插入点，可能当前版本源码结构不同。' }
        $text = $text.Replace($oldStat, $newStat)
    }

    if ($text -notlike '*Chat file disappeared while reading*') {
        $streamPattern = '        const fileStream = fs\.createReadStream\(pathToFile\);\r?\n        const rl = readline\.createInterface\(\{'
        if (-not [regex]::IsMatch($text, $streamPattern)) { throw '未找到 read stream 补丁插入点，可能当前版本源码结构不同。' }
        $newStream = @'
        const fileStream = fs.createReadStream(pathToFile);
        fileStream.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                console.debug(`Chat file disappeared while reading, skipping: ${pathToFile}`);
            } else {
                console.warn('Failed to read chat file:', pathToFile, error);
            }
            res({});
        });
        const rl = readline.createInterface({
'@.TrimEnd()
        $text = [regex]::Replace($text, $streamPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newStream }, 1)
    }

    if ($text -eq $original) {
        Write-Warn 'chats.js 看起来已经包含 ENOENT 防崩补丁。'
        return
    }

    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($chatsPath, $text, $enc)
    Write-Ok "已应用补丁：$chatsPath"
    Write-Warn '请重启 SillyTavern 后生效。'
}

function Restore-SillyTavernChatsEnoentPatch {
    $chatsPath = Get-ChatsEnoentPatchPath
    $text = Get-Content -LiteralPath $chatsPath -Raw -Encoding UTF8
    $original = $text

    $oldStat = @'
        let stats;
        try {
            stats = await fs.promises.stat(pathToFile);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                console.debug(`Chat file no longer exists, skipping: ${pathToFile}`);
                res({});
                return;
            }
            console.warn('Failed to stat chat file:', pathToFile, error);
            res({});
            return;
        }
'@.TrimEnd()
    $newStat = '        const stats = await fs.promises.stat(pathToFile);'
    if ($text.Contains($oldStat)) { $text = $text.Replace($oldStat, $newStat) }

    $streamPattern = "        const fileStream = fs\.createReadStream\(pathToFile\);\r?\n        fileStream\.on\('error', \(error\) => \{[\s\S]*?\r?\n        \}\);\r?\n        const rl = readline\.createInterface\(\{"
    $streamOriginal = @'
        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({
'@.TrimEnd()
    if ([regex]::IsMatch($text, $streamPattern)) {
        $text = [regex]::Replace($text, $streamPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $streamOriginal }, 1)
    }

    if ($text -eq $original) {
        Write-Warn 'chats.js 未发现 ENOENT 防崩补丁，无需恢复。'
        return
    }

    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($chatsPath, $text, $enc)
    Write-Ok "已恢复补丁：$chatsPath"
    Write-Warn '请重启 SillyTavern 后生效。'
}

function Invoke-SillyTavernChatsEnoentPatchMenu {
    Ensure-ConfigSelected
    Write-Title 'SillyTavern 聊天文件 ENOENT 崩溃补丁'
    Write-Host '[1] 应用补丁'
    Write-Host '[2] 恢复补丁'
    Write-Host '[0] 返回'
    $choice = Read-Host '请选择'
    switch ($choice.Trim()) {
        '1' { Apply-SillyTavernChatsEnoentPatch }
        '2' { Restore-SillyTavernChatsEnoentPatch }
        '0' { return }
        default { Write-Warn '无效选项。' }
    }
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
    Restore-CocktailPlusIndexHtml
    Remove-Item -LiteralPath $dst -Recurse -Force
    Write-Ok '后端插件已删除。'
    Write-Warn '请重启 SillyTavern 后生效。'
}

function Get-BackendPluginDir {
    Ensure-ConfigSelected
    return (Join-Path (Join-Path $Script:SelectedRoot 'plugins') $PluginId)
}

function Get-BackendConfigPath {
    return (Join-Path (Get-BackendPluginDir) 'config.json')
}

function Get-BackendConfigSchema {
    return @(
        [pscustomobject]@{ Key='enabled'; Label='启用后端加速'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='serviceWorkerEnabled'; Label='允许提供 Service Worker'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='cacheCharactersAll'; Label='缓存 characters/all'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='cacheVersion'; Label='缓存 /version'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='staleWhileRevalidate'; Label='允许 stale-while-revalidate'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='maxStaleMs'; Label='最大 stale 时间(ms)'; Type='int'; Default=600000; Min=0; Max=86400000 },
        [pscustomobject]@{ Key='shallowCharactersAll'; Label='characters/all 返回浅层角色列表'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='diskCacheCharactersAll'; Label='characters/all 磁盘缓存'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='diskCacheVersion'; Label='/version 磁盘缓存'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='fastVersionOnMiss'; Label='/version 无缓存快速响应'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='asyncCharactersAllOnMiss'; Label='无 characters 缓存先返回空列表并后台构建'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='earlyBridgeEnabled'; Label='启用 Early Bridge 脚本'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='autoInstallEarlyBridge'; Label='后端启动时自动注入 Early Bridge'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='earlyBridgePatchFetch'; Label='Early Bridge patch fetch'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='optimizeSettingsGet'; Label='优化 /api/settings/get 下载'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='cacheSettingsGet'; Label='缓存 settings/get 响应'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='optimizeSettingsSave'; Label='优化 /api/settings/save 上传'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='settingsSaveNoopEnabled'; Label='settings/save 启用 no-op hash'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='settingsSavePatchEnabled'; Label='settings/save 启用 JSON patch'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='settingsSaveMaxPatchOperations'; Label='settings patch 最大操作数'; Type='int'; Default=2000; Min=1; Max=100000 },
        [pscustomobject]@{ Key='settingsSaveMaxPatchBytesRatio'; Label='settings patch/full 比例阈值'; Type='number'; Default=0.85; Min=0.05; Max=2 },
        [pscustomobject]@{ Key='optimizeChatSave'; Label='优化 /api/chats/save 上传'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='chatSaveNoopEnabled'; Label='chat/save 启用 no-op hash'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='chatSavePatchEnabled'; Label='chat/save 启用聊天 patch'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='chatSaveMaxPatchOperations'; Label='chat patch 最大操作数'; Type='int'; Default=5000; Min=1; Max=100000 },
        [pscustomobject]@{ Key='chatSaveMaxPatchBytesRatio'; Label='chat patch/full 比例阈值'; Type='number'; Default=0.85; Min=0.05; Max=2 },
        [pscustomobject]@{ Key='chatSaveCacheMaxEntries'; Label='chat 后端缓存条目'; Type='int'; Default=64; Min=0; Max=1024 },
        [pscustomobject]@{ Key='templatePreloadEnabled'; Label='并行预取 scripts/templates 模板'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='startupPreloadEnabled'; Label='提前预取 /version 响应'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='serviceWorkerFastRouteFallback'; Label='SW 兜底 /version 与 characters/all'; Type='bool'; Default=$false },
        [pscustomobject]@{ Key='serviceWorkerSettingsGetFallback'; Label='SW 兜底 settings/get'; Type='bool'; Default=$false },
        [pscustomobject]@{ Key='serviceWorkerSettingsSaveFallback'; Label='SW 兜底 settings/save'; Type='bool'; Default=$false },
        [pscustomobject]@{ Key='serviceWorkerChatSaveFallback'; Label='SW 兜底 chat/save'; Type='bool'; Default=$false },
        [pscustomobject]@{ Key='serviceWorkerTemplateFallback'; Label='SW 兜底模板缓存'; Type='bool'; Default=$false },
        [pscustomobject]@{ Key='moduleProxyEnabled'; Label='模块代理替换酒馆串行代码'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='patchStartupInit'; Label='替换 firstLoadInit 串行等待'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='patchI18nInit'; Label='替换 initLocales 串行等待'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='patchSystemMessagesInit'; Label='替换 initSystemMessages 模板串行'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='patchExtensionManifests'; Label='替换 getManifests 使用预取结果'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='patchParallelActivateExtensions'; Label='并行激活扩展（实验）'; Type='bool'; Default=$true },
        [pscustomobject]@{ Key='autoPatchChatsEnoentGuard'; Label='启动时自动写入 ST chats.js ENOENT 防崩补丁'; Type='bool'; Default=$false }
    )
}

function Read-BackendConfig {
    $schema = Get-BackendConfigSchema
    $config = [ordered]@{}
    foreach ($item in $schema) { $config[$item.Key] = $item.Default }

    $configPath = Get-BackendConfigPath
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        try {
            $json = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($prop in $json.PSObject.Properties) { $config[$prop.Name] = $prop.Value }
        } catch {
            Write-Warn "读取 config.json 失败，将使用默认值：$($_.Exception.Message)"
        }
    }
    return $config
}

function Write-BackendConfig([System.Collections.IDictionary]$Config) {
    $pluginDir = Get-BackendPluginDir
    if (-not (Test-Path -LiteralPath $pluginDir -PathType Container)) {
        throw "后端插件目录不存在，请先安装后端扩展：$pluginDir"
    }
    $configPath = Get-BackendConfigPath
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $backup = Backup-File $configPath
        if ($backup) { Write-Host "已备份后端配置：$backup" }
    }
    ($Config | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $configPath -Encoding UTF8
    Write-Ok "已写入后端配置：$configPath"
}

function Reset-BackendConfigDefault {
    $config = [ordered]@{}
    foreach ($item in (Get-BackendConfigSchema)) { $config[$item.Key] = $item.Default }
    Write-BackendConfig $config
}

function Edit-BackendConfigItem($SchemaItem) {
    $config = Read-BackendConfig
    $current = $config[$SchemaItem.Key]
    if ($SchemaItem.Type -eq 'bool') {
        $inputValue = Read-Host "$($SchemaItem.Label) 当前=$current。输入 true/false，直接回车则切换"
        if ([string]::IsNullOrWhiteSpace($inputValue)) {
            $config[$SchemaItem.Key] = -not [bool]$current
        } else {
            $config[$SchemaItem.Key] = $inputValue.Trim().ToLower() -in @('1', 'true', 'yes', 'y', 'on')
        }
    } else {
        $inputValue = Read-Host "$($SchemaItem.Label) 当前=$current。输入新数值，直接回车取消"
        if ([string]::IsNullOrWhiteSpace($inputValue)) { return }
        $n = if ($SchemaItem.Type -eq 'int') { [int][double]$inputValue } else { [double]$inputValue }
        if ($SchemaItem.PSObject.Properties.Name -contains 'Min') { $n = [Math]::Max([double]$SchemaItem.Min, [double]$n) }
        if ($SchemaItem.PSObject.Properties.Name -contains 'Max') { $n = [Math]::Min([double]$SchemaItem.Max, [double]$n) }
        if ($SchemaItem.Type -eq 'int') { $n = [int]$n }
        $config[$SchemaItem.Key] = $n
    }
    Write-BackendConfig $config
}

function Invoke-BackendConfigMenu {
    Ensure-ConfigSelected
    $pluginDir = Get-BackendPluginDir
    if (-not (Test-Path -LiteralPath $pluginDir -PathType Container)) {
        Write-Warn "后端插件目录不存在，请先安装后端扩展：$pluginDir"
        return
    }

    while ($true) {
        $schema = @(Get-BackendConfigSchema)
        $config = Read-BackendConfig
        Write-Title '修改 cocktail-plus 后端插件配置项'
        Write-Host "配置文件：$(Get-BackendConfigPath)"
        for ($i = 0; $i -lt $schema.Count; $i++) {
            $item = $schema[$i]
            Write-Host ("[{0}] {1} = {2}  - {3}" -f ($i + 1), $item.Key, $config[$item.Key], $item.Label)
        }
        Write-Host '[r] 重置为默认推荐配置'
        Write-Host '[0] 返回'
        $choice = Read-Host '请选择要修改的配置项'
        if ($choice -eq '0') { break }
        if ($choice.Trim().ToLower() -eq 'r') {
            $confirm = Read-Host '确认重置 config.json 为默认推荐配置？(y/N)'
            if ($confirm.Trim().ToLower() -in @('y', 'yes')) { Reset-BackendConfigDefault }
            continue
        }
        $index = [int]$choice - 1
        if ($index -lt 0 -or $index -ge $schema.Count) { Write-Warn '无效选项'; continue }
        Edit-BackendConfigItem $schema[$index]
        Write-Warn '配置更改通常需要重启 SillyTavern 后生效。'
    }
}

function Add-UniqueProcessId([System.Collections.Generic.List[int]]$List, [int]$ProcessId) {
    if ($ProcessId -le 0) { return }
    if ($ProcessId -eq $PID) { return }
    if (-not $List.Contains($ProcessId)) { [void]$List.Add($ProcessId) }
}

function Get-SillyTavernPort {
    try {
        $raw = Get-ConfigScalar $Script:SelectedConfigPath 'port' '8000'
        $port = [int]$raw
        if ($port -gt 0 -and $port -le 65535) { return $port }
    } catch {}
    return 8000
}

function Add-DescendantProcessIds([System.Collections.Generic.List[int]]$Ids, $AllProcesses, [int]$ParentId) {
    foreach ($child in @($AllProcesses | Where-Object { [int]$_.ParentProcessId -eq $ParentId })) {
        $childId = [int]$child.ProcessId
        if ($childId -le 0 -or $Ids.Contains($childId)) { continue }
        Add-UniqueProcessId $Ids $childId
        Add-DescendantProcessIds $Ids $AllProcesses $childId
    }
}

function Find-SillyTavernProcessIdsForRoot {
    Ensure-ConfigSelected
    $ids = [System.Collections.Generic.List[int]]::new()
    $rootPattern = [regex]::Escape((Get-FullPathSafe $Script:SelectedRoot))
    try {
        $allProcesses = @(Get-CimInstance Win32_Process)
        $processes = $allProcesses | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'server\.js|Start\.bat|SillyTavern|node|cmd\.exe') }
        $directMatches = [System.Collections.Generic.List[int]]::new()

        foreach ($p in $processes) {
            $cmd = [string]$p.CommandLine
            $hit = $false
            if ($cmd -match $rootPattern) { $hit = $true }
            foreach ($m in [regex]::Matches($cmd, '"([^"]*?server\.js)"|([A-Za-z]:\\[^\r\n"]*?server\.js)')) {
                $serverJs = if ($m.Groups[1].Value) { $m.Groups[1].Value } else { $m.Groups[2].Value }
                if ($serverJs -and (Test-SillyTavernRoot (Split-Path -Parent $serverJs)) -and ((Get-FullPathSafe (Split-Path -Parent $serverJs)) -eq (Get-FullPathSafe $Script:SelectedRoot))) { $hit = $true }
            }
            if ($hit) { Add-UniqueProcessId $directMatches ([int]$p.ProcessId) }
        }

        foreach ($processId in @($directMatches)) {
            Add-UniqueProcessId $ids $processId
            Add-DescendantProcessIds $ids $allProcesses $processId
        }

        $port = Get-SillyTavernPort
        try {
            $portPids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
            foreach ($portPid in $portPids) { Add-UniqueProcessId $ids ([int]$portPid) }
        } catch {
            try {
                $netstat = netstat -ano -p tcp | Select-String -Pattern (":$port\s+.*LISTENING\s+(\d+)")
                foreach ($line in $netstat) {
                    if ($line.Line -match "LISTENING\s+(\d+)\s*$") { Add-UniqueProcessId $ids ([int]$Matches[1]) }
                }
            } catch {}
        }
    } catch {
        Write-Warn "查找 SillyTavern 进程失败：$($_.Exception.Message)"
    }
    return @($ids | Select-Object -Unique)
}

function Get-BackendVersion([string]$PluginDir) {
    $versionJsonPath = Join-Path $PluginDir 'version.json'
    if (Test-Path -LiteralPath $versionJsonPath -PathType Leaf) {
        try {
            $json = Get-Content -LiteralPath $versionJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $version = [string]$json.version
            if (-not [string]::IsNullOrWhiteSpace($version)) { return $version.Trim() }
        } catch {}
    }

    $constantPath = Join-Path $PluginDir 'src\constants.ts'
    $bundlePath = Join-Path $PluginDir 'index.mjs'
    $pattern = 'VERSION\s*=\s*[''\"]([^''\"]+)[''\"]'
    foreach ($file in @($constantPath, $bundlePath)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        try {
            $text = Get-Content -LiteralPath $file -Raw -Encoding UTF8
            if ($text -match $pattern) { return $Matches[1] }
        } catch {}
    }

    return $null
}

function Compare-VersionString([string]$A, [string]$B) {
    try { return ([version]$A).CompareTo([version]$B) } catch { return [string]::Compare($A, $B, $true) }
}

function Get-RemoteCocktailPlusInfo([switch]$Quiet) {
    $sources = @(
        [pscustomobject]@{ Name='GitHub'; Manifest='https://raw.githubusercontent.com/Lianues/cocktail-plus/main/server-plugins/cocktail-plus/version.json'; Repo='https://github.com/Lianues/cocktail-plus.git' },
        [pscustomobject]@{ Name='Gitee'; Manifest='https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json'; Repo='https://gitee.com/lianues/cocktail-plus.git' }
    )
    foreach ($source in $sources) {
        try {
            if (-not $Quiet) { Write-Info "检查远端版本：$($source.Name)" }
            $manifest = Invoke-RestMethod -Uri $source.Manifest -Method GET -TimeoutSec 8
            $version = [string]$manifest.version
            if (-not [string]::IsNullOrWhiteSpace($version)) {
                return [pscustomobject]@{ Name=$source.Name; Version=$version.Trim(); Repo=$source.Repo; Sources=$sources }
            }
        } catch {
            if (-not $Quiet) { Write-Warn "$($source.Name) 检查失败：$($_.Exception.Message)" }
        }
    }
    throw '无法从 GitHub/Gitee 获取 cocktail-plus 后端远端版本。'
}

function Get-HelperBundledBackendDir {
    if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { return $null }
    try {
        $dir = Split-Path -Parent $PSScriptRoot
        if ((Test-Path -LiteralPath $dir -PathType Container) -and (Test-Path -LiteralPath (Join-Path $dir 'index.mjs') -PathType Leaf)) {
            return $dir
        }
    } catch {}
    return $null
}

function Get-BackendUpdateCurrentDir {
    if ($Script:SelectedRoot) {
        $installed = Join-Path (Join-Path $Script:SelectedRoot 'plugins') $PluginId
        if (Test-Path -LiteralPath $installed -PathType Container) { return $installed }
    }
    try {
        $processConfigs = @(Find-SillyTavernConfigsFromProcesses 6>$null | Where-Object { Test-SillyTavernConfig $_ } | Select-Object -Unique)
        if ($processConfigs.Count -eq 1) {
            $root = Split-Path -Parent $processConfigs[0]
            $installed = Join-Path (Join-Path $root 'plugins') $PluginId
            if (Test-Path -LiteralPath $installed -PathType Container) { return $installed }
        }
    } catch {
        # 启动自动检查只做静默探测，失败时回退到脚本所在后端目录。
    }
    return (Get-HelperBundledBackendDir)
}

function Update-BackendUpdateNotice([switch]$Quiet) {
    $Script:BackendUpdateNotice = $null
    $Script:BackendUpdateCheckError = $null
    try {
        $currentDir = Get-BackendUpdateCurrentDir
        $currentVersion = if ($currentDir) { Get-BackendVersion $currentDir } else { $null }
        if ([string]::IsNullOrWhiteSpace($currentVersion)) { return }

        $remote = Get-RemoteCocktailPlusInfo -Quiet:$Quiet
        if ($remote -and $remote.Version -and (Compare-VersionString $currentVersion $remote.Version) -lt 0) {
            $Script:BackendUpdateNotice = [pscustomobject]@{
                CurrentVersion = $currentVersion
                RemoteVersion = $remote.Version
                SourceName = $remote.Name
            }
        }
    } catch {
        $Script:BackendUpdateCheckError = $_.Exception.Message
        if (-not $Quiet) { Write-Warn "自动检查后端扩展更新失败：$Script:BackendUpdateCheckError" }
    }
}

function Start-BackendUpdateCheck {
    $Script:BackendUpdateNotice = $null
    $Script:BackendUpdateCheckError = $null
    try {
        if ($Script:BackendUpdateCheckJob) {
            Remove-Job -Job $Script:BackendUpdateCheckJob -Force -ErrorAction SilentlyContinue
            $Script:BackendUpdateCheckJob = $null
        }
        $Script:BackendUpdateCheckStartedAt = $null
    } catch {}

    $currentDir = Get-BackendUpdateCurrentDir
    $currentVersion = if ($currentDir) { Get-BackendVersion $currentDir } else { $null }
    if ([string]::IsNullOrWhiteSpace($currentVersion)) { return }

    try {
        $Script:BackendUpdateCheckJob = Start-Job -ArgumentList $currentVersion -ScriptBlock {
            param([string]$CurrentVersion)
            function Compare-VersionString([string]$A, [string]$B) {
                try { return ([version]$A).CompareTo([version]$B) } catch { return [string]::Compare($A, $B, $true) }
            }

            $sources = @(
                [pscustomobject]@{ Name='GitHub'; Manifest='https://raw.githubusercontent.com/Lianues/cocktail-plus/main/server-plugins/cocktail-plus/version.json' },
                [pscustomobject]@{ Name='Gitee'; Manifest='https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json' }
            )
            foreach ($source in $sources) {
                try {
                    $manifest = Invoke-RestMethod -Uri $source.Manifest -Method GET -TimeoutSec 8
                    $remoteVersion = [string]$manifest.version
                    if (-not [string]::IsNullOrWhiteSpace($remoteVersion)) {
                        $remoteVersion = $remoteVersion.Trim()
                        if ((Compare-VersionString $CurrentVersion $remoteVersion) -lt 0) {
                            return [pscustomobject]@{ CurrentVersion=$CurrentVersion; RemoteVersion=$remoteVersion; SourceName=$source.Name }
                        }
                        return $null
                    }
                } catch {}
            }
            return $null
        }
        $Script:BackendUpdateCheckStartedAt = [DateTime]::UtcNow
    } catch {
        # 如果后台任务不可用，则退回静默同步检查。
        Update-BackendUpdateNotice -Quiet
    }
}

function Receive-BackendUpdateCheckResult {
    if (-not $Script:BackendUpdateCheckJob) { return }
    if ($Script:BackendUpdateCheckJob.State -in @('Running', 'NotStarted')) {
        if ($Script:BackendUpdateCheckStartedAt -and (([DateTime]::UtcNow - $Script:BackendUpdateCheckStartedAt).TotalSeconds -gt 30)) {
            Remove-Job -Job $Script:BackendUpdateCheckJob -Force -ErrorAction SilentlyContinue
            $Script:BackendUpdateCheckJob = $null
            $Script:BackendUpdateCheckStartedAt = $null
        }
        return
    }
    try {
        $result = Receive-Job -Job $Script:BackendUpdateCheckJob -ErrorAction SilentlyContinue | Select-Object -Last 1
        if ($result -and $result.RemoteVersion) { $Script:BackendUpdateNotice = $result }
    } catch {
        $Script:BackendUpdateCheckError = $_.Exception.Message
    } finally {
        Remove-Job -Job $Script:BackendUpdateCheckJob -Force -ErrorAction SilentlyContinue
        $Script:BackendUpdateCheckJob = $null
        $Script:BackendUpdateCheckStartedAt = $null
    }
}

function Show-BackendUpdateNotice {
    Receive-BackendUpdateCheckResult
    if (-not $Script:BackendUpdateNotice) { return }
    Write-Host ''
    Write-Warn "检测到 cocktail-plus 后端扩展更新：$($Script:BackendUpdateNotice.CurrentVersion) -> $($Script:BackendUpdateNotice.RemoteVersion)（$($Script:BackendUpdateNotice.SourceName)）"
    Write-Warn '输入9更新 cocktail-plus 后端扩展；前端扩展请在酒馆网页进行更新。'
}

function Clone-CocktailPlusRepo($RemoteInfo, [string]$TempRoot) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw '找不到 git 命令。请安装 Git，或先通过前端扩展安装后再使用本脚本。'
    }

    $ordered = @()
    if ($RemoteInfo?.Repo) { $ordered += $RemoteInfo.Repo }
    foreach ($source in $RemoteInfo.Sources) {
        if ($ordered -notcontains $source.Repo) { $ordered += $source.Repo }
    }

    foreach ($repo in $ordered) {
        try {
            if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force }
            Write-Info "下载仓库：$repo"
            & git clone --depth 1 $repo $TempRoot
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path $TempRoot 'server-plugins\cocktail-plus\index.mjs') -PathType Leaf)) {
                return (Join-Path $TempRoot 'server-plugins\cocktail-plus')
            }
            Write-Warn "仓库内容不完整：$repo"
        } catch {
            Write-Warn "下载失败：$repo - $($_.Exception.Message)"
        }
    }
    throw 'GitHub/Gitee 仓库下载均失败。'
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | Where-Object { $_.Name -notin @('.git', 'node_modules', '.deploy-backups') } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

function Invoke-BackendUpdateFromRepository {
    Ensure-ConfigSelected
    Write-Title '检查/更新 cocktail-plus 后端扩展'
    if ($Script:BackendUpdateCheckJob) {
        Remove-Job -Job $Script:BackendUpdateCheckJob -Force -ErrorAction SilentlyContinue
        $Script:BackendUpdateCheckJob = $null
    }
    $target = Get-BackendPluginDir
    $pluginsDir = Join-Path $Script:SelectedRoot 'plugins'
    New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null

    $currentVersion = if (Test-Path -LiteralPath $target -PathType Container) { Get-BackendVersion $target } else { $null }
    $remote = Get-RemoteCocktailPlusInfo
    Write-Host "当前后端版本：$(if ($currentVersion) { $currentVersion } else { '未安装/未知' })"
    Write-Host "远端后端版本：$($remote.Version)（$($remote.Name)）"

    if ($currentVersion -and (Compare-VersionString $currentVersion $remote.Version) -ge 0) {
        $force = Read-Host '当前后端看起来已是最新版本。是否仍然重新下载覆盖安装？(y/N)'
        if ($force.Trim().ToLower() -notin @('y', 'yes')) { return }
    } else {
        $confirm = Read-Host '是否下载并安装/更新后端扩展？(Y/n)'
        if (-not [string]::IsNullOrWhiteSpace($confirm) -and $confirm.Trim().ToLower() -notin @('y', 'yes')) { return }
    }

    $tempRoot = Join-Path $env:TEMP ("cocktail-plus-repo-" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    $source = Clone-CocktailPlusRepo $remote $tempRoot

    $remoteVersionJsonPath = Join-Path $source 'version.json'
    if (-not (Test-Path -LiteralPath $remoteVersionJsonPath -PathType Leaf) -and $remote.Version) {
        @{ version = $remote.Version } | ConvertTo-Json -Depth 2 | Set-Content -LiteralPath $remoteVersionJsonPath -Encoding UTF8
    }

    # Preserve runtime config/cache from existing backend.
    if (Test-Path -LiteralPath $target -PathType Container) {
        foreach ($item in @('config.json', 'cache')) {
            $srcItem = Join-Path $target $item
            if (Test-Path -LiteralPath $srcItem) {
                Copy-Item -LiteralPath $srcItem -Destination (Join-Path $source $item) -Recurse -Force
            }
        }
    }

    $backup = $null
    try {
        if (Test-Path -LiteralPath $target -PathType Container) {
            $backupRoot = Join-Path $pluginsDir '.cocktail-plus-backups'
            New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
            $backup = Join-Path $backupRoot ("$PluginId-update-" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
            Move-Item -LiteralPath $target -Destination $backup -Force
            Write-Host "已备份旧后端插件：$backup"
        }
        Copy-DirectoryContents $source $target
    } catch {
        Write-Warn "替换目录失败，将尝试原地覆盖：$($_.Exception.Message)"
        Copy-DirectoryContents $source $target
    } finally {
        try { if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force } } catch {}
    }

    Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $true
    Write-Ok "后端扩展已更新到：$target"
    $Script:BackendUpdateNotice = $null
    Write-Warn '请重启 SillyTavern 后生效。'
}



function Stop-ProcessTreeForce([int]$ProcessId) {
    if ($ProcessId -le 0 -or $ProcessId -eq $PID) { return }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    try {
        if (Get-Command taskkill.exe -ErrorAction SilentlyContinue) {
            $output = & taskkill.exe /PID $ProcessId /T /F 2>&1
            Start-Sleep -Milliseconds 200
            if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
                Write-Host "已停止旧进程树 PID=$ProcessId"
                return
            }
            if ($LASTEXITCODE -ne 0 -and $output) { Write-Warn ($output -join "`n") }
        }
    } catch {}
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    } catch {
        if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
            Write-Warn "停止进程 PID=$ProcessId 失败：$($_.Exception.Message)"
        }
    }
}

function Invoke-RestartSillyTavern {
    Ensure-ConfigSelected
    Write-Title '重启 SillyTavern'
    Write-Warn '将尝试启动一个新的 SillyTavern 进程，并停止当前匹配到的旧进程。不同启动方式下可能需要手动重启。'
    $confirm = Read-Host '确认继续？(y/N)'
    if ($confirm.Trim().ToLower() -notin @('y', 'yes')) { Write-Warn '已取消'; return }

    $pids = @(Find-SillyTavernProcessIdsForRoot)

    $root = Get-FullPathSafe $Script:SelectedRoot
    $startBat = Join-Path $root 'Start.bat'
    $starter = Join-Path $env:TEMP ("cocktail-plus-restart-" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.ps1')
    $rootLiteral = $root.Replace("'", "''")
    $startBatLiteral = $startBat.Replace("'", "''")
    $starterContent = @"
Start-Sleep -Seconds 2
Set-Location -LiteralPath '$rootLiteral'
if (Test-Path -LiteralPath '$startBatLiteral') {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', '$startBatLiteral') -WorkingDirectory '$rootLiteral'
} else {
    Start-Process -FilePath 'node' -ArgumentList @('server.js') -WorkingDirectory '$rootLiteral'
}
"@
    Set-Content -LiteralPath $starter -Value $starterContent -Encoding UTF8
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $starter) -WindowStyle Hidden
    Write-Ok '已安排 2 秒后重新启动 SillyTavern。'

    if ($pids.Count -eq 0) {
        Write-Warn '未找到需要停止的旧 SillyTavern 进程；如果新进程端口冲突，请手动关闭旧进程。'
        return
    }
    Write-Info ('将停止以下旧进程 PID：' + ($pids -join ', '))
    foreach ($processId in ($pids | Sort-Object -Descending)) {
        try {
            Stop-ProcessTreeForce ([int]$processId)
        } catch {
            Write-Warn "停止进程 PID=$processId 失败：$($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 500
    $stillAlive = @($pids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if ($stillAlive.Count -gt 0) { Write-Warn ('仍检测到未退出 PID：' + ($stillAlive -join ', ') + '。如端口冲突，请手动关闭它们。') }
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
    Write-Host '使用教程：' -ForegroundColor Cyan
    Write-Host '* 输入1或2 配置酒馆配置文件路径'
    Write-Host '* 输入3安装 cocktail-plus 后端扩展'
    Write-Host ''
    Write-Host '如果需要卸载，则输入4'
    Write-Host ''
    Write-Host '如果需要修改配置，则输入8'
    Write-Host ''
    Write-Host '重启酒馆本体，输入9'
    Write-Host ''
    Write-Host '后端扩展和前端扩展更新是独立的，需要分别进行更新'
    Write-Host '后端扩展更新输入10，前端扩展更新在酒馆网页进行更新'
    Show-BackendUpdateNotice
    Write-Host ''
    Write-Host '[1] 自动探测 SillyTavern/config.yaml（酒馆配置文件）'
    Write-Host '[2] 手动输入 SillyTavern/config.yaml（酒馆配置文件）路径'
    Write-Host '[3] 安装/重新安装 cocktail-plus 后端扩展，会自动开启酒馆使用后端扩展权限'
    Write-Host '[4] 卸载 cocktail-plus 后端扩展（恢复 index.html）'
    Write-Host '[5] 修复卸载后端扩展后启动立马黑屏问题'
    Write-Host '[6] 允许酒馆使用后端扩展'
    Write-Host '[7] 禁止酒馆使用后端扩展'
    Write-Host '[8] 修改 cocktail-plus 后端插件配置项'
    Write-Host '[9] 重启 SillyTavern 酒馆本体'
    Write-Host '[10] 更新 cocktail-plus 后端扩展版本'
    Write-Host '[11] 显示当前选择'
    Write-Host '[12] 修复 SillyTavern 聊天文件 ENOENT 崩溃问题'
    Write-Host '[0] 退出'
}

Start-BackendUpdateCheck

while ($true) {
    try {
        Show-Menu
        $choice = Read-Host '请选择'
        switch ($choice.Trim()) {
            '1' { Invoke-AutoLocateConfig }
            '2' { Invoke-ManualConfigInput }
            '3' { Install-BackendPlugin }
            '4' { Remove-BackendPlugin }
            '5' { Repair-BackendUninstallBlackScreen }
            '6' { Ensure-ConfigSelected; Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $true; Write-Warn '请重启 SillyTavern 后生效。' }
            '7' {
                Ensure-ConfigSelected
                Write-Warn '注意：这会禁用所有 SillyTavern Server Plugins，不只是 cocktail-plus。'
                $confirm = Read-Host '确认关闭？(y/N)'
                if ($confirm.Trim().ToLower() -in @('y', 'yes')) { Set-ConfigBool $Script:SelectedConfigPath 'enableServerPlugins' $false; Write-Warn '请重启 SillyTavern 后生效。' }
            }
            '8' { Invoke-BackendConfigMenu }
            '9' { Invoke-RestartSillyTavern }
            '10' { Invoke-BackendUpdateFromRepository }
            '11' { Show-CurrentSelection }
            '12' { Invoke-SillyTavernChatsEnoentPatchMenu }
            '0' { break }
            default { Write-Warn '无效选项。' }
        }
    } catch {
        Write-Host ''
        Write-Host "错误：$($_.Exception.Message)" -ForegroundColor Red
    }
}

