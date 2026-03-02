#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy
echo "✅ Migrations applied successfully."

echo "🚀 Starting application..."
exec node dist/main.js
