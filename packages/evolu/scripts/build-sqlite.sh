#!/bin/bash

# run `chmod u+x build-sqlite.sh` to make it executable
# Download wabt and put it into PATH.

rm -rf sqlite-build
mkdir sqlite-build
cd sqlite-build

git clone https://github.com/sqlite/sqlite.git
git clone https://github.com/emscripten-core/emsdk.git

cd sqlite
./configure --enable-all
make sqlite3.c

cd ../emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../sqlite/ext/wasm
make release

cp jswasm/sqlite3.wasm jswasm/sqlite3-opfs-async-proxy.js ../../../../dist
cp jswasm/sqlite3.js ../../../../src