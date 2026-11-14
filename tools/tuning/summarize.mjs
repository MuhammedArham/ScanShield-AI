import { readFile } from 'node:fs/promises';
import { Detector } from '../../dist/src/detector.js';
import { redact } from '../../dist/src/redact.js';
import { createHash } from 'node:crypto';
const replayEngine=process.argv.includes('--replay-engine');
const files=process.argv.slice(2).filter(arg=>arg!=='--replay-engine');
if (!files.length) throw new Error('Provide report paths');
const reports=await Promise.all(files.map(async file=>JSON.parse(await readFile(file,'utf8'))));
const cases=[...new Map((await Promise.all([...new Set(reports.map(r=>r.casesFile??'tools/tuning/cases.json'))].map(async path=>JSON.parse(await readFile(path,'utf8'))))).flat().map(c=>[c.id,c])).values()];
const seen=new Set();
const rows=reports.flatMap(report=>report.results).filter(row=>{
  const key=`${row.id}:${row.repeat}`;
  if(seen.has(key))throw new Error(`Duplicate case ${key}`);
  seen.add(key);return true;
});
const valid=rows.filter(row=>row.assessment);
if(replayEngine)for(const row of rows){
  const c=cases.find(c=>c.id===row.id);
  const detector=new Detector({provider:{source:'cerebras',async assess(){if(!row.assessment)throw new Error('Recorded failure');return row.assessment;}}});
  c.turns.forEach((text,i)=>detector.ingest({callId:c.id,sequence:i+1,segment:{id:`s${i+1}`,speaker:c.speakers?.[i]??'track-a',startedAtMs:i*2000,endedAtMs:i*2000+1500,text:redact(text),final:true}}));
  const result=await detector.flush(c.id);
  row.currentEngine={severity:result.severity,categories:result.categories,evidenceSegmentIds:result.evidence.map(s=>s.id),providerHealth:result.processingHealth.provider};
  const failures=[];
  if(!c.levels.includes(result.severity))failures.push('severity');
  for(const category of c.require??[])if(!result.categories.includes(category))failures.push(`missing:${category}`);
  for(const category of c.forbid??[])if(result.categories.includes(category))failures.push(`unsupported:${category}`);
  for(const id of c.evidence??[])if(!row.currentEngine.evidenceSegmentIds.includes(id))failures.push(`missing-evidence:${id}`);
  row.currentEngineFailures=failures;
}
const latency=valid.map(row=>row.latencyMs).sort((a,b)=>a-b);
const benign=row=>cases.find(c=>c.id===row.id)?.levels.every(level=>['none','low'].includes(level));
const warning=assessment=>['high','critical'].includes(assessment?.severity);
const summarize=(field,failures)=>({
  evaluated:rows.filter(row=>row[field]).length,
  passed:rows.filter(row=>row[field]&&row[failures]?.length===0).length,
  falseWarnings:rows.filter(row=>benign(row)&&warning(row[field])).map(row=>row.id),
  failed:rows.filter(row=>row[field]&&row[failures]?.length).map(row=>({id:row.id,failures:row[failures]}))
});
console.log(JSON.stringify({files,promptHashes:[...new Set(reports.map(r=>r.promptSha256))],attempted:rows.length,providerOrValidationErrors:rows.filter(row=>!row.assessment).map(row=>({id:row.id,httpStatus:row.httpStatus})),modelOnly:summarize('assessment','failures'),ruleAssisted:summarize('ruleAssisted','ruleAssistedFailures'),currentEngine:replayEngine?{...summarize('currentEngine','currentEngineFailures'),rulesSha256:createHash('sha256').update(await readFile('dist/src/rules.js')).digest('hex'),limitations:'Cached model output replay, no new inference. Severity/category/required-evidence gates only; model uncertainty and narrative checks are reported under modelOnly.'}:undefined,latencyMs:{p50:latency[Math.ceil(latency.length*.5)-1]??null,p95:latency[Math.ceil(latency.length*.95)-1]??null,over2500:latency.filter(value=>value>2500).length}},null,2));
