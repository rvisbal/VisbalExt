#!/bin/bash

echo "===== Requirement Check Script ====="

# Check Node.js
if command -v node >/dev/null 2>&1; then
  echo -n "Node.js version: "
  node -v
else
  echo "Node.js is NOT installed!"
fi

# Check npm
if command -v npm >/dev/null 2>&1; then
  echo -n "npm version: "
  npm -v
else
  echo "npm is NOT installed!"
fi

# Check TypeScript
if npx tsc -v >/dev/null 2>&1; then
  echo -n "TypeScript version: "
  npx tsc -v
else
  echo "TypeScript is NOT installed globally, but npx can run it if it's in your dependencies."
fi

# Check Git
if command -v git >/dev/null 2>&1; then
  echo -n "Git version: "
  git --version
else
  echo "Git is NOT installed!"
fi

# Check npm install
if [ -f package.json ]; then
  echo "\nRunning npm install..."
  npm install --dry-run
  if [ $? -eq 0 ]; then
    echo "npm install check: OK"
  else
    echo "npm install check: FAILED"
  fi
else
  echo "No package.json found, skipping npm install check."
fi

# Check npm run build
if [ -f package.json ]; then
  echo "\nRunning npm run build (dry run if possible)..."
  npm run build --dry-run 2>/dev/null || npm run build
  if [ $? -eq 0 ]; then
    echo "npm run build check: OK"
  else
    echo "npm run build check: FAILED"
  fi
else
  echo "No package.json found, skipping npm run build check."
fi

echo "===== Requirement Check Complete =====" 