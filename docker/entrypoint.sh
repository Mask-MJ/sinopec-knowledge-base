#!/bin/sh
set -e

echo "📦 Syncing frontend assets to shared volume..."
rm -rf /app/public/*
cp -r /app/public-src/. /app/public/
echo "✅ Frontend assets synced."

echo "🔄 Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "✅ Migrations applied successfully."

echo "🚀 Starting application..."
exec node dist/main.js
