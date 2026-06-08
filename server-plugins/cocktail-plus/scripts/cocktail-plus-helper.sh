#!/usr/bin/env bash
# cocktail-plus SillyTavern backend plugin helper for Linux/macOS.
# Run this script on the machine that runs SillyTavern.

set -u
PLUGIN_ID="cocktail-plus"
SELECTED_CONFIG=""
SELECTED_ROOT=""
BACKEND_UPDATE_NOTICE_CURRENT=""
BACKEND_UPDATE_NOTICE_REMOTE=""
BACKEND_UPDATE_NOTICE_SOURCE=""
BACKEND_UPDATE_CHECK_PID=""
BACKEND_UPDATE_NOTICE_FILE=""
BACKEND_UPDATE_CHECK_STARTED_AT=""
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || true)"

say_title() {
  printf '\n\033[35m%s\033[0m\n' "$1"
  printf '\033[35m%s\033[0m\n' "============================================================"
}

say_ok() { printf '\033[32m%s\033[0m\n' "$1"; }
say_warn() { printf '\033[33m%s\033[0m\n' "$1"; }
say_info() { printf '\033[36m%s\033[0m\n' "$1"; }

abs_path() {
  local p="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$p" 2>/dev/null || printf '%s\n' "$p"
  else
    python3 - <<'PY' "$p" 2>/dev/null || printf '%s\n' "$p"
import os, sys
print(os.path.abspath(sys.argv[1]))
PY
  fi
}

test_sillytavern_root() {
  local root="$1"
  [ -n "$root" ] || return 1
  [ -f "$root/config.yaml" ] || return 1
  [ -f "$root/server.js" ] || return 1
  [ -f "$root/package.json" ] || return 1
  [ -f "$root/public/index.html" ] || return 1
  return 0
}

test_sillytavern_config() {
  local cfg="$1"
  [ -n "$cfg" ] || return 1
  if [ -d "$cfg" ]; then cfg="$cfg/config.yaml"; fi
  [ -f "$cfg" ] || return 1
  test_sillytavern_root "$(dirname "$cfg")"
}

unique_lines() { awk 'NF && !seen[$0]++'; }

set_selected_config() {
  local cfg
  cfg="$(abs_path "$1")"
  if [ -d "$cfg" ]; then cfg="$cfg/config.yaml"; fi
  cfg="$(prefer_runtime_config_alias "$cfg")"
  if ! test_sillytavern_config "$cfg"; then
    say_warn "不是有效的 SillyTavern config.yaml: $1"
    return 1
  fi
  SELECTED_CONFIG="$cfg"
  SELECTED_ROOT="$(dirname "$cfg")"
  say_ok "当前 SillyTavern: $SELECTED_ROOT"
  printf 'config.yaml: %s\n' "$SELECTED_CONFIG"
  warn_termux_environment_aliases "$SELECTED_ROOT"
  start_backend_update_check >/dev/null 2>&1 || true
}

find_configs_from_processes() {
  local roots=()
  while IFS= read -r line; do
    local pid args cwd candidate root
    pid="${line%% *}"
    args="${line#* }"
    case "$args" in
      *server.js*|*Start.sh*|*start.sh*|*SillyTavern*) ;;
      *) continue ;;
    esac

    if [ -e "/proc/$pid/cwd" ]; then
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      if test_sillytavern_root "$cwd"; then roots+=("$cwd"); fi
    fi

    # Extract simple absolute server.js or start script paths from command line.
    while IFS= read -r candidate; do
      [ -n "$candidate" ] || continue
      root="$(cd "$(dirname "$candidate")" 2>/dev/null && pwd || true)"
      if test_sillytavern_root "$root"; then roots+=("$root"); fi
    done < <(printf '%s\n' "$args" | grep -Eo '(/[^[:space:]"'"'']+/(server\.js|Start\.sh|start\.sh)|/[^[:space:]"'"'']*server\.js)' || true)
  done < <(ps -eo pid=,args= 2>/dev/null || true)

  for root in "${roots[@]}"; do
    printf '%s/config.yaml\n' "$root"
  done | unique_lines
}

parent_dirs() {
  local dir
  dir="$(abs_path "$1")"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    printf '%s\n' "$dir"
    dir="$(dirname "$dir")"
  done
  printf '/\n'
}

