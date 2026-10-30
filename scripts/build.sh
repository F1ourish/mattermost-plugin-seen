#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node scripts/check-version.mjs)
# GNU tar, Go 1.26.10, Node 24.19.0, npm lockfile.
# Pin the release compiler so an older installed toolchain cannot reintroduce
# fixed standard-library vulnerabilities.
export GOTOOLCHAIN=go1.26.10
npm --prefix webapp ci --ignore-scripts
npm --prefix webapp run format:check
npm --prefix webapp run lint
npm --prefix webapp run typecheck
npm --prefix webapp test
npm --prefix webapp run build
go test -race ./server
go vet ./server
python3 scripts/licenses.py
mkdir -p dist
# Stage outside the checkout so workspace mounts cannot change the archived
# directory while GNU tar reads it.
staging_root=$(mktemp -d)
trap 'rm -rf "$staging_root"' EXIT
stage="$staging_root/ru.internal.mattermost.seen"
mkdir -p "$stage/server/dist" "$stage/webapp/dist"
for arch in amd64 arm64; do
    # Retain the Go symbol table for artifact-level vulnerability analysis.
    CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -trimpath -buildvcs=false -ldflags='-w -buildid=' -o "$stage/server/dist/plugin-linux-$arch" ./server
done
cp plugin.json LICENSE NOTICE README.md "$stage/"
if [[ -f README.ru.md ]]; then
    cp README.ru.md "$stage/"
fi
mkdir -p "$stage/docs"
cp docs/*.md docs/*.json docs/*.csv "$stage/docs/"
cp SECURITY.md CHANGELOG.md AI_DISCLOSURE.md CONTRIBUTING.md "$stage/"
cp -R third-party "$stage/"
cp webapp/dist/main.js "$stage/webapp/dist/"
chmod 755 "$stage"/server/dist/plugin-*
# Reproducible archive metadata and gzip header. Toolchain and locks are pinned.
# Match the metadata of the already prepared, owner-requested 1.1.3 archive.
tar --sort=name --mtime='UTC 2026-10-11' --owner=0 --group=0 --numeric-owner -C "$staging_root" -cf - ru.internal.mattermost.seen | gzip -n > "$staging_root/bundle.tar.gz"
mv "$staging_root/bundle.tar.gz" "dist/ru.internal.mattermost.seen-$version.tar.gz"
sha256sum "dist/ru.internal.mattermost.seen-$version.tar.gz" > dist/SHA256SUMS
