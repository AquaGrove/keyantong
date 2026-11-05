#!/usr/bin/env python3
"""Select existing effective admin credentials; never print inspect data or secrets."""
from pathlib import Path
import json,os,subprocess
config=json.loads(subprocess.check_output(['docker','inspect','keyantong-portal-1']))[0]['Config']['Env']
values=dict(line.split('=',1) for line in config if '=' in line)
if not values.get('ADMIN_PASSWORD'):raise SystemExit('Existing ADMIN_PASSWORD must be configured before starting admin')
selected={k:values[k] for k in ['ADMIN_PASSWORD','ADMIN_SESSION_SECRET','INTERNAL_API_SECRET'] if values.get(k)}
selected.update(PORTAL_URL='http://portal:3000',NEXT_PUBLIC_SITE_URL='https://keyantong.online')
target=Path('/data/keyantong/storage-secrets/admin.env')
if target.exists():raise SystemExit('Admin env already exists; reuse it')
fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(''.join(k+'='+v+'\n' for k,v in selected.items()))
print('Created private admin env using existing credentials')
