#!/usr/bin/env python3
"""Run ON THE CLOUD HOST. Writes credentials mode 0600, never stdout.
Usage: provision.py DB_NAME NEW_ENV_FILE
Requires existing postgres container owner account, passwordless docker.
"""
import os,sys,secrets,subprocess,re,json
from pathlib import Path
from urllib.parse import quote
name,target=sys.argv[1:]
if not re.fullmatch(r'keyantong(?:_[a-z0-9_]+)?',name):raise SystemExit('Invalid database name')
p=Path(target)
if p.exists():raise SystemExit('Refusing to overwrite credentials')
def sql(s):
 return subprocess.run(['docker','exec','-i','keyantong-postgres-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atq'],input=s,text=True,capture_output=True,check=True).stdout
exists=sql("SELECT count(*) FROM pg_database WHERE datname='%s';"%name).strip()
if exists=='0':sql('CREATE DATABASE "%s";'%name)
# Role names are database-specific so test identities cannot connect to production.
roles={scope:f'{name}_{suffix}' for scope,suffix in [('AUTH','auth'),('APP','app'),('WORKER','worker')]}
passwords={scope:secrets.token_urlsafe(40) for scope in roles}
for scope,role in roles.items():
 sql(f"CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '{passwords[scope]}';")
 # INHERIT needed for named, non-login service role permissions.
 sql(f'ALTER ROLE {role} INHERIT;')
# Get existing owner password only in process memory, never print it.
config=json.loads(subprocess.check_output(['docker','inspect','keyantong-postgres-1']))[0]['Config']['Env']
env=dict(x.split('=',1) for x in config if '=' in x)
values={'AUTH_STORE':'postgres','VERIFICATION_CODE_SECRET':secrets.token_hex(32),'DATABASE_MIGRATION_URL':f"postgresql://{quote(env['POSTGRES_USER'],safe='')}:{quote(env['POSTGRES_PASSWORD'],safe='')}@postgres:5432/{name}",'REDIS_URL':'redis://redis:6379/1','TASK_STREAM':f'kt:{name}:events'}
for scope,role in roles.items():values[f'DATABASE_{scope}_URL']=f'postgresql://{role}:{passwords[scope]}@postgres:5432/{name}'
p.parent.mkdir(parents=True,exist_ok=True)
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as out:out.write(''.join(f'{k}={v}\n' for k,v in values.items()))
print('Provisioned database and wrote private credentials')
