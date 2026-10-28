#!/bin/sh
# Run from the extracted candidate directory, NOT from the installed prefix.
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo 'Usage: ./install-platform.sh install|upgrade|uninstall PREFIX [DATA_DIR]' >&2
  exit 2
fi

ACTION="$1"
PREFIX="$2"
DATA_DIR="${3:-}"

case "$ACTION" in
  install|upgrade|uninstall) ;;
  *) echo 'Invalid action (expected install|upgrade|uninstall)' >&2; exit 2 ;;
esac

SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
BIN_NAME='mcp-studio'
PG_SUBDIR='pg'
# macOS thread-check shim — sits next to the binary so the platform finds it
# (pgThreadShimPath resolution rule 2). Present only in darwin candidates.
SHIM_NAME='pg_no_multithread_check.dylib'

# ---------- helpers ----------

die() { echo "$*" >&2; exit 1; }

ensure_prefix_dir() {
  if [ ! -d "$PREFIX" ]; then
    if mkdir -p "$PREFIX" 2>/dev/null; then return; fi
    # Cannot create — suggest a user-writable location.
    die "Cannot create PREFIX '$PREFIX'. Try a user-writable directory like ~/.local/mcp-studio or /Applications/MCP Studio."
  fi
  if [ ! -w "$PREFIX" ]; then
    die "PREFIX '$PREFIX' is not writable. Run with sudo or use a user-writable directory."
  fi
}

# ---------- install / upgrade ----------

do_install_or_upgrade() {
  ensure_prefix_dir

  # 1. Go binary — always copy.
  cp -f "$SELF_DIR/$BIN_NAME" "$PREFIX/$BIN_NAME"
  chmod 700 "$PREFIX/$BIN_NAME"

  # 1b. macOS thread-check shim — copy when present (darwin candidates only).
  if [ -f "$SELF_DIR/$SHIM_NAME" ]; then
    cp -f "$SELF_DIR/$SHIM_NAME" "$PREFIX/$SHIM_NAME"
    chmod 700 "$PREFIX/$SHIM_NAME"
  fi

  # 2. PG binaries — copy pg/ if present, keep any existing pg/ when upgrading.
  if [ -d "$SELF_DIR/$PG_SUBDIR" ]; then
    mkdir -p "$PREFIX/$PG_SUBDIR"
    for f in "$SELF_DIR/$PG_SUBDIR"/*; do
      [ -f "$f" ] && cp -f "$f" "$PREFIX/$PG_SUBDIR/"
    done
    chmod 700 "$PREFIX/$PG_SUBDIR"/* 2>/dev/null || true
  else
    if [ ! -d "$PREFIX/$PG_SUBDIR" ]; then
      echo "WARNING: this candidate was built without pg/ binaries." >&2
      echo "         Install PostgreSQL 18 separately (brew install postgresql@18) or" >&2
      echo "         set MCP_STUDIO_LOCAL_PG_BIN before running mcp-studio." >&2
    fi
  fi

  # 3. Install wrapper + manifest + checksums — useful for future reference.
  cp -f "$SELF_DIR/install-platform.sh" "$PREFIX/install-platform.sh" 2>/dev/null || true
  cp -f "$SELF_DIR/manifest.json"        "$PREFIX/manifest.json"        2>/dev/null || true
  cp -f "$SELF_DIR/CHECKSUMS.sha256"     "$PREFIX/CHECKSUMS.sha256"     2>/dev/null || true
  chmod 700 "$PREFIX/install-platform.sh" 2>/dev/null || true

  # 4. PATH symlink — optional but nice. Skip when PREFIX already in PATH.
  case ":$PATH:" in
    *":$PREFIX:"*) ;;
    *)
      LINK_DIR=/usr/local/bin
      if [ ! -w "$LINK_DIR" ]; then LINK_DIR="$HOME/.local/bin"; fi
      mkdir -p "$LINK_DIR" 2>/dev/null || true
      if [ -w "$LINK_DIR" ]; then
        ln -sf "$PREFIX/$BIN_NAME" "$LINK_DIR/$BIN_NAME" 2>/dev/null || true
      else
        echo "WARNING: could not create symlink in PATH — add '$PREFIX' to PATH manually." >&2
      fi
      ;;
  esac
}

# ---------- uninstall ----------

do_uninstall() {
  if [ ! -d "$PREFIX" ]; then
    echo "PREFIX '$PREFIX' does not exist — nothing to uninstall."
    return 0
  fi

  # Remove binary, wrapper, manifest, checksums, pg/ — everything we own.
  rm -f  "$PREFIX/$BIN_NAME"
  rm -f  "$PREFIX/$SHIM_NAME"
  rm -f  "$PREFIX/install-platform.sh"
  rm -f  "$PREFIX/manifest.json"
  rm -f  "$PREFIX/CHECKSUMS.sha256"
  rm -rf "$PREFIX/$PG_SUBDIR"
  # Remove empty PREFIX if we created it (leave alone if it's a shared dir).
  rmdir "$PREFIX" 2>/dev/null || true

  # Data dir — never silently remove.
  if [ -n "$DATA_DIR" ] && [ -d "$DATA_DIR" ]; then
    echo "Installed prefix removed. Data directory preserved at:" >&2
    echo "  $DATA_DIR" >&2
    echo "Remove it manually with:" >&2
    echo "  rm -rf '$DATA_DIR'" >&2
  fi
}

case "$ACTION" in
  install)  do_install_or_upgrade ;;
  upgrade)  do_install_or_upgrade ;;
  uninstall) do_uninstall ;;
esac
