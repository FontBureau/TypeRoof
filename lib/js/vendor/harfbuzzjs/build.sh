#! /usr/bin/env bash

# Build and vendor harfbuzzjs v1.x from upstream.
#
# As of v1.x all former custom patches of the graphicore fork are upstream
# (stack runtime methods, hb_font_get_{glyph,h}_extents exports, string
# alignment fix) and the build configuration (config-override.h) is part
# of the upstream repo, so we track origin/main directly.
#
# Requires: emscripten (em++) and node/npm.
# Run from this directory. Copies the resulting artifacts in place:
#   index.mjs, index.d.mts, harfbuzz.js, harfbuzz.wasm

set -e

mkdir .build -p
cd .build

if [ -d harfbuzzjs ]; then
   cd harfbuzzjs
   git fetch origin
   git checkout main
   git pull --ff-only --recurse-submodules origin main
else
   git clone --single-branch --recursive --depth 1 https://github.com/harfbuzz/harfbuzzjs.git
   cd harfbuzzjs
fi

make
cd ../..
cp .build/harfbuzzjs/dist/index.mjs index.mjs
cp .build/harfbuzzjs/dist/index.d.mts index.d.mts
cp .build/harfbuzzjs/dist/harfbuzz.js harfbuzz.js
cp .build/harfbuzzjs/dist/harfbuzz.wasm harfbuzz.wasm
