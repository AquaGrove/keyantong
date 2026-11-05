#!/usr/bin/env bash
# Run only after isolated DB/S3/HTTP validation; no credentials on command line.
set -euo pipefail
umask 077
release=/opt/keyantong-storage-20261105
secrets=/data/keyantong/storage-secrets
cd "$release"
docker tag keyantong-portal:local keyantong-portal:pre-storage-20261105
docker stop keyantong-portal-1 >/dev/null
trap 'docker start keyantong-portal-1 >/dev/null' ERR
sudo bash infra/storage/backup.sh
backup="$(sudo find /data/keyantong/backups -maxdepth 1 -type d -name 'storage-*' | sort | tail -n 1)"
# Root-owned backup mounted read-only into the one-shot migration container.
docker run --rm --network keyantong_kt --env-file "$secrets/production.env" -v "$backup:/backup:ro" keyantong-storage-ops:20261105 node --import tsx db/scripts/import-users.ts /backup/users.json
docker run --rm --network keyantong_kt --env-file "$secrets/production.env" -v "$backup:/backup:ro" keyantong-storage-ops:20261105 node --import tsx db/scripts/verify-import.ts /backup/users.json
sudo cmp "$backup/users.json" /data/keyantong/portal/users.json
# Preserve source prior to replacing the canonical deployment checkout.
sudo tar --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='*.tgz' --exclude='.pnpm-store' -czf "$backup/source-before-storage.tgz" -C /opt keyantong
sudo chmod 600 "$backup/source-before-storage.tgz"
tar xzf /tmp/keyantong-storage-release.tgz -C /opt/keyantong
cp infra/docker-compose.storage.yml /opt/keyantong/infra/docker-compose.storage.yml
cp infra/deploy-up.sh /opt/keyantong/infra/deploy-up.sh
# Fail closed if a future operator forgets the override; no credentials are duplicated.
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/keyantong/infra/.env')
lines=[l for l in p.read_text().splitlines() if not l.startswith('AUTH_STORE=')]
p.write_text('\n'.join(lines)+'\nAUTH_STORE=postgres\n')
p.chmod(0o600)
PY
docker compose -f /opt/keyantong/infra/docker-compose.prod.yml -f /opt/keyantong/infra/docker-compose.storage.yml --env-file /opt/keyantong/infra/.env up -d --no-deps portal storage-dispatcher
trap - ERR
printf 'Cutover started. Verify health before considering complete. Backup: %s\n' "$backup"
