#!/usr/bin/env bash
# Deploy the Kova backend to the Oracle Cloud VM (the one AniFlix runs on).
#
#   ./deploy.sh            copy backend/ and rebuild the container
#   ./deploy.sh --env      also upload backend/.env (do this when you change keys)
#   ./deploy.sh --setup    first time only: swap, nginx site and HTTPS certificate
#
# Override with env vars: KOVA_HOST, KOVA_KEY, KOVA_DOMAIN, KOVA_EMAIL
set -euo pipefail

HOST="${KOVA_HOST:-ubuntu@137.23.46.155}"
KEY="${KOVA_KEY:-$HOME/Downloads/ssh-key-2026-08-09.key}"
DOMAIN="${KOVA_DOMAIN:-kova.137-23-46-155.sslip.io}"
EMAIL="${KOVA_EMAIL:-2026arjunsnair@gmail.com}"
REMOTE_DIR="kova-backend"

cd "$(dirname "$0")"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

SETUP=false; ENV=false
for arg in "$@"; do
  case "$arg" in
    --setup) SETUP=true; ENV=true ;;
    --env) ENV=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo "→ Copying backend to $HOST:~/$REMOTE_DIR"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  --exclude node_modules --exclude .env --exclude 'logs' \
  backend/ "$HOST:$REMOTE_DIR/"

if $ENV; then
  echo "→ Uploading .env"
  # Only KEY=value lines (Docker rejects the // comments dotenv allows), without surrounding quotes
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' backend/.env \
    | sed -E 's/^([^=]+)="(.*)"[[:space:]]*$/\1=\2/; s/^([^=]+)='"'"'(.*)'"'"'[[:space:]]*$/\1=\2/' \
    | "${SSH[@]}" "umask 077 && cat > $REMOTE_DIR/.env"
fi

if $SETUP; then
  echo "→ First-time setup on the server"
  "${SSH[@]}" "DOMAIN='$DOMAIN' EMAIL='$EMAIL' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
set -euo pipefail
# 2 GB swap: the VM has 1 GB RAM shared by AniFlix and Kova
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf >/dev/null && sudo sysctl -p /etc/sysctl.d/99-swap.conf >/dev/null
fi
# nginx site (only if certbot hasn't already taken it over)
if [ ! -f /etc/nginx/sites-available/kova ]; then
  sed "s/__DOMAIN__/$DOMAIN/g" "$REMOTE_DIR/deploy/nginx.conf" | sudo tee /etc/nginx/sites-available/kova >/dev/null
  sudo ln -sf /etc/nginx/sites-available/kova /etc/nginx/sites-enabled/kova
fi
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
REMOTE
fi

echo "→ Building and restarting the container"
"${SSH[@]}" "cd $REMOTE_DIR && docker compose up -d --build && docker image prune -f >/dev/null"

echo "→ Checking https://$DOMAIN"
for i in $(seq 1 20); do
  if curl -fsS --max-time 5 "https://$DOMAIN/" >/dev/null 2>&1; then
    echo "✓ Live: https://$DOMAIN"; exit 0
  fi
  sleep 3
done
echo "✗ Not answering yet. Logs: ssh -i $KEY $HOST 'docker logs --tail 50 kova-backend'"
exit 1
