#!/usr/bin/env bash
# Install the CM pre-commit hook into the current repository
set -euo pipefail
TARGET="${1:-$(pwd)}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITDIR="$(git -C "$TARGET" rev-parse --git-dir)"
GITDIR="$(cd "$TARGET" && cd "$GITDIR" && pwd)"

mkdir -p "$GITDIR/hooks"
install -m 0755 "$SRC/pre-commit" "$GITDIR/hooks/pre-commit"

echo "✅ Installed pre-commit hook -> $GITDIR/hooks/pre-commit"
