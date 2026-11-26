#!/usr/bin/env bash
# Sparse-clone Standard Ebooks source repositories (text + metadata + licence only).
# usage: pipeline/fetch-standard-ebooks.sh <repo-list.txt> <out-dir> [parallelism]
set -euo pipefail
list="$1"; out="$2"; par="${3:-8}"
mkdir -p "$out"
fetch() {
  local r="$1" d="$2/$1"
  [ -f "$d/.done" ] && return 0
  rm -rf -- "$d"
  if timeout 180 git clone -q --depth 1 --filter=blob:none --no-checkout "https://github.com/standardebooks/$r" "$d" 2>/dev/null; then
    (cd "$d" && git sparse-checkout set --no-cone '/src/epub/text/*.xhtml' '/src/epub/content.opf' '/LICENSE.md' && git checkout -q && touch .done) \
      && echo "ok   $r" || echo "fail $r"
  else
    echo "miss $r"
  fi
}
export -f fetch
grep -v '^\s*$' "$list" | xargs -P "$par" -I{} bash -c 'fetch "$@"' _ {} "$out"
