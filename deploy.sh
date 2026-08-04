#!/usr/bin/env bash
# Deploy OCI Converge: Fly.io backend + Vercel frontend.
# Run from the project root: ./deploy.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Deploying backend to Fly.io (./backend)"
(
  cd backend
  if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
    echo "Error: flyctl not found. Install: curl -L https://fly.io/install.sh | sh"
    exit 1
  fi
  FLY_BIN="$(command -v flyctl || command -v fly)"
  "$FLY_BIN" deploy
)

echo ""
echo "==> Deploying frontend to Vercel (./frontend)"
(
  cd frontend
  if ! command -v vercel >/dev/null 2>&1; then
    echo "Error: vercel CLI not found. Install: npm i -g vercel"
    exit 1
  fi
  vercel --prod
)

echo ""
echo "Done."
echo "Remember: set Vercel env var VITE_API_URL to your Fly backend URL"
echo "  e.g. https://oci-backend.fly.dev"
echo "Then redeploy the frontend so the build picks it up."
