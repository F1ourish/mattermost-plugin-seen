#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export GOTOOLCHAIN=go1.26.10
version=$(node scripts/check-version.mjs)
archive="dist/ru.internal.mattermost.seen-$version.tar.gz"
if [[ ! -f "$archive" ]]; then
    printf 'Build %s first with make dist.\n' "$archive" >&2
    exit 1
fi

go mod verify
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 -show verbose ./server
npm --prefix webapp audit

scan_root=$(mktemp -d)
trap 'rm -rf "$scan_root"' EXIT
for arch in amd64 arm64; do
    # Read only the expected binary; never extract arbitrary archive paths.
    binary="$scan_root/plugin-linux-$arch"
    tar -xOf "$archive" "ru.internal.mattermost.seen/server/dist/plugin-linux-$arch" > "$binary"
    go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 -mode binary -show verbose "$binary"
done
