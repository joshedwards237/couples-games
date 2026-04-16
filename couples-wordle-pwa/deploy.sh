#!/usr/bin/env bash
set -euo pipefail

# Deploy script for Couples Wordle PWA
# Builds the app with production env and deploys to Firebase Hosting.

# Ensure we run from the script directory
cd "$(dirname "$0")"

# Build (uses .env.production if present)
echo "📦 Building app for production..."
npm run build -- --mode production

# Deploy hosting (functions are not configured in firebase.json; hosting only)
echo "🚀 Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo "✅ Deploy complete"
