#!/usr/bin/env bash
# Builds what gets attached to a release: the tarball that runs on plain Node,
# one image per platform ready for `docker load`, and the SHA-512 checksums.
# Signing happens outside, with the key that only lives in the repository
# secrets.
#
#   scripts/release-assets.sh 0.2.0 miguerubsk/trio-game@sha256:… linux/amd64 linux/arm64
#
# With RELEASE_NO_PULL=1 nothing is downloaded and whatever image is already
# local is used, which is how this gets tried out by hand.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <version> <image[@digest]> <platform>..." >&2
  exit 64
fi

version="$1"
image="$2"
shift 2
platforms=("$@")

out="${RELEASE_DIR:-dist-release}"
# The bare name, without @digest or :tag, which is what it will be loaded as on
# each machine. The case keeps the port of a private registry intact.
name="${image%@*}"
case "${name##*/}" in
  *:*) name="${name%:*}" ;;
esac
tagged="${name}:${version}"

rm -rf "$out"
mkdir -p "$out"

pull() {
  [ "${RELEASE_NO_PULL:-0}" = "1" ] && return 0
  docker pull --quiet --platform "$1" "$image" >/dev/null
}

# ── The tarball for plain Node ──────────────────────────────────────────────
# Taken out of the image itself, so it is exactly what is published on Docker
# Hub: the server, the built client and socket.io, nothing else.
pull "${platforms[0]}"
work="$out/bundle/trio-game-$version"
mkdir -p "$work"
container="$(docker create --platform "${platforms[0]}" "$image")"
docker cp "$container:/app/." "$work/"
docker rm "$container" >/dev/null

cat > "$work/README.txt" <<TEXT
Trio $version — running it without Docker

You need Node 20 or newer:

    PORT=3060 node packages/server/dist/index.js

then open http://localhost:3060 in a browser.

The server also serves the client in packages/client/dist, so there is nothing
else to install. Source and docs: https://github.com/miguerubsk/Trio-Game
TEXT

tar -czf "$out/trio-game-$version-node.tar.gz" -C "$out/bundle" "trio-game-$version"
rm -rf "$out/bundle"

# ── One image per platform ──────────────────────────────────────────────────
for platform in "${platforms[@]}"; do
  slug="$(echo "$platform" | tr '/' '-')"
  pull "$platform"
  docker tag "$image" "$tagged"
  docker save "$tagged" | gzip -9 > "$out/trio-game-$version-$slug.tar.gz"
  docker rmi "$tagged" >/dev/null 2>&1 || true
done

# ── Checksums ───────────────────────────────────────────────────────────────
( cd "$out" && sha512sum ./*.tar.gz | sed 's| \./| |' > SHA512SUMS )

echo "Done, in $out:"
ls -lh "$out"
