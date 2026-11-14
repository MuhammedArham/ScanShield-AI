import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Detector } from '../../dist/src/detector.js';
import { cerebrasProvider } from '../../dist/src/provider.js';
import { Assessment } from '../../dist/src/schema.js';
import { redact } from '../../dist/src/redact.js';
import { createBudgetTransport, readVerificationLedger } from '../../dist/src/verification.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i=args.indexOf(name);return i<0?fallback:args[i+1]; };
if (!args.includes('--live')) throw new Error('Explicit --live authorization required');
const round = option('--round', '');
const split = option('--split', 'dev');
const promptFile = option('--prompt', 'tools/tuning/prompt-baseline.txt');
const casesFile = option('--cases', 'tools/tuning/cases.json');
const effort = option('--effort', 'default');
const temperature = option('--temperature', 'default');
const repeats = Number(option('--repeats', '1'));
const limit = Number(option('--limit', '999'));
const offset = Number(option('--offset', '0'));
const intervalMs = Number(option('--interval-ms', '13000'));
if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(intervalMs) || intervalMs < 13000 || intervalMs > 60000) throw new Error('Invalid pacing or offset');
if (!/^[a-z0-9-]{1,60}$/.test(round) || !['dev','check'].includes(split) || !['default','low','medium','high'].includes(effort) || !['default','0','0.1','0.2'].includes(temperature) || !Number.isInteger(repeats) || repeats<1 || repeats>3 || !Number.isInteger(limit) || limit<1) throw new Error('Invalid verification arguments');
if (!process.env.CEREBRAS_API_KEY?.trim() || process.env.CEREBRAS_MODEL !== 'gpt-oss-120b') throw new Error('Verification requires the configured gpt-oss-120b and API key');
await mkdir('docs/tuning', { recursive:true });
const lock=await open('docs/tuning/budget.lock','wx');
try {
const path=`docs/tuning/${round}.json`;
// Never overwrite previous evidence or silently replay a partially completed round.
const reportHandle = await open(path, 'wx'); await reportHandle.close();
let currentLabel='';
const results=[];
const rawPrompt=await readFile(promptFile,'utf8');
const prompt=rawPrompt.trim();
const digest=createHash('sha256').update(prompt).digest('hex');
const cases=JSON.parse(await readFile(casesFile,'utf8')).filter(c=>c.split===split).slice(offset,offset+limit);
const ledgerPath='docs/tuning/budget.json';
let lastHttpStatus;
let retryAfterMs;
let nextRequestAt = Date.now() + intervalMs;
function grade(c,a) {
  const failures=[];
  if(!c.levels.includes(a.severity))failures.push('severity');
  for(const required of c.require??[])if(!a.categories.includes(required))failures.push(`missing:${required}`);
  for(const forbidden of c.forbid??[])if(a.categories.includes(forbidden))failures.push(`unsupported:${forbidden}`);
  for(const id of c.evidence??[])if(!a.evidenceSegmentIds.includes(id))failures.push(`missing-evidence:${id}`);
  if(a.evidenceSegmentIds.some(id=>!c.turns.some((_,i)=>id===`s${i+1}`)))failures.push('unknown-evidence');
  const references=[...(a.explanation+' '+a.recommendedAction).matchAll(/\bs\d+\b/g)].map(m=>m[0]);
  if(references.some(id=>!a.evidenceSegmentIds.includes(id)))failures.push('uncited-narrative-evidence');
  if(c.uncertain&&!a.insufficientEvidence)failures.push('missing-uncertainty');
  if(['high','critical'].includes(a.severity)&&(a.insufficientEvidence||!a.categories.length||!a.evidenceSegmentIds.length))failures.push('unsupported-warning');
  if(/\b(?:confirms? (?:the )?success|confirming (?:the )?success|proves? (?:the )?(?:scam|fraud)|definitely (?:a )?(?:scam|fraud)|victim complies|successful manipulation|speaker impersonates|caller impersonates)\b/i.test(a.explanation))failures.push('overstated-conclusion');
  return [...new Set(failures)];
}
function summary(){
  const ledger=readVerificationLedger(ledgerPath);
  const times=results.filter(r=>r.assessment).map(r=>r.latencyMs).sort((a,b)=>a-b);
  return {round,split,model:'gpt-oss-120b',promptFile,promptSha256:digest,casesFile,effort,temperature,repeats,offset,intervalMs,
    cases:results.length,passed:results.filter(r=>r.failures.length===0).length,
    failed:results.filter(r=>r.failures.length).map(r=>({id:r.id,failures:r.failures})),
    latencyMs:{count:times.length,p95:times.length?times[Math.ceil(times.length*.95)-1]:null,overProductionTimeout:times.filter(t=>t>2500).length},
    budget:{authorizedUsd:3,cumulativeAttempts:ledger.attempts.length,cumulativeReservedUsd:ledger.attempts.reduce((s,a)=>s+a.reservedMicros,0)/1e6,
      cumulativeUsageEstimatedUsd:ledger.attempts.reduce((s,a)=>s+(a.estimatedUsd??0),0),unknownUsageAttempts:ledger.attempts.filter(a=>a.estimatedUsd===undefined).length},
    limitations:'Synthetic literal-label checks, not human-validated production accuracy or probability calibration. Usage estimates use public list rates; actual account billing unavailable. Reservations are conservative and never refunded.',results};
}
  if (!cases.length) throw new Error('No cases selected');
  // Exclusive ledger lock prevents simultaneous phase runs. Never retry paid calls.
  const budgetTransport=createBudgetTransport({ledgerPath,label:()=>currentLabel});
  const transform=async(url,init)=>{
    const body=JSON.parse(init.body);body.messages[0].content=prompt;
    delete body.reasoning_effort;
    if(effort!=='default')body.reasoning_effort=effort;
    if(temperature!=='default')body.temperature=Number(temperature);
    const response = await budgetTransport(url,{...init,body:JSON.stringify(body)});
    lastHttpStatus = response.status;
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now());
      if (!Number.isFinite(retryAfterMs)) retryAfterMs = undefined;
    }
    return response;
  };
  const provider=cerebrasProvider(process.env.CEREBRAS_API_KEY,'gpt-oss-120b',transform,10000);
  let consecutiveErrors=0;
  for(let repeat=0;repeat<repeats;repeat++)for(const c of cases){
    await delay(Math.max(0,nextRequestAt-Date.now()));
    nextRequestAt=Date.now()+intervalMs;
    lastHttpStatus=undefined;retryAfterMs=undefined;
    currentLabel=`${round}:${c.id}:${repeat+1}`;
    const segments=c.turns.map((text,i)=>({id:`s${i+1}`,speaker:c.speakers?.[i]??'track-a',startedAtMs:i*2000,endedAtMs:i*2000+1500,text:redact(text),final:true}));
    const start=performance.now();let assessment=null,failures=[];
    try {assessment=Assessment.parse(await provider.assess(segments));failures=grade(c,assessment);consecutiveErrors=0;}
    catch { failures=['provider-or-validation-error'];consecutiveErrors++; }
    const latencyMs=performance.now()-start;
    const attempt=readVerificationLedger(ledgerPath).attempts.at(-1);
    // Replay the cached assessment through the actual engine: no extra API request.
    const detector=new Detector({provider:{source:'cerebras',async assess(){if(!assessment)throw new Error('Recorded provider failure');return assessment;}}});
    segments.forEach((segment,i)=>detector.ingest({callId:c.id,sequence:i+1,segment}));
    const combined=await detector.flush(c.id);
    const ruleAssisted={severity:combined.severity,categories:combined.categories,evidenceSegmentIds:combined.evidence.map(s=>s.id),explanation:combined.explanation,recommendedAction:combined.recommendedAction,insufficientEvidence:!combined.warnings.length,providerHealth:combined.processingHealth.provider};
    results.push({id:c.id,repeat:repeat+1,latencyMs,assessment,failures,httpStatus:lastHttpStatus,retryAfterMs,finishReason:attempt?.label===currentLabel?attempt.finishReason:undefined,ruleAssisted,ruleAssistedFailures:grade(c,ruleAssisted)});
    const report=summary();await writeFile(path,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({round,id:c.id,passed:failures.length===0,failures,reservedUsd:report.budget.cumulativeReservedUsd,usageEstimatedUsd:report.budget.cumulativeUsageEstimatedUsd}));
    if(attempt?.label!==currentLabel)throw new Error('Request refused before reservation; stopped without another send');
    if(attempt.usageExceededReservation)throw new Error('Usage exceeded reservation; stopped for budget review');
    if(lastHttpStatus===429)throw new Error(`Stopped immediately on HTTP 429; retry after at least ${retryAfterMs??60000} ms. Reservation retained.`);
    if(lastHttpStatus===401||lastHttpStatus===403)throw new Error('Stopped on authentication or permission failure');
    if(consecutiveErrors>=3)throw new Error('Stopped after three consecutive provider errors or budget refusals');
  }
  const report=summary();console.log(JSON.stringify({completed:round,cases:report.cases,passed:report.passed,budget:report.budget,latencyMs:report.latencyMs}));
} finally {await lock.close();await unlink('docs/tuning/budget.lock');}