termux_path_aliases() {
  local p="$1" suffix base
  p="$(abs_path "$p")"
  {
    printf '%s\n' "$p"

    case "$p" in
      /data/data/com.termux/files/home/*)
        suffix="${p#/data/data/com.termux/files/home/}"
        [ -n "$suffix" ] && printf '/root/%s\n' "$suffix"
        ;;
      /root/*)
        suffix="${p#/root/}"
        [ -n "$suffix" ] && printf '/data/data/com.termux/files/home/%s\n' "$suffix"
        ;;
    esac

    base="$(basename "$p")"
    if [ -n "$base" ] && [ "$base" != "/" ]; then
      [ -n "${HOME:-}" ] && printf '%s/%s\n' "$HOME" "$base"
      printf '/root/%s\n' "$base"
      printf '/data/data/com.termux/files/home/%s\n' "$base"
    fi
  } | unique_lines
}

config_aliases() {
  local cfg="$1" root alias
  [ -n "$cfg" ] || return 0
  root="$(dirname "$cfg")"
  while IFS= read -r alias; do
    [ -n "$alias" ] || continue
    test_sillytavern_root "$alias" || continue
    printf '%s/config.yaml\n' "$alias"
  done < <(termux_path_aliases "$root") | unique_lines
}

prefer_runtime_config_alias() {
  local cfg="$1" root alias cwd
  [ -f "$cfg" ] || { printf '%s\n' "$cfg"; return; }
  root="$(dirname "$cfg")"
  cwd="$(abs_path "$(pwd)")"

  # Termux/proot can expose the same project under both
  # /data/data/com.termux/files/home/SillyTavern and /root/SillyTavern.
  # If the user is currently inside a valid alias root, prefer that runtime path
  # so installs land in the running SillyTavern directory.
  while IFS= read -r alias; do
    [ -n "$alias" ] || continue
    [ "$alias" = "$root" ] && continue
    test_sillytavern_root "$alias" || continue
    case "$cwd" in
      "$alias"|"$alias"/*) printf '%s/config.yaml\n' "$alias"; return ;;
    esac
  done < <(termux_path_aliases "$root")

  printf '%s\n' "$cfg"
}

path_identity() {
  local p="$1"
  [ -e "$p" ] || return 1
  if stat -c '%d:%i' "$p" >/dev/null 2>&1; then
    stat -c '%d:%i' "$p" 2>/dev/null
  else
    stat -f '%d:%i' "$p" 2>/dev/null
  fi
}

same_directory() {
  local a="$1" b="$2" ia ib
  [ -d "$a" ] && [ -d "$b" ] || return 1
  ia="$(path_identity "$a" 2>/dev/null || true)"
  ib="$(path_identity "$b" 2>/dev/null || true)"
  [ -n "$ia" ] && [ -n "$ib" ] && [ "$ia" = "$ib" ]
}

warn_termux_environment_aliases() {
  local root="$1" alias distinct=0 same=0
  [ -n "$root" ] || return 0
  root="$(abs_path "$root")"

  while IFS= read -r alias; do
    [ -n "$alias" ] || continue
    [ "$alias" = "$root" ] && continue
    test_sillytavern_root "$alias" || continue

    if same_directory "$root" "$alias"; then
      same=1
      say_info "检测到 Termux/proot 路径别名指向同一目录：$alias"
    else
      distinct=1
      say_warn "检测到另一套可能独立的 SillyTavern 环境：$alias"
    fi
  done < <(termux_path_aliases "$root")

  if [ "$distinct" -eq 1 ]; then
    say_warn "本脚本只会安装/更新当前选择的环境：$root/plugins/$PLUGIN_ID"
    say_warn '不会同时写入另一套 /root 与 /data/data/com.termux/... 环境，避免重复安装。'
    say_warn '如果酒馆实际运行在另一套环境，请在那套 shell 中运行本脚本，或用菜单 [2] 手动选择它的 config.yaml。'
  elif [ "$same" -eq 1 ]; then
    say_info "当前选择的路径别名属于同一目录；不会产生双环境重复安装。"
  fi
}

candidate_sillytavern_roots() {
  { termux_path_aliases "$1"; parent_dirs "$(pwd)"; [ -n "${HOME:-}" ] && printf '%s/SillyTavern\n' "$HOME"; printf '/root/SillyTavern\n'; printf '/data/data/com.termux/files/home/SillyTavern\n'; } | unique_lines
}

search_configs_under() {
  local base="$1"
  local max_depth="${2:-5}"
  [ -d "$base" ] || return 0
  find "$base" -maxdepth "$max_depth" \
    \( -name node_modules -o -name .git -o -name dist -o -name build -o -name .cache -o -name cache -o -name backups \) -prune -o \
    -type f -name config.yaml -print 2>/dev/null | while IFS= read -r cfg; do
      if test_sillytavern_config "$cfg"; then printf '%s\n' "$(abs_path "$cfg")"; fi
    done
}

find_configs_by_scan() {
  {
    parent_dirs "$(pwd)" | while IFS= read -r d; do
      [ -f "$d/config.yaml" ] && test_sillytavern_config "$d/config.yaml" && abs_path "$d/config.yaml"
    done

    local bases=()
    bases+=("$(pwd)")
    [ -n "${HOME:-}" ] && bases+=("$HOME/Desktop" "$HOME/Downloads" "$HOME/Documents" "$HOME")
    bases+=("/root" "/opt" "/srv" "/home" "/Users")
    # Termux native and proot-distro commonly expose different absolute roots.
    bases+=("/data/data/com.termux/files/home" "/data/data/com.termux/files/usr")
    bases+=("/sdcard" "/storage/emulated/0")

    for base in "${bases[@]}"; do
      [ -d "$base" ] || continue
      say_info "扫描：$base" >&2
      search_configs_under "$base" 5
    done
  } | unique_lines
}

select_config_from_list() {
  local raw_configs=() configs=()
  while IFS= read -r cfg; do
    [ -n "$cfg" ] || continue
    raw_configs+=("$cfg")
  done

  # Expand Termux/proot aliases before asking. If the running process reports
  # /data/data/.../SillyTavern but /root/SillyTavern also exists, show both
  # instead of presenting a misleading single Y/n choice.
  while IFS= read -r cfg; do
    [ -n "$cfg" ] && configs+=("$cfg")
  done < <(
    for cfg in "${raw_configs[@]}"; do config_aliases "$cfg"; done | unique_lines
  )

  if [ "${#configs[@]}" -eq 0 ]; then return 1; fi
  if [ "${#configs[@]}" -eq 1 ]; then
    printf '找到 SillyTavern：%s\n' "$(dirname "${configs[0]}")" >&2
    local yes=''
    if [ -r /dev/tty ]; then
      printf '使用这个目录？(Y/n) ' >/dev/tty
      read -r yes </dev/tty || yes=''
    else
      # 当前函数通常接在管道后面，stdin 已经是候选列表；没有 TTY 时默认使用唯一候选。
      yes=''
    fi
    if [ -z "$yes" ] || [[ "$yes" =~ ^[Yy] ]]; then
      printf '%s\n' "${configs[0]}"
      return 0
    fi
    return 1
  fi

  printf '\n找到多个候选 config.yaml：\n' >&2
  local i
  for ((i=0; i<${#configs[@]}; i++)); do
    printf '[%d] %s\n' "$((i+1))" "${configs[$i]}" >&2
  done
  local choice=''
  if [ -r /dev/tty ]; then
    printf '请输入编号，或直接回车取消: ' >/dev/tty
    read -r choice </dev/tty || choice=''
  else
    say_warn '当前终端无法读取交互输入，请改用“手动输入 config.yaml 路径”。' >&2
    return 1
  fi
  [ -n "$choice" ] || return 1
  if ! [[ "$choice" =~ ^[0-9]+$ ]]; then return 1; fi
  local index=$((choice-1))
  if [ "$index" -lt 0 ] || [ "$index" -ge "${#configs[@]}" ]; then return 1; fi
  printf '%s\n' "${configs[$index]}"
}

auto_locate_config() {
  say_title '自动定位 SillyTavern/config.yaml'
  say_info '优先从正在运行的 SillyTavern 进程中提取路径...'
  local chosen
  chosen="$(find_configs_from_processes | select_config_from_list || true)"
  if [ -n "$chosen" ]; then set_selected_config "$chosen"; return; fi

  say_warn '进程探测未定位到可用的 SillyTavern/config.yaml。'
  local scan_confirm
  read -r -p '是否继续扫描常见目录？可能需要一些时间。(y/N) ' scan_confirm
  if ! [[ "$scan_confirm" =~ ^[Yy] ]]; then
    say_warn '已跳过文件扫描。你可以选择“手动输入 config.yaml 路径”。'
    return
  fi
  say_info '开始扫描常见目录（可能需要一些时间）...'
  chosen="$(find_configs_by_scan | select_config_from_list || true)"
  if [ -n "$chosen" ]; then set_selected_config "$chosen"; return; fi

  say_warn '没有自动找到 SillyTavern/config.yaml。'
}

manual_config_input() {
  say_title '手动输入 config.yaml 路径'
  printf '请输入 SillyTavern 的 config.yaml 路径。也可以输入 SillyTavern 文件夹，脚本会自动补 config.yaml。\n'
  read -r -p '路径: ' input_path
  [ -n "$input_path" ] || return 0
  input_path="${input_path%\"}"; input_path="${input_path#\"}"
  set_selected_config "$input_path"
}

ensure_config_selected() {
  if [ -n "$SELECTED_CONFIG" ] && test_sillytavern_config "$SELECTED_CONFIG"; then return 0; fi
  auto_locate_config
  if [ -z "$SELECTED_CONFIG" ]; then manual_config_input; fi
  if [ -z "$SELECTED_CONFIG" ]; then
    say_warn '未选择 SillyTavern/config.yaml'
    return 1
  fi
}

backup_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  local backup="$file.cocktail-plus.bak.$(date +%Y%m%d_%H%M%S)"
  cp -p "$file" "$backup"
  printf '%s\n' "$backup"
}

set_config_bool() {
  local cfg="$1" key="$2" value="$3"
  [ -f "$cfg" ] || { say_warn "配置文件不存在：$cfg"; return 1; }
  local backup tmp
  backup="$(backup_file "$cfg")"
  tmp="$(mktemp)"
  if grep -Eq "^[[:space:]]*${key}[[:space:]]*:" "$cfg"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*" key "[[:space:]]*:" && done == 0 { print key ": " value; done=1; next }
      { print }
    ' "$cfg" > "$tmp"
  else
    cat "$cfg" > "$tmp"
    printf '\n%s: %s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$cfg"
  [ -n "$backup" ] && printf '已备份配置：%s\n' "$backup"
  say_ok "$key 已设置为 $value"
}

get_config_scalar() {
  local cfg="$1" key="$2" default_value="$3"
  local line value
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*:" "$cfg" | tail -n 1 || true)"
  if [ -z "$line" ]; then printf '%s\n' "$default_value"; return; fi
  value="${line#*:}"
  value="${value%%#*}"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')"
  [ -n "$value" ] && printf '%s\n' "$value" || printf '%s\n' "$default_value"
}

resolve_data_root() {
  local root="$1" cfg="$2" value
  value="$(get_config_scalar "$cfg" dataRoot './data')"
  case "$value" in
    /*) abs_path "$value" ;;
    ~*) eval "abs_path $value" ;;
    *) abs_path "$root/$value" ;;
  esac
}

find_frontend_backend_source() {
  local root="$1" cfg="$2" data_root candidate candidate_root root_cfg script_backend

  local candidates=()

  # If this helper itself is running from a bundled backend directory, use it first.
  # This covers direct execution from:
  #   .../extensions/cocktail-plus/server-plugins/cocktail-plus/scripts/cocktail-plus-helper.sh
  # and also helps Termux/proot users whose SillyTavern root is hard to infer.
  if [ -n "$SCRIPT_DIR" ]; then
    script_backend="$(abs_path "$SCRIPT_DIR/..")"
    candidates+=("$script_backend")
  fi

  while IFS= read -r candidate_root; do
    [ -n "$candidate_root" ] || continue
    [ -d "$candidate_root" ] || continue

    root_cfg="$cfg"
    [ -f "$candidate_root/config.yaml" ] && root_cfg="$candidate_root/config.yaml"
    data_root="$(resolve_data_root "$candidate_root" "$root_cfg")"

    candidates+=("$candidate_root/public/scripts/extensions/third-party/$PLUGIN_ID/server-plugins/$PLUGIN_ID")
    candidates+=("$data_root/default-user/extensions/$PLUGIN_ID/server-plugins/$PLUGIN_ID")

    if [ -d "$data_root" ]; then
      while IFS= read -r user_dir; do
        candidates+=("$user_dir/extensions/$PLUGIN_ID/server-plugins/$PLUGIN_ID")
      done < <(find "$data_root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
    fi
  done < <(candidate_sillytavern_roots "$root")

  while IFS= read -r candidate; do
    if [ -d "$candidate" ] && [ -f "$candidate/index.mjs" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(printf '%s\n' "${candidates[@]}" | unique_lines)

  say_warn '已尝试以下前端内置后端插件路径：' >&2
  printf '%s\n' "${candidates[@]}" | unique_lines | while IFS= read -r candidate; do printf -- '- %s\n' "$candidate" >&2; done
  return 1
}

test_frontend_plugin_source() {
  local dir="$1"
  [ -n "$dir" ] || return 1
  [ -f "$dir/manifest.json" ] || return 1
  [ -f "$dir/dist/index.js" ] || return 1
  [ -f "$dir/server-plugins/$PLUGIN_ID/index.mjs" ] || return 1
}

find_bundled_frontend_source() {
  local candidates=() dir parent data_root candidate
  if [ -n "$SCRIPT_DIR" ]; then
    dir="$(abs_path "$SCRIPT_DIR")"
    for _ in 1 2 3 4 5 6 7 8; do
      candidates+=("$dir")
      parent="$(dirname "$dir")"
      [ "$parent" = "$dir" ] && break
      dir="$parent"
    done
  fi
  [ -n "$SELECTED_ROOT" ] && candidates+=("$SELECTED_ROOT/public/scripts/extensions/third-party/$PLUGIN_ID")
  if [ -n "$SELECTED_CONFIG" ]; then
    data_root="$(resolve_data_root "$SELECTED_ROOT" "$SELECTED_CONFIG")"
    candidates+=("$data_root/default-user/extensions/$PLUGIN_ID")
    if [ -d "$data_root" ]; then
      while IFS= read -r user_dir; do
        candidates+=("$user_dir/extensions/$PLUGIN_ID")
      done < <(find "$data_root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
    fi
  fi
  while IFS= read -r candidate; do
    if test_frontend_plugin_source "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(printf '%s\n' "${candidates[@]}" | unique_lines)
  return 1
}

copy_frontend_dir_contents() {
  local source="$1" target="$2"
  mkdir -p "$target"
  (cd "$source" && tar --exclude='node_modules' --exclude='.deploy-backups' -cf - .) | (cd "$target" && tar -xf -)
}

install_frontend_extension() {
  ensure_config_selected || return 1
  say_title '安装前端扩展'
  printf '[1] 给所有人安装（public/scripts/extensions/third-party）\n'
  printf '[2] 给某个用户安装（data/<账号>/extensions）\n'
  printf '[0] 返回\n'
  local scope target user_name data_root replace tmp source cleanup_tmp backup_root backup
  read -r -p '请选择安装范围: ' scope
  case "$scope" in
    0) return 0 ;;
    1) target="$SELECTED_ROOT/public/scripts/extensions/third-party/$PLUGIN_ID" ;;
    2)
      read -r -p '请输入账号（例如 default-user）: ' user_name
      user_name="${user_name%\"}"; user_name="${user_name#\"}"
      user_name="$(printf '%s' "$user_name" | sed -E "s/^[[:space:]]+|[[:space:]]+$//g; s/^'//; s/'$//")"
      if [ -z "$user_name" ]; then say_warn '账号不能为空。'; return 0; fi
      data_root="$(resolve_data_root "$SELECTED_ROOT" "$SELECTED_CONFIG")"
      target="$data_root/$user_name/extensions/$PLUGIN_ID"
      ;;
    *) say_warn '无效选项。'; return 0 ;;
  esac

  printf '目标目录：%s\n' "$target"
  if [ -e "$target" ]; then
    read -r -p '检测到已存在同名文件夹，是否替换？(y/N) ' replace
    if ! [[ "$replace" =~ ^[Yy] ]]; then say_warn '已取消'; return 0; fi
  fi

  tmp="${TMPDIR:-/tmp}/cocktail-plus-frontend-$(date +%Y%m%d_%H%M%S)"
  cleanup_tmp=""
  if source="$(clone_cocktail_plus_repo_root "$tmp" 2>/dev/null)"; then
    cleanup_tmp="$tmp"
  else
    say_warn '从 GitHub/Gitee 下载前端扩展失败。'
    if ! source="$(find_bundled_frontend_source)"; then
      say_warn '找不到可用的前端扩展源目录。请确认已安装前端扩展，或安装 Git 后重试。'
      rm -rf "$tmp"
      return 1
    fi
    rm -rf "$tmp"
    say_info "使用本地前端扩展源：$source"
  fi

  if [ "$(abs_path "$source")" = "$(abs_path "$target")" ]; then
    say_warn '源目录和目标目录相同，无法替换自身。请安装 Git 后从远端安装，或选择另一份源。'
    [ -n "$cleanup_tmp" ] && rm -rf "$cleanup_tmp"
    return 1
  fi

  mkdir -p "$(dirname "$target")"
  if [ -e "$target" ]; then
    backup_root="$(dirname "$target")/.cocktail-plus-backups"
    mkdir -p "$backup_root"
    backup="$backup_root/$PLUGIN_ID-frontend-$(date +%Y%m%d_%H%M%S)"
    mv "$target" "$backup"
    printf '已备份旧前端扩展：%s\n' "$backup"
  fi

  copy_frontend_dir_contents "$source" "$target"
  [ -n "$cleanup_tmp" ] && rm -rf "$cleanup_tmp"
  say_ok "前端扩展已安装到：$target"
  say_warn '请刷新浏览器页面。若扩展列表仍旧，尝试 Ctrl+F5 或清理浏览器缓存。'
}

remove_frontend_extension() {
  ensure_config_selected || return 1
  say_title '卸载前端扩展'
  printf '[1] 卸载给所有人的扩展（public/scripts/extensions/third-party）\n'
  printf '[2] 卸载某个用户的扩展（data/<账号>/extensions）\n'
  printf '[0] 返回\n'
  local scope target user_name data_root confirm
  read -r -p '请选择卸载范围: ' scope
  case "$scope" in
    0) return 0 ;;
    1) target="$SELECTED_ROOT/public/scripts/extensions/third-party/$PLUGIN_ID" ;;
    2)
      read -r -p '请输入账号（例如 default-user）: ' user_name
      user_name="${user_name%\"}"; user_name="${user_name#\"}"
      user_name="$(printf '%s' "$user_name" | sed -E "s/^[[:space:]]+|[[:space:]]+$//g; s/^'//; s/'$//")"
      if [ -z "$user_name" ]; then say_warn '账号不能为空。'; return 0; fi
      data_root="$(resolve_data_root "$SELECTED_ROOT" "$SELECTED_CONFIG")"
      target="$data_root/$user_name/extensions/$PLUGIN_ID"
      ;;
    *) say_warn '无效选项。'; return 0 ;;
  esac

  printf '目标目录：%s\n' "$target"
  if [ ! -e "$target" ]; then
    say_warn "前端扩展不存在：$target"
    return 0
  fi

  read -r -p "确认删除 $target ? (y/N) " confirm
  if ! [[ "$confirm" =~ ^[Yy] ]]; then say_warn '已取消'; return 0; fi

  rm -rf -- "$target"
  say_ok '前端扩展已删除。'
  say_warn '请刷新浏览器页面。若扩展列表仍旧，尝试 Ctrl+F5 或清理浏览器缓存。'
}

install_backend_plugin() {
  ensure_config_selected || return 1
  say_title '安装后端扩展'
  local src plugins_dir dst backup_dir backup tmp cleanup_tmp
  cleanup_tmp=""
  warn_termux_environment_aliases "$SELECTED_ROOT"
  if ! src="$(find_frontend_backend_source "$SELECTED_ROOT" "$SELECTED_CONFIG")"; then
    say_warn '未找到前端扩展内置的后端插件目录。'
    say_info '将尝试直接从 GitHub/Gitee 下载 cocktail-plus 仓库并安装后端插件...'
    tmp="${TMPDIR:-/tmp}/cocktail-plus-repo-install-$(date +%Y%m%d_%H%M%S)"
    src="$(clone_cocktail_plus_repo "$tmp")" || { rm -rf "$tmp"; say_warn 'GitHub/Gitee 仓库下载均失败。'; return 1; }
    cleanup_tmp="$tmp"
  fi
  plugins_dir="$SELECTED_ROOT/plugins"
  dst="$plugins_dir/$PLUGIN_ID"
  mkdir -p "$plugins_dir"

  if [ -e "$dst" ]; then
    backup_dir="$plugins_dir/.cocktail-plus-backups"
    mkdir -p "$backup_dir"
    backup="$backup_dir/$PLUGIN_ID-$(date +%Y%m%d_%H%M%S)"
    mv "$dst" "$backup"
    printf '已备份旧后端插件：%s\n' "$backup"
  fi

  cp -R "$src" "$dst"
  [ -n "$cleanup_tmp" ] && rm -rf "$cleanup_tmp"
  set_config_bool "$SELECTED_CONFIG" enableServerPlugins true
  say_ok "后端插件已安装到：$dst"
  say_warn '请重启 SillyTavern 后生效。'
}

restore_cocktail_plus_index_html() {
  local no_backup="${1:-}"
  ensure_config_selected || return 1
  local index_path="$SELECTED_ROOT/public/index.html"
  if [ ! -f "$index_path" ]; then
    say_warn "index.html 不存在，跳过恢复：$index_path"
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    say_warn '找不到 node，无法自动恢复 index.html。请手动删除 cocktail-plus early bridge 注入块。'
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  node - "$index_path" "$tmp" <<'NODE'
const fs = require('fs');
const [indexPath, tmpPath] = process.argv.slice(2);
const markerStart = '<!-- cocktail-plus early bridge start -->';
const markerEnd = '<!-- cocktail-plus early bridge end -->';
function escRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
let html = fs.readFileSync(indexPath, 'utf8');
const originalHtml = html;
html = html.replace(new RegExp('\\s*' + escRegExp(markerStart) + '[\\s\\S]*?' + escRegExp(markerEnd) + '\\s*', 'g'), '\n');
html = html.replace(/<script\b[^>]*\bid=["']cocktail-plus-module-import-map["'][\s\S]*?<\/script>\s*/gi, '');
html = html.replace(/<script\b[^>]*\bid=["']cocktail-plus-early-bridge["'][\s\S]*?<\/script>\s*/gi, '');
html = html.replace(/^(?<indent>[ \t]*)<script\b[^>]*\bdata-cp-module-proxy-original=["'](?<orig>[^"']+)["'][^>]*>\s*<\/script>[ \t]*(?:\r?\n)?/gim, (match, _indentArg, _origArg, _offset, _str, groups) => {
  const indent = groups?.indent || '';
  const orig = String(groups?.orig || '').replace(/^\//, '');
  return `${indent}<script type="module" src="${orig}"></script>\n`;
});
const hasScriptJs = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/?script\.js["'])[^>]*>\s*<\/script>/i.test(html);
if (!hasScriptJs) {
  html = html.replace(/^(?<indent>[ \t]*)<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']scripts\/i18n\.js["'])[^>]*>\s*<\/script>[ \t]*(?:\r?\n)?/im, (match, _indentArg, _offset, _str, groups) => {
    const indent = groups?.indent || '';
    return `${match.trimEnd()}\n${indent}<script type="module" src="script.js"></script>\n`;
  });
}
let seenScriptJs = false;
html = html.replace(/^(?<line>[ \t]*<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/?script\.js["'])[^>]*>\s*<\/script>)\s*$/gim, (match, _lineArg, _offset, _str, groups) => {
  if (seenScriptJs) return '';
  seenScriptJs = true;
  return groups?.line || match;
});
html = html.replace(/\n{3,}/g, '\n\n');
if (html === originalHtml) process.exit(2);
fs.writeFileSync(tmpPath, html, 'utf8');
NODE
  local rc=$?
  if [ "$rc" -eq 2 ]; then
    rm -f "$tmp"
    say_warn 'index.html 未发现 cocktail-plus 注入或 module proxy 改写。'
    return 0
  fi
  if [ "$rc" -ne 0 ]; then
    rm -f "$tmp"
    say_warn '恢复 index.html 失败。'
    return 1
  fi

  local backup=""
  if [ "$no_backup" != "--no-backup" ]; then
    backup="$(backup_file "$index_path")"
  fi
  mv "$tmp" "$index_path"
  [ -n "$backup" ] && printf '已备份 index.html：%s\n' "$backup"
  say_ok 'index.html 已恢复，cocktail-plus Early Bridge 注入已移除。'
}

repair_backend_uninstall_black_screen() {
  ensure_config_selected || return 1
  say_title '修复卸载后端扩展后启动立马黑屏问题'
  restore_cocktail_plus_index_html --no-backup
  say_ok '已直接修复 index.html：移除 Early Bridge 注入，并恢复 i18n.js/script.js module 脚本。'
}


remove_backend_plugin() {
  ensure_config_selected || return 1
  say_title '删除后端扩展'
  local dst="$SELECTED_ROOT/plugins/$PLUGIN_ID"
  if [ ! -e "$dst" ]; then say_warn "后端插件不存在：$dst"; return 0; fi
  read -r -p "确认删除 $dst ? (y/N) " confirm
  if ! [[ "$confirm" =~ ^[Yy] ]]; then say_warn '已取消'; return 0; fi
  restore_cocktail_plus_index_html || true
  rm -rf "$dst"
  say_ok '后端插件已删除。'
  say_warn '请重启 SillyTavern 后生效。'
}

patch_sillytavern_chats_enoent() {
  local action="$1"
  ensure_config_selected || return 1
  local chats_path="$SELECTED_ROOT/src/endpoints/chats.js"
  if [ ! -f "$chats_path" ]; then say_warn "找不到 chats.js：$chats_path"; return 1; fi
  if ! command -v node >/dev/null 2>&1; then say_warn '找不到 node，无法自动处理 chats.js。'; return 1; fi
  node - "$SELECTED_ROOT" "$action" <<'NODE'
const fs = require('fs');
const path = require('path');
const [root, action] = process.argv.slice(2);
const file = path.join(root, 'src', 'endpoints', 'chats.js');
if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
const originalStat = '        const stats = await fs.promises.stat(pathToFile);';
const patchedStat = `        let stats;
        try {
            stats = await fs.promises.stat(pathToFile);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file no longer exists, skipping: \${pathToFile}\`);
                res({});
                return;
            }
            console.warn('Failed to stat chat file:', pathToFile, error);
            res({});
            return;
        }`;
const originalStream = `        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({`;
const patchedStream = `        const fileStream = fs.createReadStream(pathToFile);
        fileStream.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file disappeared while reading, skipping: \${pathToFile}\`);
            } else {
                console.warn('Failed to read chat file:', pathToFile, error);
            }
            res({});
        });
        const rl = readline.createInterface({`;
let text = fs.readFileSync(file, 'utf8');
const before = text;
if (action === 'apply') {
  if (!text.includes('Chat file no longer exists, skipping')) {
    if (!text.includes(originalStat)) throw new Error('stat patch point not found');
    text = text.replace(originalStat, patchedStat);
  }
  if (!text.includes('Chat file disappeared while reading')) {
    if (!text.includes(originalStream)) throw new Error('stream patch point not found');
    text = text.replace(originalStream, patchedStream);
  }
} else if (action === 'revert') {
  text = text.replace(patchedStat, originalStat);
  text = text.replace(/        const fileStream = fs\.createReadStream\(pathToFile\);\r?\n        fileStream\.on\('error', \(error\) => \{[\s\S]*?\r?\n        \}\);\r?\n        const rl = readline\.createInterface\(\{/, originalStream);
} else {
  throw new Error('unknown action: ' + action);
}
if (text === before) {
  console.log(action === 'apply' ? '补丁已存在。' : '未发现补丁，无需恢复。');
} else {
  fs.writeFileSync(file, text, 'utf8');
  console.log((action === 'apply' ? '已应用补丁：' : '已恢复补丁：') + file);
}
NODE
  local rc=$?
  [ "$rc" -eq 0 ] && say_warn '请重启 SillyTavern 后生效。'
  return "$rc"
}

source_patch_menu() {
  ensure_config_selected || return 1
  say_title 'SillyTavern 聊天文件 ENOENT 崩溃补丁'
  printf '[1] 应用补丁\n'
  printf '[2] 恢复补丁\n'
  printf '[0] 返回\n'
  local choice
  read -r -p '请选择: ' choice
  case "$choice" in
    1) patch_sillytavern_chats_enoent apply ;;
    2) patch_sillytavern_chats_enoent revert ;;
    0) return 0 ;;
    *) say_warn '无效选项。' ;;
  esac
}



backend_plugin_dir() {
  ensure_config_selected || return 1
  printf '%s\n' "$SELECTED_ROOT/plugins/$PLUGIN_ID"
}

backend_config_path() {
  local dir
  dir="$(backend_plugin_dir)" || return 1
  printf '%s/config.json\n' "$dir"
}

maintain_backend_config() {
  ensure_config_selected || return 1
  local plugin_dir cfg
  plugin_dir="$(backend_plugin_dir)" || return 1
  cfg="$plugin_dir/config.json"
  if [ ! -d "$plugin_dir" ]; then
    say_warn "后端插件目录不存在，请先安装后端扩展：$plugin_dir"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    say_warn '找不到 node，无法进入配置维护。'
    return 1
  fi

  node - "$cfg" <<'NODE'
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const configPath = process.argv[2];
const schema = [
  ['enabled', '启用后端加速', 'bool', true],
  ['serviceWorkerEnabled', '允许提供 Service Worker', 'bool', true],
  ['cacheCharactersAll', '缓存 characters/all', 'bool', true],
  ['cacheVersion', '缓存 /version', 'bool', true],
  ['staleWhileRevalidate', '允许 stale-while-revalidate', 'bool', true],
  ['maxStaleMs', '最大 stale 时间(ms)', 'int', 600000, 0, 86400000],
  ['shallowCharactersAll', 'characters/all 返回浅层角色列表', 'bool', true],
  ['diskCacheCharactersAll', 'characters/all 磁盘缓存', 'bool', true],
  ['diskCacheVersion', '/version 磁盘缓存', 'bool', true],
  ['fastVersionOnMiss', '/version 无缓存快速响应', 'bool', true],
  ['asyncCharactersAllOnMiss', '无 characters 缓存先返回空列表并后台构建', 'bool', true],
  ['earlyBridgeEnabled', '启用 Early Bridge 脚本', 'bool', true],
  ['autoInstallEarlyBridge', '后端启动时自动注入 Early Bridge', 'bool', true],
  ['earlyBridgePatchFetch', 'Early Bridge patch fetch', 'bool', true],
  ['optimizeSettingsGet', '优化 /api/settings/get 下载', 'bool', true],
  ['cacheSettingsGet', '缓存 settings/get 响应', 'bool', true],
  ['optimizeSettingsSave', '优化 /api/settings/save 上传', 'bool', true],
  ['settingsSaveNoopEnabled', 'settings/save 启用 no-op hash', 'bool', true],
  ['settingsSavePatchEnabled', 'settings/save 启用 JSON patch', 'bool', true],
  ['settingsSaveMaxPatchOperations', 'settings patch 最大操作数', 'int', 2000, 1, 100000],
  ['settingsSaveMaxPatchBytesRatio', 'settings patch/full 比例阈值', 'number', 0.85, 0.05, 2],
  ['optimizeChatSave', '优化 /api/chats/save 上传', 'bool', true],
  ['chatSaveNoopEnabled', 'chat/save 启用 no-op hash', 'bool', true],
  ['chatSavePatchEnabled', 'chat/save 启用聊天 patch', 'bool', true],
  ['chatSaveMaxPatchOperations', 'chat patch 最大操作数', 'int', 5000, 1, 100000],
  ['chatSaveMaxPatchBytesRatio', 'chat patch/full 比例阈值', 'number', 0.85, 0.05, 2],
  ['chatSaveCacheMaxEntries', 'chat 后端缓存条目', 'int', 64, 0, 1024],
  ['templatePreloadEnabled', '并行预取 scripts/templates 模板', 'bool', true],
  ['startupPreloadEnabled', '提前预取 /version 响应', 'bool', true],
  ['serviceWorkerFastRouteFallback', 'SW 兜底 /version 与 characters/all', 'bool', false],
  ['serviceWorkerSettingsGetFallback', 'SW 兜底 settings/get', 'bool', false],
  ['serviceWorkerSettingsSaveFallback', 'SW 兜底 settings/save', 'bool', false],
  ['serviceWorkerChatSaveFallback', 'SW 兜底 chat/save', 'bool', false],
  ['serviceWorkerTemplateFallback', 'SW 兜底模板缓存', 'bool', false],
  ['moduleProxyEnabled', '模块代理替换酒馆串行代码', 'bool', true],
  ['patchStartupInit', '替换 firstLoadInit 串行等待', 'bool', true],
  ['patchI18nInit', '替换 initLocales 串行等待', 'bool', true],
  ['patchSystemMessagesInit', '替换 initSystemMessages 模板串行', 'bool', true],
  ['patchExtensionManifests', '替换 getManifests 使用预取结果', 'bool', true],
  ['patchParallelActivateExtensions', '并行激活扩展（实验）', 'bool', true],
  ['autoPatchChatsEnoentGuard', '启动时自动写入 ST chats.js ENOENT 防崩补丁', 'bool', false],
];
const defaults = Object.fromEntries(schema.map(([k, _label, _type, def]) => [k, def]));
function readConfig() {
  let data = { ...defaults };
  try {
    if (fs.existsSync(configPath)) data = { ...data, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (e) {
    console.warn('读取 config.json 失败，将使用默认值：' + (e && e.message || e));
  }
  return data;
}
function backupFile(file) {
  if (!fs.existsSync(file)) return '';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${file}.cocktail-plus.bak.${stamp}`;
  fs.copyFileSync(file, backup);
  return backup;
}
function writeConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const backup = backupFile(configPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
  if (backup) console.log('已备份后端配置：' + backup);
  console.log('已写入后端配置：' + configPath);
}
function clamp(value, min, max) {
  let n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Number.isFinite(min)) n = Math.max(min, n);
  if (Number.isFinite(max)) n = Math.min(max, n);
  return n;
}
(async () => {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const config = readConfig();
      console.log('\n修改 cocktail-plus 后端插件配置项');
      console.log('配置文件：' + configPath);
      schema.forEach((item, index) => {
        const [key, label] = item;
        console.log(`[${index + 1}] ${key} = ${config[key]}  - ${label}`);
      });
      console.log('[r] 重置为默认推荐配置');
      console.log('[0] 返回');
      const choice = (await rl.question('请选择要修改的配置项: ')).trim();
      if (choice === '0') break;
      if (choice.toLowerCase() === 'r') {
        const ok = (await rl.question('确认重置 config.json 为默认推荐配置？(y/N) ')).trim().toLowerCase();
        if (ok === 'y' || ok === 'yes') writeConfig({ ...defaults });
        continue;
      }
      const idx = Number(choice) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= schema.length) {
        console.log('无效选项');
        continue;
      }
      const [key, label, type, _def, min, max] = schema[idx];
      if (type === 'bool') {
        const raw = (await rl.question(`${label} 当前=${config[key]}。输入 true/false，直接回车则切换: `)).trim().toLowerCase();
        config[key] = raw ? ['1', 'true', 'yes', 'y', 'on'].includes(raw) : !Boolean(config[key]);
      } else {
        const raw = (await rl.question(`${label} 当前=${config[key]}。输入新数值，直接回车取消: `)).trim();
        if (!raw) continue;
        let n = clamp(raw, min, max);
        if (n === null) { console.log('无效数值'); continue; }
        if (type === 'int') n = Math.trunc(n);
        config[key] = n;
      }
      writeConfig(config);
      console.log('配置更改通常需要重启 SillyTavern 后生效。');
    }
  } finally {
    rl.close();
  }
})();
NODE
}

sillytavern_port() {
  local port
  port="$(get_config_scalar "$SELECTED_CONFIG" port 8000)"
  if [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -gt 0 ] && [ "$port" -le 65535 ]; then
    printf '%s\n' "$port"
  else
    printf '8000\n'
  fi
}

descendant_pids() {
  local parent="$1" child
  if command -v pgrep >/dev/null 2>&1; then
    for child in $(pgrep -P "$parent" 2>/dev/null || true); do
      printf '%s\n' "$child"
      descendant_pids "$child"
    done
  fi
}

list_port_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | awk 'NF' || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p { print $0 }' | grep -Eo 'pid=[0-9]+' | cut -d= -f2 || true
  fi
}

find_sillytavern_pids_for_root() {
  ensure_config_selected || return 1
  local root_real pid args cwd port
  root_real="$(cd "$SELECTED_ROOT" 2>/dev/null && pwd -P || printf '%s' "$SELECTED_ROOT")"
  port="$(sillytavern_port)"
  {
    while IFS= read -r line; do
      pid="${line%% *}"
      args="${line#* }"
      [ "$pid" = "$$" ] && continue
      case "$args" in
        *server.js*|*SillyTavern*|*node*) ;;
        *) continue ;;
      esac
      if [ -e "/proc/$pid/cwd" ]; then
        cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
        if [ "$cwd" = "$root_real" ]; then
          printf '%s\n' "$pid"
          descendant_pids "$pid"
          continue
        fi
      fi
      case "$args" in
        *"$root_real"*) printf '%s\n' "$pid"; descendant_pids "$pid" ;;
      esac
    done < <(ps -eo pid=,args= 2>/dev/null || true)
    list_port_pids "$port"
  } | awk -v self="$$" 'NF && $0 != self && !seen[$0]++'
}

read_backend_version() {
  local dir="$1" file text
  if [ -f "$dir/version.json" ]; then
    local version_json
    version_json="$(node - "$dir/version.json" <<'NODE' 2>/dev/null || true
const fs = require('fs');
try { const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); if (data.version) console.log(String(data.version).trim()); } catch {}
NODE
)"
    [ -n "$version_json" ] && printf '%s\n' "$version_json" && return 0
  fi
  for file in "$dir/src/constants.ts" "$dir/index.mjs"; do
    [ -f "$file" ] || continue
    text="$(grep -E "VERSION[[:space:]]*=[[:space:]]*['\"][^'\"]+['\"]" "$file" | head -n 1 || true)"
    if [ -n "$text" ]; then
      printf '%s\n' "$text" | sed -E "s/.*VERSION[[:space:]]*=[[:space:]]*['\"]([^'\"]+)['\"].*/\1/"
      return 0
    fi
  done
  return 1
}

read_manifest_version() {
  local manifest="$1"
  [ -f "$manifest" ] || return 1
  node - "$manifest" <<'NODE'
const fs = require('fs');
try {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (manifest.version) console.log(String(manifest.version).trim());
} catch {}
NODE
}

compare_versions() {
  node - "$1" "$2" <<'NODE'
const [a, b] = process.argv.slice(2);
function parse(v) {
  const m = String(v || '').trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)] : null;
}
const av = parse(a); const bv = parse(b);
let out = 0;
if (av && bv) {
  for (let i = 0; i < 3; i++) {
    if (av[i] > bv[i]) { out = 1; break; }
    if (av[i] < bv[i]) { out = -1; break; }
  }
}
console.log(out);
NODE
}

helper_bundled_backend_dir() {
  local script_dir backend_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P || true)"
  [ -n "$script_dir" ] || return 1
  backend_dir="$(dirname "$script_dir")"
  if [ -d "$backend_dir" ] && [ -f "$backend_dir/index.mjs" ]; then
    printf '%s\n' "$backend_dir"
    return 0
  fi
  return 1
}

backend_update_current_dir() {
  if [ -n "$SELECTED_ROOT" ] && [ -d "$SELECTED_ROOT/plugins/$PLUGIN_ID" ]; then
    printf '%s\n' "$SELECTED_ROOT/plugins/$PLUGIN_ID"
    return 0
  fi

  local configs=() cfg root installed
  while IFS= read -r cfg; do
    [ -n "$cfg" ] && configs+=("$cfg")
  done < <(find_configs_from_processes | unique_lines)
  if [ "${#configs[@]}" -eq 1 ]; then
    root="$(dirname "${configs[0]}")"
    installed="$root/plugins/$PLUGIN_ID"
    if [ -d "$installed" ]; then
      printf '%s\n' "$installed"
      return 0
    fi
  fi

  helper_bundled_backend_dir
}

fetch_manifest_json() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 8 "$url" 2>/dev/null && return 0
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=8 "$url" 2>/dev/null && return 0
  fi
  return 1
}

extract_manifest_version() {
  sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1
}

start_backend_update_check() {
  BACKEND_UPDATE_NOTICE_CURRENT=""
  BACKEND_UPDATE_NOTICE_REMOTE=""
  BACKEND_UPDATE_NOTICE_SOURCE=""
  if [ -n "$BACKEND_UPDATE_CHECK_PID" ] && kill -0 "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null; then
    kill "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null || true
  fi
  BACKEND_UPDATE_CHECK_PID=""
  BACKEND_UPDATE_CHECK_STARTED_AT=""

  local current_dir current_version
  current_dir="$(backend_update_current_dir 2>/dev/null || true)"
  [ -n "$current_dir" ] || return 0
  current_version="$(read_backend_version "$current_dir" 2>/dev/null || true)"
  [ -n "$current_version" ] || return 0

  BACKEND_UPDATE_NOTICE_FILE="${TMPDIR:-/tmp}/cocktail-plus-update-check-$$.txt"
  rm -f "$BACKEND_UPDATE_NOTICE_FILE"
  (
    local name url manifest remote_version cmp
    while IFS='|' read -r name url; do
      [ -n "$name" ] || continue
      manifest="$(fetch_manifest_json "$url" || true)"
      remote_version="$(printf '%s' "$manifest" | extract_manifest_version)"
      [ -n "$remote_version" ] || continue
      cmp="$(compare_versions "$current_version" "$remote_version" 2>/dev/null || printf '0')"
      if [ "$cmp" -lt 0 ] 2>/dev/null; then
        printf '%s\t%s\t%s\n' "$current_version" "$remote_version" "$name" > "$BACKEND_UPDATE_NOTICE_FILE"
      fi
      exit 0
    done <<'EOF'
GitHub|https://raw.githubusercontent.com/Lianues/cocktail-plus/main/server-plugins/cocktail-plus/version.json
Gitee|https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json
EOF
  ) >/dev/null 2>&1 &
  BACKEND_UPDATE_CHECK_PID="$!"
  BACKEND_UPDATE_CHECK_STARTED_AT="$(date +%s)"
}

receive_backend_update_check() {
  [ -n "$BACKEND_UPDATE_CHECK_PID" ] || return 0
  if kill -0 "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null; then
    local now
    now="$(date +%s)"
    if [ -n "$BACKEND_UPDATE_CHECK_STARTED_AT" ] && [ $((now - BACKEND_UPDATE_CHECK_STARTED_AT)) -gt 30 ] 2>/dev/null; then
      kill "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null || true
      BACKEND_UPDATE_CHECK_PID=""
      BACKEND_UPDATE_CHECK_STARTED_AT=""
    fi
    return 0
  fi
  wait "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null || true
  BACKEND_UPDATE_CHECK_PID=""
  BACKEND_UPDATE_CHECK_STARTED_AT=""
  if [ -n "$BACKEND_UPDATE_NOTICE_FILE" ] && [ -f "$BACKEND_UPDATE_NOTICE_FILE" ]; then
    IFS=$'\t' read -r BACKEND_UPDATE_NOTICE_CURRENT BACKEND_UPDATE_NOTICE_REMOTE BACKEND_UPDATE_NOTICE_SOURCE < "$BACKEND_UPDATE_NOTICE_FILE" || true
    rm -f "$BACKEND_UPDATE_NOTICE_FILE"
  fi
}

show_backend_update_notice() {
  receive_backend_update_check
  [ -n "$BACKEND_UPDATE_NOTICE_REMOTE" ] || return 0
  printf '\n'
  say_warn "检测到 cocktail-plus 后端扩展更新：$BACKEND_UPDATE_NOTICE_CURRENT -> $BACKEND_UPDATE_NOTICE_REMOTE（$BACKEND_UPDATE_NOTICE_SOURCE）"
  say_warn '输入10更新 cocktail-plus 后端扩展；输入13可安装/重装前端扩展。'
}

clone_cocktail_plus_repo() {
  local tmp="$1"
  if ! command -v git >/dev/null 2>&1; then
    say_warn '找不到 git 命令。请安装 Git，或先通过前端扩展安装后再使用本脚本。'
    return 1
  fi
  local repos=(
    'https://github.com/Lianues/cocktail-plus.git'
    'https://gitee.com/lianues/cocktail-plus.git'
  )
  local repo
  for repo in "${repos[@]}"; do
    rm -rf "$tmp"
    say_info "下载仓库：$repo" >&2
    if git clone --depth 1 "$repo" "$tmp"; then
      if [ -f "$tmp/server-plugins/cocktail-plus/index.mjs" ]; then
        printf '%s/server-plugins/cocktail-plus\n' "$tmp"
        return 0
      fi
      say_warn "仓库内容不完整：$repo" >&2
    else
      say_warn "下载失败：$repo" >&2
    fi
  done
  return 1
}

clone_cocktail_plus_repo_root() {
  local tmp="$1"
  if ! command -v git >/dev/null 2>&1; then
    say_warn '找不到 git 命令。请安装 Git，或先通过前端扩展安装后再使用本脚本。'
    return 1
  fi
  local repos=(
    'https://github.com/Lianues/cocktail-plus.git'
    'https://gitee.com/lianues/cocktail-plus.git'
  )
  local repo
  for repo in "${repos[@]}"; do
    rm -rf "$tmp"
    say_info "下载仓库：$repo" >&2
    if git clone --depth 1 "$repo" "$tmp"; then
      if test_frontend_plugin_source "$tmp"; then
        printf '%s\n' "$tmp"
        return 0
      fi
      say_warn "仓库内容不完整：$repo" >&2
    else
      say_warn "下载失败：$repo" >&2
    fi
  done
  return 1
}

copy_dir_contents() {
  local source="$1" target="$2"
  mkdir -p "$target"
  (cd "$source" && tar --exclude='.git' --exclude='node_modules' --exclude='.deploy-backups' -cf - .) | (cd "$target" && tar -xf -)
}

update_backend_from_repository() {
  ensure_config_selected || return 1
  say_title '检查/更新 cocktail-plus 后端扩展'
  if [ -n "$BACKEND_UPDATE_CHECK_PID" ] && kill -0 "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null; then
    kill "$BACKEND_UPDATE_CHECK_PID" 2>/dev/null || true
  fi
  warn_termux_environment_aliases "$SELECTED_ROOT"
  BACKEND_UPDATE_CHECK_PID=""
  BACKEND_UPDATE_CHECK_STARTED_AT=""
  local target plugins_dir current tmp source remote_version cmp confirm backup_root backup item
  target="$SELECTED_ROOT/plugins/$PLUGIN_ID"
  plugins_dir="$SELECTED_ROOT/plugins"
  mkdir -p "$plugins_dir"
  current="$(read_backend_version "$target" 2>/dev/null || true)"
  tmp="${TMPDIR:-/tmp}/cocktail-plus-repo-$(date +%Y%m%d_%H%M%S)"
  source="$(clone_cocktail_plus_repo "$tmp")" || { rm -rf "$tmp"; say_warn 'GitHub/Gitee 仓库下载均失败。'; return 1; }
  remote_version="$(read_backend_version "$source" 2>/dev/null || true)"
  if [ ! -f "$source/version.json" ] && [ -n "$remote_version" ]; then
    node - "$source/version.json" "$remote_version" <<'NODE' 2>/dev/null || true
const fs = require('fs');
fs.writeFileSync(process.argv[2], JSON.stringify({ version: process.argv[3] }, null, 2) + '\n', 'utf8');
NODE
  fi

  printf '当前后端版本：%s\n' "${current:-未安装/未知}"
  printf '远端后端版本：%s\n' "${remote_version:-未知}"

  if [ -n "$current" ] && [ -n "$remote_version" ]; then
    cmp="$(compare_versions "$current" "$remote_version")"
    if [ "$cmp" -ge 0 ]; then
      read -r -p '当前后端看起来已是最新版本。是否仍然重新下载覆盖安装？(y/N) ' confirm
      if ! [[ "$confirm" =~ ^[Yy] ]]; then rm -rf "$tmp"; return 0; fi
    else
      read -r -p '是否下载并安装/更新后端扩展？(Y/n) ' confirm
      if [ -n "$confirm" ] && ! [[ "$confirm" =~ ^[Yy] ]]; then rm -rf "$tmp"; return 0; fi
    fi
  fi

  if [ -d "$target" ]; then
    for item in config.json cache; do
      [ -e "$target/$item" ] && cp -R "$target/$item" "$source/$item"
    done
    backup_root="$plugins_dir/.cocktail-plus-backups"
    mkdir -p "$backup_root"
    backup="$backup_root/$PLUGIN_ID-update-$(date +%Y%m%d_%H%M%S)"
    if mv "$target" "$backup"; then
      printf '已备份旧后端插件：%s\n' "$backup"
      copy_dir_contents "$source" "$target"
    else
      say_warn '备份旧目录失败，将尝试原地覆盖。'
      copy_dir_contents "$source" "$target"
    fi
  else
    copy_dir_contents "$source" "$target"
  fi

  rm -rf "$tmp"
  set_config_bool "$SELECTED_CONFIG" enableServerPlugins true
  say_ok "后端扩展已更新到：$target"
  BACKEND_UPDATE_NOTICE_CURRENT=""
  BACKEND_UPDATE_NOTICE_REMOTE=""
  BACKEND_UPDATE_NOTICE_SOURCE=""
  say_warn '请重启 SillyTavern 后生效。'
}

restart_sillytavern() {
  ensure_config_selected || return 1
  say_title '重启 SillyTavern'
  say_warn '将尝试启动一个新的 SillyTavern 进程，并停止当前匹配到的旧进程。不同启动方式下可能需要手动重启。'
  read -r -p '确认继续？(y/N) ' confirm
  if ! [[ "$confirm" =~ ^[Yy] ]]; then say_warn '已取消'; return 0; fi

  local root starter pids pid log_file
  root="$(cd "$SELECTED_ROOT" 2>/dev/null && pwd -P || printf '%s' "$SELECTED_ROOT")"
  starter="${TMPDIR:-/tmp}/cocktail-plus-restart-$(date +%Y%m%d_%H%M%S).sh"
  log_file="$root/cocktail-plus-restart.log"
  cat > "$starter" <<EOF
#!/usr/bin/env bash
sleep 2
cd "$(printf '%s' "$root" | sed 's/"/\\"/g')" || exit 1
if [ -x ./start.sh ]; then
  nohup bash ./start.sh > "$(printf '%s' "$log_file" | sed 's/"/\\"/g')" 2>&1 &
elif [ -f ./Start.sh ]; then
  nohup bash ./Start.sh > "$(printf '%s' "$log_file" | sed 's/"/\\"/g')" 2>&1 &
else
  nohup node server.js > "$(printf '%s' "$log_file" | sed 's/"/\\"/g')" 2>&1 &
fi
EOF
  chmod +x "$starter"
  "$starter" >/dev/null 2>&1 &
  say_ok "已安排 2 秒后重新启动 SillyTavern。日志：$log_file"

  pids="$(find_sillytavern_pids_for_root || true)"
  if [ -z "$pids" ]; then
    say_warn '未找到需要停止的旧 SillyTavern 进程；如果新进程端口冲突，请手动关闭旧进程。'
    return 0
  fi
  say_info "将停止以下旧进程 PID：$(printf '%s' "$pids" | tr '\n' ' ')"
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    if kill -TERM "$pid" 2>/dev/null; then
      printf '已发送终止信号 PID=%s\n' "$pid"
    else
      if kill -0 "$pid" 2>/dev/null; then
        say_warn "停止进程 PID=$pid 失败"
      fi
    fi
  done
  sleep 1
  local alive=()
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then continue; fi
    kill -KILL "$pid" 2>/dev/null || true
    if kill -0 "$pid" 2>/dev/null; then alive+=("$pid"); fi
  done
  if [ "${#alive[@]}" -gt 0 ]; then
    say_warn "仍检测到未退出 PID：${alive[*]}。如端口冲突，请手动关闭它们。"
  fi
}


show_current_selection() {
  say_title '当前选择'
  if [ -n "$SELECTED_CONFIG" ]; then
    printf 'SillyTavern: %s\n' "$SELECTED_ROOT"
    printf 'config.yaml: %s\n' "$SELECTED_CONFIG"
    printf 'dataRoot: %s\n' "$(resolve_data_root "$SELECTED_ROOT" "$SELECTED_CONFIG")"
  else
    say_warn '尚未选择 SillyTavern/config.yaml'
  fi
}

show_menu() {
  say_title 'cocktail-plus 后端插件助手'
  printf '\033[36m使用教程：\033[0m\n'
  printf '* 输入1或2 配置酒馆配置文件路径\n'
  printf '* 输入3安装 cocktail-plus 后端扩展\n'
  printf '\n'
  printf '如果需要卸载，则输入4\n'
  printf '\n'
  printf '如果需要修改配置，则输入8\n'
  printf '\n'
  printf '重启酒馆本体，输入9\n'
  printf '\n'
  printf '后端扩展和前端扩展更新是独立的，需要分别进行更新\n'
  printf '后端扩展更新输入10；前端扩展安装/重装输入13；卸载前端扩展输入14\n'
  show_backend_update_notice
  printf '\n'
  printf '[1] 自动探测 SillyTavern/config.yaml（酒馆配置文件）\n'
  printf '[2] 手动输入 SillyTavern/config.yaml（酒馆配置文件）路径\n'
  printf '[3] 安装/重新安装 cocktail-plus 后端扩展，会自动开启酒馆使用后端扩展权限\n'
  printf '[4] 卸载 cocktail-plus 后端扩展（恢复 index.html）\n'
  printf '[5] 修复卸载后端扩展后启动立马黑屏问题\n'
  printf '[6] 允许酒馆使用后端扩展\n'
  printf '[7] 禁止酒馆使用后端扩展\n'
  printf '[8] 修改 cocktail-plus 后端插件配置项\n'
  printf '[9] 重启 SillyTavern 酒馆本体\n'
  printf '[10] 更新 cocktail-plus 后端扩展版本\n'
  printf '[11] 显示当前选择\n'
  printf '[12] 修复 SillyTavern 聊天文件 ENOENT 崩溃问题\n'
  printf '[13] 安装/重新安装 cocktail-plus 前端扩展\n'
  printf '[14] 卸载 cocktail-plus 前端扩展\n'
  printf '[0] 退出\n'
}

start_backend_update_check >/dev/null 2>&1 || true

while true; do
  show_menu
  read -r -p '请选择: ' choice
  case "$choice" in
    1) auto_locate_config ;;
    2) manual_config_input ;;
    3) install_backend_plugin ;;
    4) remove_backend_plugin ;;
    5) repair_backend_uninstall_black_screen ;;
    6) ensure_config_selected && set_config_bool "$SELECTED_CONFIG" enableServerPlugins true && say_warn '请重启 SillyTavern 后生效。' ;;
    7)
      ensure_config_selected || continue
      say_warn '注意：这会禁用所有 SillyTavern Server Plugins，不只是 cocktail-plus。'
      read -r -p '确认关闭？(y/N) ' confirm
      if [[ "$confirm" =~ ^[Yy] ]]; then set_config_bool "$SELECTED_CONFIG" enableServerPlugins false; say_warn '请重启 SillyTavern 后生效。'; fi
      ;;
    8) maintain_backend_config ;;
    9) restart_sillytavern ;;
    10) update_backend_from_repository ;;
    11) show_current_selection ;;
    12) source_patch_menu ;;
    13) install_frontend_extension ;;
    14) remove_frontend_extension ;;
    0) break ;;
    *) say_warn '无效选项。' ;;
  esac
done
