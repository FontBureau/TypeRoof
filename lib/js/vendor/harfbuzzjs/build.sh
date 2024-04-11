#! /usr/bin/env bash

mkdir .build -p
cd .build

if [ -d harfbuzzjs ]; then
   cd harfbuzzjs
   git pull --recurse-submodules --rebase
else
   # use js-callbacks as branch as it has just the features argument
   # of shape implemented. when the PR is through, this can fetch master
   # again ...
   # https://github.com/harfbuzz/harfbuzzjs/pull/97
   # Added custom function exports, that the official version doesn't
   # export (yet?)
   git clone -b js-callbacks --single-branch --recursive --depth 1 -b TypeRoof-main git@github.com:graphicore/harfbuzzjs.git
   cd harfbuzzjs
fi

./build.sh
cd ../..
cp .build/harfbuzzjs/hb.wasm hb.wasm
echo 'define(function(require, exports, module){' > hbjs.js
cat .build/harfbuzzjs/hbjs.js >> hbjs.js
echo '});' >> hbjs.js


cat .build/harfbuzzjs/hbjs.js > hbjs.mjs
echo 'export default hbjs;' >> hbjs.mjs

cat .build/harfbuzzjs/hb.js > hb.mjs
echo 'export default Module;' >> hb.mjs
