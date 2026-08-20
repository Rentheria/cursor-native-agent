#!/usr/bin/env bash
# Sync flat wrapper skills (skills/*.md) into Cursor Plugin layout
# (.cursor-plugin/skills/<name>/SKILL.md). Source of truth: skills/*.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/skills"
DEST="${ROOT}/.cursor-plugin/skills"

if [[ ! -d "${SRC}" ]]; then
  echo "error: missing ${SRC}" >&2
  exit 1
fi

mkdir -p "${DEST}"

# Remove previously synced skill dirs so renames/deletes stay clean.
find "${DEST}" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

copied=0
shopt -s nullglob
for file in "${SRC}"/*.md; do
  name="$(basename "${file}" .md)"
  mkdir -p "${DEST}/${name}"
  cp "${file}" "${DEST}/${name}/SKILL.md"
  copied=$((copied + 1))
  echo "synced ${name}"
done

if [[ "${copied}" -eq 0 ]]; then
  echo "error: no skills/*.md files to sync" >&2
  exit 1
fi

echo "done: ${copied} skill(s) → .cursor-plugin/skills/<name>/SKILL.md"
