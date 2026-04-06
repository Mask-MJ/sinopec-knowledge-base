#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "✅ Migrations applied successfully."

echo "🚀 Starting application..."
exec node dist/main.js
