#!/bin/bash
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
APP_SLUG="wifi-share"
APP_NAME="WiFi Share"
R2_ACCOUNT_ID="ee9714c4bade2c83d3dca2d5dae214dc"
R2_BUCKET="apk-distributor"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
WEBHOOK_URL="https://apk-distributor.vercel.app/api/webhook/build-complete"
WEBHOOK_SECRET="build-webhook-secret-2024"
APK_PATH="./build-$(date +%s).apk"

# ─── Load R2 credentials ─────────────────────────────────────────────────────
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  ENV_FILE="$(dirname "$0")/../apk-distributor/.env.local"
  if [ -f "$ENV_FILE" ]; then
    export AWS_ACCESS_KEY_ID=$(grep R2_ACCESS_KEY_ID "$ENV_FILE" | cut -d= -f2-)
    export AWS_SECRET_ACCESS_KEY=$(grep R2_SECRET_ACCESS_KEY "$ENV_FILE" | cut -d= -f2-)
  else
    echo "❌ No R2 credentials. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or create $ENV_FILE"
    exit 1
  fi
fi
export AWS_DEFAULT_REGION=auto

VERSION=$(node -p "try{require('./package.json').version}catch(e){'unknown'}" 2>/dev/null || echo "unknown")
SHA=$(git rev-parse --short HEAD)

# ─── Notify distributor: build started ────────────────────────────────────────
echo "📡 Notifying distributor: build started..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d "{\"event\":\"build_started\",\"app\":{\"slug\":\"$APP_SLUG\",\"name\":\"$APP_NAME\",\"repo\":\"local\",\"sha\":\"$SHA\",\"startedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"triggeredBy\":\"local\"}}" \
  > /dev/null 2>&1 || echo "⚠️  Webhook notification failed (non-fatal)"

# ─── Step 1: Build APK locally ────────────────────────────────────────────────
echo "🧹 Clearing Metro/Gradle caches..."
rm -rf android/app/build 2>/dev/null || true
rm -rf .expo/web/cache .expo/cache node_modules/.cache 2>/dev/null || true

echo "🔨 Building APK locally..."
START=$(date +%s)

npx eas-cli build \
  --platform android \
  --profile preview \
  --local \
  --clear-cache \
  --output "$APK_PATH" \
  --non-interactive

END=$(date +%s)
DURATION="$(( (END - START) / 60 ))m $(( (END - START) % 60 ))s"
echo "✅ Build complete in $DURATION"

# ─── Step 2: Upload APK to R2 ─────────────────────────────────────────────────
SIZE=$(stat -f%z "$APK_PATH" 2>/dev/null || stat -c%s "$APK_PATH")

echo "⬆️  Uploading ${APP_SLUG} v${VERSION} ($(du -h "$APK_PATH" | cut -f1))..."

aws s3 cp "$APK_PATH" \
  "s3://${R2_BUCKET}/apps/${APP_SLUG}/latest.apk" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type "application/vnd.android.package-archive"
echo "✅ APK uploaded"

# ─── Step 3: Upload metadata ──────────────────────────────────────────────────
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > /tmp/metadata.json <<EOF
{
  "slug": "${APP_SLUG}",
  "name": "${APP_NAME}",
  "version": "${VERSION}",
  "buildDate": "${BUILD_DATE}",
  "sha": "${SHA}",
  "size": ${SIZE},
  "repo": "Korenisimo/wifi-share",
  "buildNumber": 1
}
EOF

aws s3 cp /tmp/metadata.json \
  "s3://${R2_BUCKET}/apps/${APP_SLUG}/latest.json" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type "application/json"
echo "✅ Metadata uploaded"

# ─── Step 4: Notify distributor: build complete ───────────────────────────────
echo "📡 Notifying distributor: build complete..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d "{\"event\":\"build_complete\",\"app\":{\"slug\":\"$APP_SLUG\",\"name\":\"$APP_NAME\",\"repo\":\"local\",\"sha\":\"$SHA\",\"ref\":\"main\",\"runNumber\":1,\"triggeredBy\":\"local\",\"completedAt\":\"$BUILD_DATE\"}}" \
  > /dev/null 2>&1 || echo "⚠️  Webhook notification failed (non-fatal)"

# ─── Done ──────────────────────────────────────────────────────────────────────
rm -f "$APK_PATH"
echo ""
echo "🎉 ${APP_SLUG} v${VERSION} is live on the distributor!"
