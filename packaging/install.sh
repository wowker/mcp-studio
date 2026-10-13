#!/bin/sh
# Run from an extracted candidate. No sudo, service registration, or state removal.
set -eu
if [ "$#" -ne 3 ]; then
  echo 'Usage: ./install.sh install|upgrade|uninstall /absolute/private/prefix /absolute/state/directory' >&2
  exit 2
fi
case "$1" in install|upgrade|uninstall) ;; *) echo 'Invalid install action' >&2; exit 2;; esac
candidate_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec "$candidate_dir/mcp-studio-agent" "--$1-prefix" "$2" --state-dir "$3"
