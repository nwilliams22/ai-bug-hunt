#!/usr/bin/env bash
set -euo pipefail
manifest=$1
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  sha256sum "$path"
done < "$manifest"
