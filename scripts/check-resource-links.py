#!/usr/bin/env python3
"""Curated maintainer-only URL audit. Never run this on user submissions."""
import concurrent.futures,json,urllib.request,urllib.error,html,re,sys
from pathlib import Path
rows=json.loads(Path(sys.argv[1]).read_text())
def check(row):
 try:
  req=urllib.request.Request(row['url'],headers={'User-Agent':'KeyanTong-resource-audit/1.0 (curated directory link check)'})
  with urllib.request.urlopen(req,timeout=18) as r:
   raw=r.read(90000).decode('utf-8','replace');match=re.search(r'<title[^>]*>(.*?)</title>',raw,re.I|re.S)
   return dict(id=row['id'],name=row['content']['name'],url=row['url'],status=r.status,finalUrl=r.url,title=html.unescape(re.sub(r'\s+',' ',match.group(1))).strip()[:200] if match else '')
 except Exception as e:return dict(id=row['id'],name=row['content']['name'],url=row['url'],status=getattr(e,'code',None),error=type(e).__name__)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(check,rows))
Path(sys.argv[2]).write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'total':len(results),'reachable':sum(r.get('status',0)==200 for r in results),'needsReview':[{'name':r['name'],'status':r['status']} for r in results if r.get('status')!=200]},ensure_ascii=False))
