#!/usr/bin/env bash
# cocktail-plus SillyTavern backend plugin helper for Linux/macOS.
# Run this script on the machine that runs SillyTavern.

set -u
PLUGIN_ID="cocktail-plus"
SELECTED_CONFIG=""
SELECTED_ROOT=""

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
  if ! test_sillytavern_config "$cfg"; then
    say_warn "不是有效的 SillyTavern config.yaml: $1"
    return 1
  fi
  SELECTED_CONFIG="$cfg"
  SELECTED_ROOT="$(dirname "$cfg")"
  say_ok "当前 SillyTavern: $SELECTED_ROOT"
  printf 'config.yaml: %s\n' "$SELECTED_CONFIG"
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
    bases+=("/opt" "/srv" "/home" "/Users")

    for base in "${bases[@]}"; do
      [ -d "$base" ] || continue
      say_info "扫描：$base" >&2
      search_configs_under "$base" 5
    done
  } | unique_lines
}

select_config_from_list() {
  local configs=()
  while IFS= read -r cfg; do
    [ -n "$cfg" ] && configs+=("$cfg")
  done

  if [ "${#configs[@]}" -eq 0 ]; then return 1; fi
  if [ "${#configs[@]}" -eq 1 ]; then
    printf '找到 SillyTavern：%s\n' "$(dirname "${configs[0]}")"
    read -r -p '使用这个目录？(Y/n) ' yes
    if [ -z "$yes" ] || [[ "$yes" =~ ^[Yy] ]]; then
      printf '%s\n' "${configs[0]}"
      return 0
    fi
    return 1
  fi

  printf '\n找到多个候选 config.yaml：\n'
  local i
  for ((i=0; i<${#configs[@]}; i++)); do
    printf '[%d] %s\n' "$((i+1))" "${configs[$i]}"
  done
  read -r -p '请输入编号，或直接回车取消: ' choice
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
  local root="$1" cfg="$2" data_root candidate
  data_root="$(resolve_data_root "$root" "$cfg")"

  local candidates=()
  candidates+=("$root/public/scripts/extensions/third-party/$PLUGIN_ID/server-plugins/$PLUGIN_ID")
  candidates+=("$data_root/default-user/extensions/$PLUGIN_ID/server-plugins/$PLUGIN_ID")

  if [ -d "$data_root" ]; then
    while IFS= read -r user_dir; do
      candidates+=("$user_dir/extensions/$PLUGIN_ID/server-plugins/$PLUGIN_ID")
    done < <(find "$data_root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
  fi

  for candidate in "${candidates[@]}"; do
    if [ -d "$candidate" ] && [ -f "$candidate/index.mjs" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  say_warn '已尝试以下前端内置后端插件路径：' >&2
  for candidate in "${candidates[@]}"; do printf -- '- %s\n' "$candidate" >&2; done
  return 1
}

install_backend_plugin() {
  ensure_config_selected || return 1
  say_title '安装后端扩展'
  local src plugins_dir dst backup_dir backup
  src="$(find_frontend_backend_source "$SELECTED_ROOT" "$SELECTED_CONFIG")" || return 1
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
  set_config_bool "$SELECTED_CONFIG" enableServerPlugins true
  say_ok "后端插件已安装到：$dst"
  say_warn '请重启 SillyTavern 后生效。'
}

remove_backend_plugin() {
  ensure_config_selected || return 1
  say_title '删除后端扩展'
  local dst="$SELECTED_ROOT/plugins/$PLUGIN_ID"
  if [ ! -e "$dst" ]; then say_warn "后端插件不存在：$dst"; return 0; fi
  read -r -p "确认删除 $dst ? (y/N) " confirm
  if ! [[ "$confirm" =~ ^[Yy] ]]; then say_warn '已取消'; return 0; fi
  rm -rf "$dst"
  say_ok '后端插件已删除。'
  say_warn '请重启 SillyTavern 后生效。'
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
  printf '[1] 自动探测 SillyTavern/config.yaml（进程优先，失败后扫描文件）\n'
  printf '[2] 手动输入 SillyTavern/config.yaml 路径\n'
  printf '[3] 安装/更新 cocktail-plus 后端扩展，并开启 enableServerPlugins\n'
  printf '[4] 删除 cocktail-plus 后端扩展文件夹\n'
  printf '[5] 开启 enableServerPlugins: true\n'
  printf '[6] 关闭 enableServerPlugins: false（会禁用所有后端插件）\n'
  printf '[7] 显示当前选择\n'
  printf '[0] 退出\n'
}

while true; do
  show_menu
  read -r -p '请选择: ' choice
  case "$choice" in
    1) auto_locate_config ;;
    2) manual_config_input ;;
    3) install_backend_plugin ;;
    4) remove_backend_plugin ;;
    5) ensure_config_selected && set_config_bool "$SELECTED_CONFIG" enableServerPlugins true && say_warn '请重启 SillyTavern 后生效。' ;;
    6)
      ensure_config_selected || continue
      say_warn '注意：这会禁用所有 SillyTavern Server Plugins，不只是 cocktail-plus。'
      read -r -p '确认关闭？(y/N) ' confirm
      if [[ "$confirm" =~ ^[Yy] ]]; then set_config_bool "$SELECTED_CONFIG" enableServerPlugins false; say_warn '请重启 SillyTavern 后生效。'; fi
      ;;
    7) show_current_selection ;;
    0) break ;;
    *) say_warn '无效选项。' ;;
  esac
done
