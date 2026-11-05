#!/usr/bin/env python3
"""Split one-shot migration owner credentials away from runtime services."""
import os
from pathlib import Path
base=Path('/data/keyantong/storage-secrets')
def read(p):return dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line and not line.startswith('#'))
def write(p,d):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as out:out.write(''.join(f'{k}={v}\n' for k,v in d.items()))
allenv=read(base/'production.env')
write(base/'portal.env',{**{k:v for k,v in allenv.items() if k in ['AUTH_STORE','VERIFICATION_CODE_SECRET','DATABASE_AUTH_URL','DATABASE_APP_URL']},**read(base/'s3-production.env')})
write(base/'dispatcher.env',{k:v for k,v in allenv.items() if k in ['DATABASE_WORKER_URL','REDIS_URL','TASK_STREAM']})
print('Wrote separate least-privilege runtime env files')
