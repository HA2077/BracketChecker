#!/bin/bash
emcc cpp/syntax_checker.cpp cpp/bindings.cpp \
  -o public/checker.js \
  --bind -O2 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="CheckerModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_ES6=1\
  -s ENVIRONMENT='web'
 
echo "✓ Build complete → public/checker.js + public/checker.wasm"