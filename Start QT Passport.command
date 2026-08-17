#!/bin/bash
# Double-click this file to start QT Passport.
#
# It builds the app if needed, starts the server, and prints the addresses to
# open. Leave this window open while the app is in use; closing it stops the
# server. Nothing here reaches the internet — the app and its records stay on
# this machine.

cd "$(dirname "$0")" || exit 1

printf '\n  QT Passport\n  ===========\n\n'

if [ ! -d node_modules ]; then
  echo "  First run — installing. This takes a few minutes."
  npm install || { echo; echo "  Install failed. Check the messages above."; read -r -p "  Press return to close."; exit 1; }
fi

if [ ! -f .env.local ]; then
  echo "  Setting up for the first time..."
  cp .env.example .env.local
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
  # macOS sed needs the empty -i argument.
  sed -i '' "s|^QTP_SESSION_SECRET=.*|QTP_SESSION_SECRET=$SECRET|" .env.local
  echo "  Created .env.local with a new session secret."
  echo
  echo "  Creating the two accounts. WRITE THESE PASSWORDS DOWN:"
  echo
  npm run db:seed
  echo
  read -r -p "  Saved them? Press return to continue."
fi

echo "  Starting up (the first build takes a minute)..."
echo

npm run serve &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM

sleep 12
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

printf '\n  ------------------------------------------------------------\n'
printf '   Ready.\n\n'
printf '   On this computer:   http://localhost:3000\n'
[ -n "$IP" ] && printf '   On the same wifi:   http://%s:3000\n' "$IP"
printf '\n   Keep this window open. Close it to stop the app.\n'
printf '  ------------------------------------------------------------\n\n'

open "http://localhost:3000" 2>/dev/null

wait $SERVER_PID
