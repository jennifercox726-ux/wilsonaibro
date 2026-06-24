#!/usr/bin/env bash
#
# Deploy the AI-powered Supabase Edge Functions and set the gateway secret.
#
# Usage:
#   AI_GATEWAY_API_KEY=your_key ./scripts/deploy-functions.sh
#
# Requirements:
#   - Supabase CLI installed:  https://supabase.com/docs/guides/cli
#   - Logged in:               supabase login
#
set -euo pipefail

PROJECT_REF="qpvffcwvnldxebswwdsx"

if [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
  echo "Error: AI_GATEWAY_API_KEY is not set."
  echo "Run:  AI_GATEWAY_API_KEY=your_key ./scripts/deploy-functions.sh"
  exit 1
fi

echo "==> Setting AI_GATEWAY_API_KEY secret on project ${PROJECT_REF}..."
supabase secrets set "AI_GATEWAY_API_KEY=${AI_GATEWAY_API_KEY}" --project-ref "${PROJECT_REF}"

echo "==> Deploying 'chat' function..."
supabase functions deploy chat --project-ref "${PROJECT_REF}"

echo "==> Deploying 'elevenlabs-tts' function..."
supabase functions deploy elevenlabs-tts --project-ref "${PROJECT_REF}"

echo "==> Done. Chat and voice now route through the Vercel AI Gateway."
