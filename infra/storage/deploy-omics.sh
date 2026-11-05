#!/usr/bin/env bash
set -euo pipefail
umask 077
release=/opt/keyantong-omics-20261105
secrets=/data/keyantong/storage-secrets
cd "$release"
# Prerequisite: isolated schema + moderation + computation + RNAseq regression passed.
sudo bash /opt/keyantong-storage-20261105/infra/storage/backup.sh
docker run --rm --network keyantong_kt --env-file "$secrets/production.env" keyantong-storage-ops:omics-20261105 node --import tsx db/scripts/migrate.ts
docker run --rm --network keyantong_kt --env-file "$secrets/production.env" keyantong-storage-ops:omics-20261105 node --import tsx db/scripts/seed-resources.ts
python3 infra/storage/admin-env.py
docker tag "$(docker inspect keyantong-portal-1 --format '{{.Image}}')" keyantong-portal:pre-omics-20261105
docker tag "$(docker inspect keyantong-rnaseq-worker-1 --format '{{.Image}}')" keyantong-rnaseq-worker:pre-omics-20261105
docker stop keyantong-portal-1 >/dev/null
trap 'docker start keyantong-portal-1 >/dev/null' ERR
# Keep existing analysis data intact; do not replace a worker with an active job.
sudo python3 - <<'PY'
import json
from pathlib import Path
for p in Path('/data/keyantong/rnaseq/jobs').glob('*/job.json'):
 try:j=json.loads(p.read_text())
 except Exception:raise SystemExit('Cannot inspect RNAseq job; abort cutover')
 if j.get('status') in ('running','queued'):raise SystemExit('RNAseq jobs pending; finish them before replacing worker')
PY
# Source archive excludes env, dependencies, data and build output.
tar xzf /tmp/kt-omics-release.tgz -C /opt/keyantong
cp infra/deploy-up.sh /opt/keyantong/infra/deploy-up.sh
cp infra/docker-compose.omics.yml /opt/keyantong/infra/docker-compose.omics.yml
cp infra/storage/restore-check.py /opt/keyantong/infra/storage/restore-check.py
# Record enabled deployment separately from credentials.
touch "$secrets/omics-enabled"
chmod 600 "$secrets/omics-enabled"
docker compose -f /opt/keyantong/infra/docker-compose.prod.yml -f /opt/keyantong/infra/docker-compose.storage.yml -f /opt/keyantong/infra/docker-compose.omics.yml --env-file /opt/keyantong/infra/.env up -d --no-deps portal omics-worker admin rnaseq-worker
trap - ERR
printf 'Omics release started; verify portal, workers and private admin before completion.\n'
