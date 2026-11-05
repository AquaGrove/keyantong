#!/usr/bin/env bash
set -euo pipefail
umask 077
root="${KEYANTONG_DATA_ROOT:-/data/keyantong}"
# Quiesce new object writes and let existing compute finish before the S3 snapshot.
control_exists="$(printf '%s\n' "SELECT to_regclass('kt_ops.execution_control') IS NOT NULL;" | docker exec -i keyantong-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -v ON_ERROR_STOP=1')"
wait_for_objects() {
  python3 - <<'PYREADY'
import subprocess,time,urllib.request,urllib.error
ip=subprocess.check_output(['docker','inspect','keyantong-objects','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],text=True).strip()
for attempt in range(30):
 try:
  with urllib.request.urlopen('http://'+ip+':8333/',timeout=1) as r:break
 except urllib.error.HTTPError as e:
  if 400<=e.code<500:break
 except Exception:pass
 time.sleep(1)
else:raise SystemExit('Object service did not become ready; compute remains paused')
PYREADY
}
resume_backup_services() {
  if [[ "${objects_stopped:-0}" == "1" ]]; then
    docker start keyantong-objects >/dev/null
    wait_for_objects || return 1
  fi
  if [[ "$control_exists" == "t" ]]; then
    printf '%s\n' "UPDATE kt_ops.execution_control SET paused=false,updated_at=now() WHERE name='omics';" | docker exec -i keyantong-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' >/dev/null || { echo 'Backup recovery failed: compute pause must be inspected' >&2; return 1; }
  fi
}

objects_stopped=0
trap resume_backup_services EXIT
if [[ "$control_exists" == "t" ]]; then
  printf '%s\n' "BEGIN; SELECT pg_advisory_xact_lock(727411304); SELECT pg_advisory_xact_lock(727411305); UPDATE kt_ops.execution_control SET paused=true,updated_at=now() WHERE name='omics'; COMMIT;" | docker exec -i keyantong-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' >/dev/null
  for ((waited=0; waited<=1260; waited+=2)); do
    active="$(printf '%s\n' "SELECT count(*) FROM kt_ops.tasks WHERE (kind='omics' AND status='running') OR (kind='omics.prepare' AND status='queued');" | docker exec -i keyantong-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -v ON_ERROR_STOP=1')"
    [[ "$active" == "0" ]] && break
    if (( waited==1260 )); then echo 'Backup aborted: compute did not drain within 21 minutes' >&2; exit 1; fi
    sleep 2
  done
fi
dest="$root/backups/storage-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
# For a cutover stop the portal before running so files form a consistent snapshot.
sudo tar --exclude='portal/.cache' -czf "$dest/portal.tgz" -C "$root" portal
sudo chown "$(id -u):$(id -g)" "$dest/portal.tgz"
sudo cat "$root/portal/users.json" > "$dest/users.json"
docker exec keyantong-postgres-1 sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$dest/postgres.dump"
docker exec keyantong-postgres-1 sh -c 'exec pg_dumpall --globals-only -U "$POSTGRES_USER"' > "$dest/globals.sql"
if [[ -f /opt/keyantong/infra/.env ]]; then cp /opt/keyantong/infra/.env "$dest/infra.env"; fi
if [[ -d "$root/storage-secrets" ]]; then tar -czf "$dest/storage-secrets.tgz" -C "$root" storage-secrets; fi
docker exec -i keyantong-postgres-1 pg_restore --list < "$dest/postgres.dump" > "$dest/postgres.list"
tar -tzf "$dest/portal.tgz" > "$dest/portal.list"
(cd "$dest" && sha256sum portal.tgz users.json postgres.dump globals.sql > SHA256SUMS && sha256sum -c SHA256SUMS)
# Snapshot embedded filer metadata and volume files only while the S3 service is stopped.
if docker inspect keyantong-objects >/dev/null 2>&1; then
  docker stop -t 30 keyantong-objects >/dev/null
  objects_stopped=1
  sudo tar -czf "$dest/objects.tgz" -C "$root" objects
  sudo chown "$(id -u):$(id -g)" "$dest/objects.tgz"
  tar -tzf "$dest/objects.tgz" > "$dest/objects.list"
  docker start keyantong-objects >/dev/null
  wait_for_objects
  objects_stopped=0
fi
(cd "$dest" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum -c SHA256SUMS)
chmod 600 "$dest"/*
printf '%s\n' "$dest"
