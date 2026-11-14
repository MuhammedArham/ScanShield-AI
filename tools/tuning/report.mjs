import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { systemPrompt } from '../../dist/src/provider.js';
const entries=[
 ['Baseline development','baseline-dev-complete'],
 ['Candidate 02 development','candidate-02-dev'],
 ['Candidate 03 development','candidate-03-low-dev'],
 ['Baseline withheld','baseline-withheld'],
 ['Candidate 03 withheld','candidate-03-withheld'],
 ['Baseline added call scenarios','baseline-robustness'],
 ['Candidate 03 added call scenarios','candidate-03-robustness']
];
const summaries=[];
for(const [name,round]of entries){
 const path=`docs/tuning/${round}.json`;
 const r=JSON.parse(await readFile(path,'utf8'));
 const expected=round.includes('robustness')?12:round.includes('withheld')?16:24;
 if(r.cases!==expected)throw new Error(`Incomplete round ${round}`);
 const summary=spawnSync(process.execPath,['tools/tuning/summarize.mjs',path,'--replay-engine'],{encoding:'utf8'});
 if(summary.status!==0)throw new Error(`Failed summary ${round}`);
 summaries.push({name,round,...JSON.parse(summary.stdout)});
}
const ledger=JSON.parse(await readFile('docs/tuning/budget.json','utf8'));
const initial=[['baseline-dev:dev-bank-claim:1',5006],['baseline-dev:dev-otp-neutral:1',5001],['baseline-dev:dev-bank-otp:1',5443]];
if(ledger.authorizedMicros!==3000000||initial.some(([label,reservedMicros],i)=>ledger.attempts[i]?.label!==label||ledger.attempts[i]?.reservedMicros!==reservedMicros||ledger.attempts[i]?.status!=='error'))throw new Error('Original ledger reservations changed');
const reserved=ledger.attempts.reduce((sum,a)=>sum+a.reservedMicros,0)/1e6;
if(reserved>3)throw new Error('Budget exceeded');
const usage=ledger.attempts.reduce((sum,a)=>sum+(a.estimatedUsd??0),0);
const selected=(await readFile('tools/tuning/prompt-candidate-03.txt','utf8')).trim();
if(systemPrompt!==selected)throw new Error('Production prompt differs from the frozen selected prompt');
const adoption={promoted:true,productionPromptSha256:createHash('sha256').update(systemPrompt).digest('hex'),selectedCandidate:'docs/tuning/selection.json',reason:'Promoted the frozen Candidate 03 prompt and low reasoning effort for gpt-oss-120b. Development gates improved 20/24 to 24/24, withheld 13/16 to 14/16, and added call scenarios 9/12 to 10/12. The baseline incorrectly warned on a refused past incident and downgraded the staged OTP case; the candidate corrected both and introduced no benign high/critical warning or dangerous severity miss. Category regressions on gift-card payment and investment secrecy, plus uncertainty/citation gaps, remain explicit limitations. The decision favors observed warning behavior across all suites and does not establish statistical superiority. Retain the two rule fixes. No prompt tuning used the withheld outputs.'};
await writeFile('docs/tuning/adoption.json',JSON.stringify(adoption,null,2)+'\n');
await writeFile('docs/tuning/comparison.json',JSON.stringify({summaries,budget:{authorizedUsd:3,attempts:ledger.attempts.length,reservedUsd:reserved,knownUsageEstimatedUsd:usage,unknownUsageAttempts:ledger.attempts.filter(a=>a.estimatedUsd===undefined).length,truncatedResponses:ledger.attempts.filter(a=>a.finishReason==='length').length},adoption},null,2)+'\n');
const lines=[
 '# Cerebras improvement loop results',
 '',
 'The live loop is complete. Authenticated connectivity passed before inference. Production now uses the frozen selected Candidate 03 prompt and low reasoning effort for gpt-oss-120b. Other models keep their existing reasoning defaults. Two narrow rule fixes remain applied: own-app code entry is distinguished from disclosure, and explicitly refused historical requests are distinguished from active clauses.',
 '',
 '| Round | Strict model gates | Engine replay gates | Benign high/critical model warnings | p95 request latency |',
 '| --- | --- | --- | --- | --- |',
 ...summaries.map(s=>`| ${s.name} | ${s.modelOnly.passed}/${s.attempted} | ${s.currentEngine.passed}/${s.attempted} | ${s.modelOnly.falseWarnings.length} | ${s.latencyMs.p95?.toFixed(1)} ms |`),
 '',
 'Model gates include local validation, severity, required/forbidden categories, evidence, uncertainty and limited narrative checks. Current-engine replay gates cover severity, required/forbidden categories and required evidence only, using cached model output and the same final engine build for both configurations. These columns are different metrics. Engine replay makes no extra API calls and does not establish causal per-turn or end-to-end audio latency. Passing counts include failures and unavailable model responses in the denominator.',
 '',
 'The development baseline combines five earlier valid baseline-dev-resume responses with 19 baseline-dev-paced responses; original errors remain in their reports and ledger. Baseline prompt hashes match. Candidate 02 was rejected at 20/24, including one 800-token truncation. Candidate 03 combined a revised prompt with low reasoning effort; causal contributions of these changes were not isolated. It passed 24/24 development gates and was frozen in selection.json before the withheld comparison. No prompt was revised after observing withheld results.',
 '',
 'The baseline withheld failures were overstated conclusion (gift cards), unsupported urgency (login approval), and missing earlier evidence (six-digit code). Candidate 03 corrected those checks but omitted payment_redirection for the gift-card attack and secrecy_isolation for the secret investment. Both still received high/critical risk severity; they are category regressions, not completely missed dangerous calls. The payment rule recovers the gift-card category. A one-case aggregate gain on sixteen checks does not establish statistical superiority. Adoption additionally considers the improved ordinary-call and staged-attack behavior; the remaining category gaps are not treated as resolved.',
 '',
 'Added call scenarios contain six normal multi-turn calls and three harmless-to-harmful scam pairs, assessed as independent prefixes/full transcripts. Candidate 03 kept all six normal calls at none and detected all three harmful completions, but strict model gates passed only 10/12 due to a missing uncertainty flag and a missing earlier tool citation. The initial rule-assisted snapshot falsely warned on a refused historical quote. Its raw report remains unchanged; regression-tested corrected-engine replay removes that false warning. See robustness.md and the baseline robustness report for both model configurations.',
 '',
 '## Memory and scope',
 '',
 'Conversation context is maintained in the engine, not a provider session. The default is the latest 40 ordinary segments plus unassessed segments and retained warning evidence. Tests verify cross-turn context, call isolation, ordinary-history expiry, and warning-evidence retention. There is no full-call persistent memory or summary. An early harmless setup can age out, so later pronouns can lose their antecedent. See context-memory.md and tests/context-memory.test.ts.',
 '',
 'These are synthetic transcript checks, not actual telephone calls, speech-to-text tests, calibrated probabilities or validated production accuracy. Each configuration was sampled once per fixture; a single repeat is stochastic, small, and not a statistical demonstration of generalization. Quoted-speech handling and redaction remain limited heuristics. Speaker labels do not verify identity. Successful request latency excludes pacing and audio/STT/upstream delivery; production latency remains unestablished.',
 '',
 '## Budget and verification',
 '',
 `The original US$3 cumulative authorization and all three original error reservations are preserved. ${ledger.attempts.length} cumulative attempts reserve US$${reserved.toFixed(6)}. Known-usage list-price estimate is US$${usage.toFixed(7)}; ${ledger.attempts.filter(a=>a.estimatedUsd===undefined).length} attempts have unknown usage. Actual account billing is unavailable. No reservations were refunded or reset.`,
 '',
 'The paced runs use at least 13 seconds between requests and stop on the first HTTP 429, preserving Retry-After guidance and reservations. Reports cannot overwrite prior evidence. The budget guard retains the 300-request and US$3 hard limits. No further 429 occurred during the paced rounds.',
 '',
 'Build and type checking passed; all 79 tests across 11 test files passed. The configured system prompt matches the frozen selected prompt exactly; its reasoning setting is covered by an injected-transport regression test. New regression tests cover immediate rate-limit stopping, durable reservation retention, report protection, lock cleanup, false alarms, retained unsafe continuations and context limits.',
 '',
 'Further prompt work should start with fresh development and withheld cases, especially gift-card/payment categorization, unsafe secrecy, uncertainty and provenance. Full-call memory is tracked separately in .scratch/risk-detector-tuning/issues/02-full-call-context.md. Do not claim these remaining gaps are resolved.'
];
await writeFile('docs/tuning/results.md',lines.join('\n')+'\n');
console.log(JSON.stringify({reservedUsd:reserved,knownUsageEstimatedUsd:usage,attempts:ledger.attempts.length,promoted:true,summaries:summaries.map(s=>({round:s.round,modelPassed:s.modelOnly.passed,enginePassed:s.currentEngine.passed,cases:s.attempted}))},null,2));
