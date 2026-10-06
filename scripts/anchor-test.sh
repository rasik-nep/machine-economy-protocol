#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export PATH="$repo_root/scripts/toolchain:$PATH"

anchor build --arch v2
anchor test --skip-build
