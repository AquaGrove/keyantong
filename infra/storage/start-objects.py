#!/usr/bin/env python3
"""Start a private, pinned S3-compatible SeaweedFS service (no public ports)."""
import os,secrets,subprocess,json
from pathlib import Path
base=Path('/data/keyantong/storage-secrets');file=base/'s3-identities.json'
if file.exists():raise SystemExit('Object credentials already exist; reuse service')
base.mkdir(mode=0o700,parents=True,exist_ok=True)
def write(p,s):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as out:out.write(s)
identities=[]
for name,bucket,actions in [('admin',None,['Admin','Read','Write','List','Tagging']),('production','keyantong-private',['Read','Write','List','Tagging']),('validation','keyantong-validation',['Read','Write','List','Tagging'])]:
 key='kt'+secrets.token_hex(12);secret=secrets.token_urlsafe(40)
 identities.append({'name':name,'credentials':[{'accessKey':key,'secretKey':secret}],'actions':[f'{a}:{bucket}' if bucket else a for a in actions]})
 write(base/f's3-{name}.env',f'S3_ENDPOINT=http://objects:8333\nS3_REGION=us-east-1\nS3_BUCKET={bucket or "keyantong-private"}\nS3_ACCESS_KEY_ID={key}\nS3_SECRET_ACCESS_KEY={secret}\n')
write(file,json.dumps({'identities':identities}))
subprocess.run(['sudo','install','-d','-m','700','/data/keyantong/objects'],check=True)
image='chrislusf/seaweedfs:4.28@sha256:d071979843142451d41566bc09f6adaa36902c112683d900a417247c82e9c3c1'
subprocess.run(['docker','run','-d','--name','keyantong-objects','--restart','unless-stopped','--network','keyantong_kt','--network-alias','objects','-v','/data/keyantong/objects:/data','-v',str(file)+':/etc/seaweedfs/s3.json:ro',image,'server','-dir=/data','-ip=objects','-ip.bind=0.0.0.0','-filer','-s3','-s3.config=/etc/seaweedfs/s3.json','-master.volumeSizeLimitMB=1024','-volume.max=20'],check=True)
print('Started private S3 storage with separate administrator and bucket-scoped runtime credentials')
