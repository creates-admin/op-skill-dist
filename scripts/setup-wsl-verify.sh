#!/usr/bin/env bash
# 機能概要: WSL を `op verify windows lease` の Windows 検証に使える状態にする (ADR-0036 決定7)。
#   1. rustup target x86_64-pc-windows-msvc
#   2. cargo-xwin
#   3. PATH に見える llvm-rc
#   4. 静的 CRT の Windows 版 tauri-driver.exe をホストのキャッシュ (<cache>\tauri-driver) に置く
# 変更を伴う手順はそれぞれ実行前に確認を求める (--yes のときだけ省く。端末でなく --yes も無ければ実行しない)。
# --dry-run は何も変えずに要る手順を表示する。sudo は使わない。何度実行してもよく、済んでいる手順は飛ばす。
# exit 0 = すべて済み / exit 1 = 済んでいない手順が残った / exit 2 = エラー
#
# 使い方:
#   scripts/setup-wsl-verify.sh --dry-run
#   scripts/setup-wsl-verify.sh --yes [--windows-cache 'C:\op-verify'] [--tauri-driver-version 2.0.6]

set -euo pipefail

WINDOWS_CACHE='C:\op-verify'
TAURI_DRIVER_VERSION='2.0.6'
CARGO_XWIN_VERSION='0.23.1'
TARGET='x86_64-pc-windows-msvc'
XWIN_LICENSE_URL='https://go.microsoft.com/fwlink/?LinkId=2086102'
MODE='confirm'
PENDING=()

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
die() { echo "$1" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE='dry-run'; shift ;;
    --yes) MODE='yes'; shift ;;
    --windows-cache) [[ $# -ge 2 ]] || die '--windows-cache に値がありません'; WINDOWS_CACHE="$2"; shift 2 ;;
    --tauri-driver-version) [[ $# -ge 2 ]] || die '--tauri-driver-version に値がありません'; TAURI_DRIVER_VERSION="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done

confirm_change() {
  local target="$1" action="$2" answer
  case "$MODE" in
    dry-run) printf 'What if: %s: %s\n' "$target" "$action"; return 1 ;;
    yes) return 0 ;;
  esac
  if [ ! -t 0 ]; then
    printf '確認できないので実行しません (承認済みなら --yes を付ける): %s: %s\n' "$target" "$action" >&2
    return 1
  fi
  read -r -p "$target: $action [y/N] " answer
  [ "$answer" = y ] || [ "$answer" = Y ]
}

has_target() { rustup target list --installed | grep -x "$TARGET" >/dev/null; }
has_xwin() { cargo xwin --version >/dev/null 2>&1; }

pe_dump_tool() {
  command -v objdump || command -v llvm-objdump || ls /usr/lib/llvm-*/bin/llvm-objdump 2>/dev/null | sort -V | tail -n 1
}

# Sandbox には VC++ ランタイムが無いので、動的 CRT の exe は STATUS_DLL_NOT_FOUND で起動しない
crt_free() {
  local tool names
  tool=$(pe_dump_tool || true)
  [ -n "$tool" ] || { echo "objdump も llvm-objdump も無いので $1 の import を確かめられません" >&2; return 1; }
  names=$("$tool" -p "$1" 2>/dev/null | sed -n 's/^[[:space:]]*DLL Name: //p')
  [ -n "$names" ] || return 1
  ! printf '%s\n' "$names" | grep -iE '^(vcruntime|msvcp|api-ms-win-crt-)' >/dev/null
}

ensure_target() {
  step "rustup target $TARGET"
  if has_target; then
    echo '導入済み'
    return
  fi
  if ! confirm_change "$TARGET" 'rustup target add で Windows (MSVC) 向けの標準ライブラリを取得する'; then
    PENDING+=("rustup target add $TARGET")
    return
  fi
  rustup target add "$TARGET" || die "rustup target add $TARGET が失敗しました"
}

ensure_cargo_xwin() {
  step 'cargo-xwin'
  if has_xwin; then
    echo "導入済み ($(cargo xwin --version))"
    return
  fi
  if ! confirm_change 'cargo-xwin' "cargo install cargo-xwin --version $CARGO_XWIN_VERSION --locked で crates.io から取得してビルドする (cargo-xwin は初回のビルドで Microsoft の CRT / Windows SDK を取得し、使用をもって Microsoft のライセンス $XWIN_LICENSE_URL に同意したとみなされる)"; then
    PENDING+=("cargo install cargo-xwin --version $CARGO_XWIN_VERSION --locked")
    return
  fi
  cargo install cargo-xwin --version "$CARGO_XWIN_VERSION" --locked || die "cargo-xwin $CARGO_XWIN_VERSION の導入が失敗しました"
}

# apt は sudo が要るので、LLVM が入っていれば ~/.local/bin への symlink で PATH に出す
ensure_llvm_rc() {
  step 'llvm-rc (PATH)'
  if command -v llvm-rc >/dev/null 2>&1; then
    echo "導入済み ($(command -v llvm-rc))"
    return
  fi
  local link="$HOME/.local/bin/llvm-rc" found
  if [ -e "$link" ]; then
    echo "$link はあるが PATH に $HOME/.local/bin が無い。シェルの設定で PATH に足してから再実行してください"
    PENDING+=("PATH に $HOME/.local/bin を足す")
    return
  fi
  found=$(ls /usr/lib/llvm-*/bin/llvm-rc 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -z "$found" ]; then
    echo 'llvm-rc がありません。人間が sudo apt-get install -y llvm を実行してから再実行してください (このスクリプトは sudo を使わない)'
    PENDING+=('sudo apt-get install -y llvm')
    return
  fi
  if ! confirm_change "$link" "$found への symlink を作る"; then
    PENDING+=("ln -s $found $link")
    return
  fi
  mkdir -p "$HOME/.local/bin" || die "$HOME/.local/bin を作れませんでした"
  ln -s "$found" "$link" || die "$link を作れませんでした"
  hash -r
  if ! command -v llvm-rc >/dev/null 2>&1; then
    echo "$link を作ったが PATH に $HOME/.local/bin が無い。シェルの設定で PATH に足してから再実行してください"
    PENDING+=("PATH に $HOME/.local/bin を足す")
  fi
}

ensure_tauri_driver() {
  step "tauri-driver.exe ($TAURI_DRIVER_VERSION、静的 CRT)"
  local dir="$CACHE_DIR/tauri-driver"
  local exe="$dir/tauri-driver.exe" stamp="$dir/version.txt" work built xwin_env
  if [ -f "$exe" ] && [ "$(tr -d '\r\n ' 2>/dev/null <"$stamp")" = "$TAURI_DRIVER_VERSION" ] && crt_free "$exe"; then
    echo "配置済み ($TAURI_DRIVER_VERSION)"
    return
  fi
  if [ "$MODE" != 'dry-run' ] && ! { has_target && has_xwin && command -v llvm-rc >/dev/null 2>&1; }; then
    echo '前の手順が済んでいないので飛ばします' >&2
    PENDING+=("tauri-driver.exe $TAURI_DRIVER_VERSION のビルドと配置")
    return
  fi
  if ! confirm_change "$exe" "crates.io から tauri-driver $TAURI_DRIVER_VERSION を取得し、cargo xwin で静的 CRT (+crt-static) の Windows 版をビルドして置く (version.txt に版を書く)"; then
    PENDING+=("tauri-driver.exe $TAURI_DRIVER_VERSION のビルドと配置")
    return
  fi
  mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}" || die "${XDG_CACHE_HOME:-$HOME/.cache} を作れませんでした"
  xwin_env=$(cargo xwin env --target "$TARGET") || die 'cargo xwin env が失敗しました'
  work=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/op-verify-tauri-driver.XXXXXX") || die '作業ディレクトリを作れませんでした'
  if ! (eval "$xwin_env" && RUSTFLAGS='-C target-feature=+crt-static' cargo install tauri-driver \
    --version "$TAURI_DRIVER_VERSION" --locked --target "$TARGET" --root "$work/root" --target-dir "$work/target"); then
    rm -rf "$work" || echo "$work を消せませんでした" >&2
    die "tauri-driver $TAURI_DRIVER_VERSION のビルドが失敗しました"
  fi
  built="$work/root/bin/tauri-driver.exe"
  if ! crt_free "$built"; then
    rm -rf "$work" || echo "$work を消せませんでした" >&2
    die "ビルドした tauri-driver.exe が VC++ ランタイムを import している (静的 CRT になっていない) ので置きません"
  fi
  mkdir -p "$dir" || die "$dir を作れませんでした"
  cp "$built" "$exe.new" && mv -f "$exe.new" "$exe" || die "$exe を置けませんでした"
  printf '%s\n' "$TAURI_DRIVER_VERSION" >"$stamp" || die "$stamp を書けませんでした"
  rm -rf "$work" || die "$work を消せませんでした"
  echo "置きました: $WINDOWS_CACHE\\tauri-driver\\tauri-driver.exe ($TAURI_DRIVER_VERSION)"
}

[[ "$WINDOWS_CACHE" =~ ^[A-Za-z]:\\ ]] && [[ "$WINDOWS_CACHE" != *'"'* ]] \
  || die "--windows-cache は C:\\op-verify のような絶対パスにしてください (got $WINDOWS_CACHE)"
command -v rustup >/dev/null 2>&1 || die 'rustup がありません。Rust を rustup で入れてから実行してください'
command -v wslpath >/dev/null 2>&1 || die 'WSL の中で実行してください (wslpath がありません)'
CACHE_DIR=$(wslpath -u "$WINDOWS_CACHE") || die "wslpath -u $WINDOWS_CACHE が失敗しました"

ensure_target
ensure_cargo_xwin
ensure_llvm_rc
ensure_tauri_driver

if [ "${#PENDING[@]}" -gt 0 ]; then
  step '済んでいない手順'
  printf -- '- %s\n' "${PENDING[@]}"
  exit 1
fi
step '完了'
