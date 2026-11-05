"""PostgreSQL-authoritative CPU worker. Bounded jobs, private objects, fencing tokens."""
from __future__ import annotations
import os,json,time,uuid,hashlib,base64,tempfile,subprocess,signal,zipfile
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
import boto3
from botocore.config import Config
REGISTRY=Path(os.getenv('OMICS_METHOD_REGISTRY','/opt/omics/methods.json'))
METHODS={m['id']:set(m['files']) for m in json.loads(REGISTRY.read_text())['methods']}
STOP=False
def stop(*_):
 global STOP;STOP=True
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
def db():return psycopg.connect(os.environ['DATABASE_WORKER_URL'],row_factory=dict_row,connect_timeout=5)
def storage():return boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT'],region_name=os.getenv('S3_REGION','us-east-1'),aws_access_key_id=os.environ['S3_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['S3_SECRET_ACCESS_KEY'],config=Config(signature_version='s3v4',connect_timeout=10,read_timeout=30,s3={'addressing_style':'path'}))
def claim():
 with db() as c:
  c.execute('SELECT pg_advisory_xact_lock(727411305)')
  if c.execute("SELECT paused FROM kt_ops.execution_control WHERE name='omics'").fetchone()['paused']:return None
  c.execute("UPDATE kt_ops.tasks SET status='failed',last_error='数据准备未完成，请重新提交',updated_at=now() WHERE kind='omics.prepare' AND status='queued' AND created_at<now()-interval '30 minutes'")
  c.execute("UPDATE kt_ops.tasks SET status='failed',lease_token=NULL,lease_until=NULL,last_error='任务重试次数已用尽',updated_at=now() WHERE kind='omics' AND status='running' AND lease_until<now() AND attempts>=max_attempts")
  return c.execute("WITH q AS (SELECT id FROM kt_ops.tasks WHERE kind='omics' AND (status='queued' OR (status='running' AND lease_until<now())) AND attempts<max_attempts ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE kt_ops.tasks t SET status='running',attempts=attempts+1,lease_token=%s,lease_until=now()+interval '2 minutes',updated_at=now() FROM q WHERE t.id=q.id RETURNING t.*",(uuid.uuid4(),)).fetchone()
def heartbeat(job):
 with db() as c:return c.execute("UPDATE kt_ops.tasks SET lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=%s AND lease_token=%s AND status='running' AND lease_until>now()",(job['id'],job['lease_token'])).rowcount==1

def process(job):
 s3=storage();params=job['parameters'];method=params['method'];files=params['files']
 if method not in METHODS or set(files)!=METHODS[method]:raise ValueError('分析方法或输入清单无效')
 with tempfile.TemporaryDirectory(prefix='kt-omics-') as tmp:
  root=Path(tmp);inputs=root/'inputs';inputs.mkdir();output=root/'output'
  with db() as c:
   c.execute("SELECT set_config('kt.actor_id',%s,true)",(job['owner_id'],))
   for name,oid in files.items():
    r=c.execute("SELECT * FROM kt_storage.objects WHERE id=%s AND owner_id=%s AND state='ready'",(oid,job['owner_id'])).fetchone()
    if not r or r['size_bytes']>12*1024*1024:raise ValueError('输入文件不可用或超过在线限制')
    body=s3.get_object(Bucket=r['bucket'],Key=r['object_key'],**({'VersionId':r['object_version']} if r['object_version'] else {}))['Body'].read(12*1024*1024+1)
    if len(body)!=r['size_bytes'] or hashlib.sha256(body).hexdigest()!=r['sha256']:raise ValueError('输入文件完整性校验失败')
    (inputs/name).write_bytes(body)
  cmd=['python','-m','keyantong_omics.run','--method',method,'--input',str(inputs),'--output',str(output),'--config',json.dumps(params['config'])]
  log=root/'process.log'
  with log.open('w') as f:
   p=subprocess.Popen(cmd,stdout=f,stderr=f,start_new_session=True);start=time.monotonic();last=start
   try:
    while p.poll() is None:
     time.sleep(.5);now=time.monotonic()
     if STOP or now-start>1200 or (now-last>=20 and not heartbeat(job)):
      os.killpg(p.pid,signal.SIGTERM)
      try:p.wait(timeout=5)
      except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
      raise ValueError('任务超时、已取消或执行租约失效，请重试')
     if now-last>=20:last=now
   finally:
    if p.poll() is None:
     os.killpg(p.pid,signal.SIGTERM)
     try:p.wait(timeout=5)
     except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
  if p.returncode:
   message='分析未完成，请核对数据格式、样本匹配和统计模型'
   for line in log.read_text(errors='replace').splitlines():
    try:
     parsed=json.loads(line)
     if isinstance(parsed,dict) and isinstance(parsed.get('error'),str):message=parsed['error'][:450]
    except json.JSONDecodeError:pass
   raise ValueError(message)
  if not heartbeat(job):raise ValueError('任务执行租约失效')
  summary=json.loads((output/'summary.json').read_text());archive=root/'results.zip'
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
   for file in output.rglob('*'):
    if file.is_file():z.write(file,file.relative_to(output))
  data=archive.read_bytes();digest=hashlib.sha256(data).hexdigest();oid=uuid.uuid4();key=f'users/{hashlib.sha256(job["owner_id"].encode()).hexdigest()}/results/{oid}.zip';bucket=os.environ['S3_BUCKET']
  result=s3.put_object(Bucket=bucket,Key=key,Body=data,ContentType='application/zip',ChecksumSHA256=base64.b64encode(bytes.fromhex(digest)).decode())
  with db() as c:
   c.execute("SELECT set_config('kt.actor_id',%s,true)",(job['owner_id'],))
   current=c.execute("SELECT id FROM kt_ops.tasks WHERE id=%s AND lease_token=%s AND status='running' AND lease_until>now() FOR UPDATE",(job['id'],job['lease_token'])).fetchone()
   if not current:raise ValueError('任务执行租约失效')
   c.execute("INSERT INTO kt_storage.objects(id,owner_id,bucket,object_key,object_version,media_type,size_bytes,sha256,state) VALUES(%s,%s,%s,%s,%s,'application/zip',%s,%s,'ready')",(oid,job['owner_id'],bucket,key,result.get('VersionId'),len(data),digest))
   c.execute("UPDATE kt_ops.tasks SET status='succeeded',result_object_id=%s,parameters=parameters || jsonb_build_object('summary',%s::jsonb),lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=%s AND lease_token=%s",(oid,json.dumps(summary),job['id'],job['lease_token']))

def fail(job,message):
 with db() as c:c.execute("UPDATE kt_ops.tasks SET status='failed',last_error=%s,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=%s AND lease_token=%s AND status='running'",(message[:500],job['id'],job['lease_token']))

def main():
 print('[omics] worker ready; allowlisted CPU methods only',flush=True)
 while not STOP:
  job=None
  try:
   job=claim()
   if job:
    process(job);print('[omics] task completed',flush=True)
   else:time.sleep(2)
  except Exception as e:
   print('[omics] task or connection error: '+type(e).__name__,flush=True)
   if job:
    try:fail(job,str(e) if isinstance(e,ValueError) else '运行环境或存储暂时不可用，请重试')
    except Exception:pass
   time.sleep(2)
if __name__=='__main__':main()
