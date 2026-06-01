#!/usr/bin/env bash
#
# Tag the current VERSION and push it to GitHub, which triggers the Release
# workflow (.github/workflows/release.yml) to publish a GitHub Release.
#
# VERSION is the source of truth (gstack /ship bumps it). This script only
# turns the current VERSION into a pushed git tag. Run it from the branch that
# carries the version you want to release (usually main, after merge).
#
# Usage:
#   ./scripts/release.sh           # tag v$(cat VERSION) and push it
#   ./scripts/release.sh --dry-run # print what it would do, change nothing
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f VERSION ]; then
  echo "error: no VERSION file at repo root" >&2
  exit 1
fi

VERSION="$(tr -d '[:space:]' < VERSION)"
TAG="v${VERSION}"

if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+(\.[0-9]+){2,3}$'; then
  echo "error: VERSION '$VERSION' is not a dotted numeric version" >&2
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Bump VERSION first (gstack /ship does this)." >&2
  exit 1
fi

if [ "${1:-}" = "--dry-run" ]; then
  echo "[dry-run] would create and push annotated tag: $TAG"
  exit 0
fi

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"
echo "Pushed $TAG — the Release workflow will publish it under GitHub Releases."
