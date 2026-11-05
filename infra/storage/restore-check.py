#!/usr/bin/env python3
"""Rehearse pg_dump restoration into a separate, owner-only verification database."""
import subprocess,sys,re
from pathlib import Path
folder=Path(sys.argv[1]);name=sys.argv[2] if len(sys.argv)>2 else 'keyantong_restorecheck'
if not re.fullmatch(r'keyantong_restorecheck(?:_[a-z0-9_]+)?',name):raise SystemExit('Invalid isolated restore database name')
def sql(s,db=None):
 return subprocess.run(['docker','exec','-i','keyantong-postgres-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "${RESTORE_CHECK_DB:-$POSTGRES_DB}" -v ON_ERROR_STOP=1 -Atq'] if db is None else ['docker','exec','-i','-e','RESTORE_CHECK_DB='+db,'keyantong-postgres-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "$RESTORE_CHECK_DB" -v ON_ERROR_STOP=1 -Atq'],input=s,text=True,check=True,capture_output=True).stdout.strip()
# Never destroy an existing database automatically.
if sql(f"SELECT count(*) FROM pg_database WHERE datname='{name}'")!='0':raise SystemExit('Restore-check DB already exists; inspect it before removing')
sql(f'CREATE DATABASE {name};REVOKE CONNECT ON DATABASE {name} FROM PUBLIC;')
with (folder/'postgres.dump').open('rb') as stream:
 subprocess.run(['docker','exec','-i','keyantong-postgres-1','sh','-c',f'exec pg_restore --exit-on-error -U "$POSTGRES_USER" -d {name}'],stdin=stream,check=True)
print('Backup restored successfully into isolated '+name)
print('Restored identity rows:',sql('SELECT count(*) FROM kt_auth.users',name))
