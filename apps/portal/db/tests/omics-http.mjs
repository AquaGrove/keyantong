import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const base=process.env.TEST_PORTAL_URL,admin=process.env.TEST_ADMIN_URL;
if(!base?.includes('portal-validation')||!admin?.includes('admin-validation'))throw new Error('Isolated test endpoints only');
const suffix=randomUUID();let checks=0;
async function post(url,body,cookie){return fetch(url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body),redirect:'manual'});}
async function result(r,status){const d=await r.json();assert.equal(r.status,status,d.error);return d;}
async function account(prefix){const email=`${prefix}-${suffix}@example.edu`,password=randomUUID();const reg=await result(await post(base+'/api/auth/register',{email,password}),200);await result(await post(base+'/api/auth/verify',{email,code:reg.devCode}),200);const login=await post(base+'/api/auth/login',{email,password,deviceId:randomUUID()});assert.equal(login.status,200);return login.headers.getSetCookie().find(c=>c.startsWith('kt_user_session='))?.split(';')[0];}
const cookie=await account('omics-http'),other=await account('other-http');checks++;
const content={name:'HTTP validation resource',summary:'隔离验证库的资源审核流程测试',category:'测试',provider:'Synthetic fixture',inputs:'蛋白序列',outputs:'预测结果',instructions:'此说明仅用于测试投稿、退回、修订、审核通过与下架，不是真实科研资源。',access:'测试访问',license:'测试许可',sourceUrl:'https://www.ncbi.nlm.nih.gov/'};
const resource={kind:'tool',url:`https://www.ncbi.nlm.nih.gov/?kt-http=${suffix}`,content};let row=await result(await post(base+'/api/resources',resource,cookie),201);
assert.ok(!(await(await fetch(base+'/api/resources')).json()).resources.some(r=>r.id===row.id));checks++;
const login=await post(admin+'/api/login',{password:process.env.TEST_ADMIN_PASSWORD});assert.equal(login.status,200);const admCookie=login.headers.getSetCookie().find(c=>c.startsWith('kt_admin_session='))?.split(';')[0];assert.ok(admCookie);
const queue=await result(await fetch(admin+'/api/resources',{headers:{cookie:admCookie},redirect:'manual'}),200);assert.ok(queue.resources.some(r=>r.id===row.id));checks++;
await result(await post(admin+'/api/resources',{id:row.id,version:1,decision:'rejected',note:'请补充输入格式和来源说明后重新提交',linkVerified:false},admCookie),200);checks++;
assert.equal((await post(base+'/api/resources',{...resource,id:row.id,version:2},other)).status,400);checks++;
row=await result(await post(base+'/api/resources',{...resource,id:row.id,version:2},cookie),201);assert.equal(row.version,3);checks++;
await result(await post(admin+'/api/resources',{id:row.id,version:3,decision:'published',note:'已核对合成测试资源，验证审核通过与公开流程',linkVerified:true},admCookie),200);assert.ok((await(await fetch(base+'/api/resources')).json()).resources.some(r=>r.id===row.id));checks++;
await result(await post(admin+'/api/resources',{id:row.id,version:4,decision:'withdrawn',note:'隔离测试完成，主动下架该合成测试条目',linkVerified:false},admCookie),200);
const jobs=[];
for(const method of ['bsa.delta.v1','gwas.plink-linear.v1']){
 const fd=new FormData();fd.set('method',method);fd.set('config','{}');fd.set('acknowledged','true');
 for(const name of method.startsWith('bsa')?['counts.csv']:['genotypes.csv','phenotypes.csv'])fd.set(name,new Blob([await fs.readFile('/fixtures/'+name)],{type:'text/csv'}),name);
 jobs.push(await result(await fetch(base+'/api/analysis/jobs',{method:'POST',headers:{cookie},body:fd}),202));
}
checks++;
for(const job of jobs){let state;for(let i=0;i<35;i++){const d=await result(await fetch(base+'/api/analysis/jobs?id='+job.id,{headers:{cookie}}),200);state=d.jobs[0];if(state.status==='succeeded'||state.status==='failed')break;await new Promise(r=>setTimeout(r,1000));}assert.equal(state.status,'succeeded',state.last_error);const zip=await fetch(base+`/api/analysis/jobs/${job.id}/download`,{headers:{cookie}});assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');assert.equal((await fetch(base+`/api/analysis/jobs/${job.id}/download`,{headers:{cookie:other}})).status,404);checks++;}
console.log(JSON.stringify({ok:true,httpChecks:checks,moderationRoundtrip:true,computedMethods:2,privateDownloads:true}));
