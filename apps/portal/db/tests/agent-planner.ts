import assert from 'node:assert/strict';
import {basicPlan,planConversation} from '../../src/lib/agent/planner';
import {signAction,verifyAction} from '../../src/lib/agent/tickets';
async function main(){
const c={workspace:'analysis' as const,method:'gwas' as const};
assert.equal(basicPlan('PCA设为3',c)?.params?.pcs,3);
assert.equal(basicPlan('MAF设为0.05，PCA设为3',c)?.params?.pcs,3);
assert.equal(basicPlan('四倍体GWAS',c)?.intent,'blocked_analysis');
assert.notEqual(basicPlan('如何开始GWAS',c)?.intent,'run');
assert.equal(basicPlan('开始分析',c)?.intent,'run');
assert.notEqual(basicPlan('先别运行GWAS分析',c)?.intent,'run');
assert.notEqual(basicPlan('运行GWAS可以吗？',c)?.intent,'run');
const missing=await planConversation('开始分析',c,{id:'test'},'fixture');assert.match(missing.reply,/基因型 CSV、连续表型 CSV/);assert.ok(!missing.commands?.some(x=>x.type==='run'));
const status=await planConversation('查看分析进度',{},null,'fixture');assert.equal(status.commands?.[0].type,'jobs_status');
assert.equal(basicPlan('帮我找马铃薯基因组',{})?.target,'genomes');
assert.equal(basicPlan('回到首页',{})?.target,'home');
assert.equal(basicPlan('移除第二个文件',c)?.ordinal,2);
const ticket=signAction('owner','post',{title:'测试'});assert.equal(verifyAction(ticket,'owner').payload.title,'测试');
assert.throws(()=>verifyAction(ticket,'other'));assert.throws(()=>verifyAction(ticket.slice(0,-4)+'xxxx','owner'));
assert.equal((await planConversation('今天实验失败了很难过',{activeAgent:'w_test'},null,'fixture')).commands?.[0].type,'worker_chat');
const guard=await planConversation('开始分析',{...c,blockedReason:'四倍体不适用'},null,'fixture');assert.equal(guard.reply,'四倍体不适用');assert.ok(!guard.commands);
console.log('PASS: routing, parameter extraction, model guard, worker delegation and signed confirmations');
}
main().catch(e=>{console.error(e);process.exitCode=1});
