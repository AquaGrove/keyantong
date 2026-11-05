import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://keyantong-portal-validation:3000";
const post=(path,body,cookie)=>fetch(base+path,{method:"POST",headers:{"content-type":"application/json",...(cookie?{cookie}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
async function json(r){const d=await r.json();assert.ok(r.ok,d.error);return d;}
const semantic=await json(await post("/api/agent",{message:"我手头有两份表，一份按位点记录0/1/2剂量，另一份按样本记录株高。我想看哪些位点与株高有关，先别运行。"}));
assert.ok(semantic.commands?.some(x=>x.workspace==="analysis"&&x.method==="gwas"),JSON.stringify(semantic));
assert.ok(!semantic.commands.some(x=>x.type==="run"));
console.log("Real Harness recognizes GWAS; no execution requested");
const email="rna-loop-"+randomUUID()+"@example.edu",password=randomUUID();
const reg=await json(await post("/api/auth/register",{email,password}));
await json(await post("/api/auth/verify",{email,code:reg.devCode}));
const login=await post("/api/auth/login",{email,password,deviceId:randomUUID()});assert.ok(login.ok);
const cookie=login.headers.getSetCookie().find(x=>x.startsWith("kt_user_session=")).split(";")[0];
const context={method:"rnaseq",attachments:[{id:"m",name:"matrix.csv",size:100,role:"matrix"},{id:"g",name:"groups.csv",size:100,role:"groups"}]};
assert.ok((await json(await post("/api/agent",{message:"开始分析",context},cookie))).commands.some(x=>x.type==="run"));
const names=["C1","C2","C3","T1","T2","T3"];
const rows=Array.from({length:70},(_,i)=>["gene"+i,...names.map((_,j)=>40+i+(i%7===0&&j>2?30:0)+(i*(j+1)*7+j*11)%14)].join(","));
const matrix=["gene,"+names.join(","),...rows].join("\n");
const groups=["sample,group",...names.map((n,i)=>n+","+(i<3?"control":"treatment"))].join("\n");
const fd=new FormData();fd.set("matrix",new Blob([matrix]),"matrix.csv");fd.set("groups",new Blob([groups]),"groups.csv");fd.set("species","none");
const job=(await json(await fetch(base+"/api/tools/rnaseq",{method:"POST",headers:{cookie},body:fd}))).job;
let result;for(let i=0;i<35;i++){result=(await json(await fetch(base+"/api/agent/jobs?id="+job.id,{headers:{cookie}}))).jobs[0];if(result?.status==="succeeded"||result?.status==="failed")break;await new Promise(r=>setTimeout(r,1500));}
assert.equal(result?.status,"succeeded",result?.text);assert.match(result.text,/样本 6/);assert.ok(result.download);
const download=await fetch(base+result.download.url,{headers:{cookie}});assert.ok(download.ok);assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0,2).toString(),"PK");
console.log("RNAseq computed, conversation result summarizes sample count, ZIP verified");
