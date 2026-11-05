#!/usr/bin/env python3
import subprocess,sys,re
name=sys.argv[1]
if not re.fullmatch(r'keyantong(?:_[a-z0-9_]+)?',name):raise SystemExit('Invalid database')
sql=f'''REVOKE CONNECT ON DATABASE {name} FROM PUBLIC;
GRANT CONNECT ON DATABASE {name} TO {name}_auth,{name}_app,{name}_worker;
GRANT kt_auth_service TO {name}_auth;
GRANT kt_app TO {name}_app;
GRANT kt_dispatcher TO {name}_worker;
'''
subprocess.run(['docker','exec','-i','keyantong-postgres-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'],input=sql,text=True,check=True)
