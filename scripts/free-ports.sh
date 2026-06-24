#!/usr/bin/env bash
# Kill anything still holding the dev ports so `npm run dev` never silently
# fails with EADDRINUSE and leaves you testing stale code.
# Ports: 4000 (Express API), 5173 (Vite dev server).
set -e
for port in 4000 5173 5174; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[free-ports] freeing :$port (pids: $pids)"
    kill -9 $pids 2>/dev/null || true
  fi
done
# Also sweep orphaned dev runners from earlier crashed sessions.
pkill -f "billingdata.*vite" 2>/dev/null || true
pkill -f "node --watch src/index.js" 2>/dev/null || true
exit 0
