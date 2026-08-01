#!/bin/bash
# Push to main and trigger APK build + distribute
set -e

cd "$(dirname "$0")"

echo "🚀 Pushing to main..."
git push origin main

echo ""
echo "📦 Starting APK build & distribute..."
./build-local.sh
