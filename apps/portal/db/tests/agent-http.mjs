import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
const base=process.env.TEST_PORTAL_URL;
if(!base?.includes('portal-validation'))throw new Error('Isolated validation endpoint required');
const suffix=randomUUID(); let checks=0;
async function post(path,body,cookie){return fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body),redirect:'manual'});}
async function ok(r,status=200){const d=await r.json();assert.equal(r.status,status,d.error);return d;}
async function account(prefix){const email=`${prefix}-${suffix}@example.edu`,password=randomUUID();const reg=await ok(await post('/api/auth/register',{email,password}));await ok(await post('/api/auth/verify',{email,code:reg.devCode}));const login=await post('/api/auth/login',{email,password,deviceId:randomUUID()});assert.equal(login.status,200);const c=login.headers.getSetCookie().find(x=>x.startsWith('kt_user_session='))?.split(';')[0];assert.ok(c);return c;}
async function plan(message,context={},cookie){return ok(await post('/api/agent',{message,context},cookie));}
const nav=await plan('帮我找马铃薯基因组');assert.equal(nav.commands[0].workspace,'genomes');assert.match(nav.commands[0].query,/马铃薯/);checks++;
const config=await plan('MAF设为0.05，PCA设为3',{method:'gwas',workspace:'analysis'});assert.equal(config.commands[0].config.pcs,3);assert.equal(config.commands[0].config.maf,.05);checks++;
const blocked=await plan('我的马铃薯是四倍体，做GWAS',{method:'gwas'});assert.ok(blocked.commands.some(c=>c.type==='block_analysis'));checks++;
const noRun=await plan('如何开始GWAS分析？',{method:'gwas'});assert.ok(!noRun.commands?.some(c=>c.type==='run'));checks++;
const persona=await plan('今天实验失败了很难过',{activeAgent:'w_fixture'});assert.equal(persona.commands[0].type,'worker_chat');checks++;
const cookie=await account('agent-http'),other=await account('agent-other');
const resource=await plan(`我要贡献工具资源\n名称：对话验证资源\n官网：https://www.ncbi.nlm.nih.gov/?kt-agent=${suffix}\n用途：隔离验证自然语言投稿与确认\n分类：测试资源\n机构：Synthetic fixture\n输入：蛋白序列\n输出：预测结果\n步骤：此条目仅用于隔离测试，验证对话草稿、审核队列与幂等确认流程，不是真实科研资源。\n访问要求：测试访问\n许可：测试许可\n来源：https://www.ncbi.nlm.nih.gov/`,{},cookie);
assert.ok(resource.ticket,resource.reply);assert.equal(resource.confirmation,'确认提交');checks++;
assert.equal((await post('/api/agent/confirm',{ticket:resource.ticket,confirmation:'随便'},cookie)).status,400);assert.equal((await post('/api/agent/confirm',{ticket:resource.ticket,confirmation:'确认提交'},other)).status,400);checks++;
const confirmations=await Promise.all(Array.from({length:5},()=>post('/api/agent/confirm',{ticket:resource.ticket,confirmation:'确认提交'},cookie).then(r=>ok(r))));assert.ok(confirmations.every(x=>x.reply===confirmations[0].reply));
const mine=await ok(await fetch(base+'/api/resources/mine',{headers:{cookie}}));assert.equal(mine.resources.filter(r=>r.url.includes(suffix)).length,1);checks++;
const tampered=resource.ticket.slice(0,-4)+'xxxx';assert.equal((await post('/api/agent/confirm',{ticket:tampered,confirmation:'确认提交'},cookie)).status,400);checks++;
const draft=await plan('我要发帖\n标题：对话验证科研日常\n正文：这是隔离环境合成测试，用于确认对话发布和防止重复执行。',{},cookie);assert.ok(draft.ticket,draft.reply);
const published=await ok(await post('/api/agent/confirm',{ticket:draft.ticket,confirmation:'确认发布'},cookie));const replay=await ok(await post('/api/agent/confirm',{ticket:draft.ticket,confirmation:'确认发布'},cookie));assert.deepEqual(published,replay);const id=published.commands[0].id;checks++;
const response=await plan('回复：谢谢分享，这是隔离环境中的回应验证。',{postId:id,workspace:'post'},other);assert.ok(response.ticket,response.reply);await ok(await post('/api/agent/confirm',{ticket:response.ticket,confirmation:'确认发布'},other));await ok(await post('/api/agent/confirm',{ticket:response.ticket,confirmation:'确认发布'},other));const detail=await ok(await fetch(base+'/api/community/posts/'+id,{headers:{cookie}}));assert.equal(detail.post.responses.length,1);checks++;
if(process.env.TEST_COMPUTE==='1'){
 for(const [method,id,names] of [['gwas','gwas.plink-linear.v1',['genotypes.csv','phenotypes.csv']],['bsaseq','bsa.delta.v1',['counts.csv']]]){
  const intent=await plan('开始分析',{method,workspace:'analysis',attachments:names.map(name=>({id:name,name,size:20,role:name}))},cookie);assert.ok(intent.commands.some(c=>c.type==='run'&&c.method===method));
  const fd=new FormData();fd.set('method',id);fd.set('config',method==='gwas'?JSON.stringify(config.commands[0].config):'{}');fd.set('acknowledged','true');
  for(const name of names)fd.set(name,new Blob([await fs.readFile('/fixtures/'+name)]),name);
  const job=await ok(await fetch(base+'/api/analysis/jobs',{method:'POST',headers:{cookie},body:fd}),202);
  let state;for(let n=0;n<50;n++){const jobs=await ok(await fetch(base+'/api/analysis/jobs?id='+job.id,{headers:{cookie}}));state=jobs.jobs[0];if(['succeeded','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,1000));}
  assert.equal(state.status,'succeeded',state.last_error);const zip=await fetch(base+'/api/analysis/jobs/'+job.id+'/download',{headers:{cookie}});assert.equal(zip.status,200);const receipt=await ok(await fetch(base+'/api/agent/jobs?id='+job.id,{headers:{cookie}}));assert.match(receipt.jobs[0].text,/已完成/);assert.equal(receipt.jobs[0].download.url,'/api/analysis/jobs/'+job.id+'/download');assert.deepEqual((await ok(await fetch(base+'/api/agent/jobs?id='+job.id,{headers:{cookie:other}}))).jobs,[]);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');assert.equal((await fetch(base+'/api/analysis/jobs/'+job.id+'/download',{headers:{cookie:other}})).status,404);checks++;
 }
}
const secret=await plan('密码：not-a-real-credential');assert.ok(!secret.commands);checks++;
console.log(JSON.stringify({ok:true,checks,freeRouting:true,parameterExtraction:true,unsupportedModelBlocked:true,signedUserBoundConfirmation:true,concurrentReplaySafe:true,privateValidationOnly:true}));
