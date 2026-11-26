#!/usr/bin/env bash
# Download Project Gutenberg texts from the GITenberg mirror on GitHub.
#   1. the GITenberg repository list (from gitenberg-dev/gitberg)
#   2. each repository's metadata.yaml
#   3. English literature only (see pipeline/select-gutenberg.ts), skipping works already in Standard Ebooks
#   4. the plain-text eBook for each selected repository
# usage: pipeline/fetch-gutenberg.sh <out-dir> [max-id] [parallelism]
set -euo pipefail
out="$1"; maxid="${2:-60000}"; par="${3:-16}"
mkdir -p "$out"
raw=https://raw.githubusercontent.com
curl -sf "$raw/gitenberg-dev/gitberg/master/gitenberg/data/GITenberg_repo_list.tsv" | tr -d '\r' \
  | awk -F'\t' -v m="$maxid" '$1<=m {print $2}' > "$out/_repos.txt"
meta() {
  local r="$1" f="$2/$1.yaml"
  [ -s "$f" ] && return 0
  for b in master main; do
    curl -sf -m 30 --retry 2 -o "$f" "$raw/GITenberg/$r/$b/metadata.yaml" && return 0
  done
  rm -f "$f"
}
text() {
  local r="$1" id="$2" f="$3/$1.txt"
  [ -s "$f" ] && return 0
  for n in "$id-0.txt" "$id.txt" "$id-8.txt"; do
    for b in master main; do
      curl -sf -m 60 --retry 2 -o "$f" "$raw/GITenberg/$r/$b/$n" && return 0
    done
  done
  rm -f "$f"
}
export -f meta text; export raw
xargs -P "$par" -I{} bash -c 'meta "$@"' _ {} "$out" < "$out/_repos.txt"
npx tsx pipeline/select-gutenberg.ts "$out" pipeline/standard-ebooks-repos.txt "$out/_selected.txt"
xargs -P "$par" -L 1 bash -c 'text "$0" "$1" "'"$out"'"' < "$out/_selected.txt"
