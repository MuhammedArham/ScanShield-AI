import { request } from './transport.js';
const $ = id => document.getElementById(id);
const label = value => String(value).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const scenarios = [
  { name: 'Two-minute call · bank support escalation', type: '2 MIN · SYNTHETIC CALL', description: 'Ten turns: routine support develops into callback avoidance, urgency, secrecy, and an OTP request. No actual secret values.', turns: [
    ['caller','Good afternoon, this is Alex from your bank’s account support team. I am following up about a payment notification. Is this a convenient time for a quick conversation?'],
    ['customer','I have a couple of minutes. I noticed a notification earlier, but I have not checked it yet. What payment are you referring to?'],
    ['caller','Our system flagged an attempted online payment this morning. It may be nothing, but I would like to check whether you recognise it before we close the account review.'],
    ['customer','I bought groceries yesterday and paid an electricity bill. I do not remember making another payment. Should I call the number on my card?'],
    ['caller','There is no need to call another team. That would interrupt this review. Stay on the line with me; we only have a short window before your account is restricted.'],
    ['customer','I would rather check this independently. I can open my banking app using the usual shortcut. What exactly do you want me to do?'],
    ['caller','Open your banking app and look for a sign-in security text. I am going to run a verification step. Keep the message available, but do not read any numbers yet.'],
    ['customer','A message has arrived. It says the code is for signing in, and it warns me not to share it with anyone.'],
    ['caller','That warning is only for ordinary callers. Read the one-time passcode aloud to me now so I can cancel the payment. Do not discuss this review with your family; delays could freeze your account.'],
    ['customer','No, I am not sharing the code. I will end this call and contact the bank using the number printed on my card. Please do not call me again.']
  ] },
  { name: 'Normal call · clinic appointment', type: 'NORMAL CALL', description: 'A routine appointment confirmation. Expected: no unsafe request.', turns: [['caller','This is the clinic confirming your appointment on Thursday morning.'],['customer','Yes, ten oclock works for me.'],['caller','Bring your referral if you have it. You can call our published number if you have questions.']] },
  { name: 'Scam · bank verification code', type: 'STAGED SCAM', description: 'A claimed bank affiliation develops into an explicit OTP request.', turns: [['caller','Hello, I am calling from your bank.'],['customer','What is this call about?'],['caller','Please read me your OTP so I can check your account.']] },
  { name: 'Scam · gradual remote access', type: 'STAGED SCAM', description: 'A tool mention becomes a request to install it and conceal the session.', turns: [['caller','How has your day been? I can help with your slow laptop.'],['caller','Our diagnostic tool is TeamViewer.'],['caller','Keep this between us and install it so I can control your screen.']] },
  { name: 'Normal call · your own banking app', type: 'NORMAL CALL', description: 'Code entry in the user’s own app, without disclosing the secret.', turns: [['caller','Open the official app yourself using your usual shortcut.'],['customer','I have opened the banking app.'],['caller','Please enter the verification code inside that app. Do not read it to me.']] },
  { name: 'Scam · urgent payment transfer', type: 'PAYMENT SCAM', description: 'An urgent transfer to a new destination. Expected: a retained warning.', turns: [['caller','I am calling about protecting your account.'],['caller','Transfer your money to this new safe account immediately.'],['customer','I do not want to send any money.']] },
  { name: 'Normal call · reporting a past scam', type: 'REPORTED INCIDENT', description: 'A refused historical request, useful for testing false alarms.', turns: [['customer','I am reporting what happened yesterday, not asking you to do anything.'],['customer','The caller said, tell me your password. I refused and ended the call.'],['caller','Thank you for reporting it through the security team.']] },
];
let config, call, snapshot, turns = [], latency, diagnostic, queued = [], cursor = 0, busy = false, running = false;
let nextLiveAt = 0;
let replayToken = 0;
const mode = () => $('mode').value;
const cooldown = () => mode() === 'cerebras' ? Math.max(0, Math.ceil((nextLiveAt - Date.now()) / 1000)) : 0;

async function api(path, options = {}) {
  const response = await request(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (data.nextLiveAt) nextLiveAt = data.nextLiveAt; throw new Error(data.error ?? 'Request failed.'); }
  return data;
}
function notice(message) { $('notice').hidden = !message; $('notice').textContent = message ?? ''; }
function renderBudget(b) {
  if (!b) { $('budget-used').textContent = '$0'; $('budget-fill').style.width = '0%'; $('budget-detail').textContent = 'Rules run in this browser. No model requests, uploads, or API costs.'; return; }
  $('budget-used').textContent = `$${b.reservedUsd.toFixed(3)}`;
  $('budget-fill').style.width = `${Math.min(100, b.reservedUsd / b.authorizedUsd * 100)}%`;
  $('budget-detail').textContent = `$${b.remainingUsd.toFixed(3)} remaining · ${b.attempts}/300 attempts. Known usage estimate $${b.usageEstimatedUsd.toFixed(4)}; actual billing unavailable.`;
}
async function refreshConfig() {
  config = await api('/api/config'); nextLiveAt = Math.max(nextLiveAt, config.nextLiveAt);
  renderBudget(config.budget);
  $('mode').querySelector('[value=cerebras]').disabled = !config.liveConfigured;
  renderMode(); renderControls();
}
function renderMode() {
  const live = mode() === 'cerebras';
  $('mode-mock').classList.toggle('selected', !live); $('mode-live').classList.toggle('selected', live);
  $('mode-mock').setAttribute('aria-pressed', String(!live)); $('mode-live').setAttribute('aria-pressed', String(live));
  $('mode-title').textContent = live ? 'Cerebras connected · gpt-oss-120b' : (config?.publicMode ? 'Rules running in your browser' : 'Mock engine ready');
  $('mode-description').textContent = live ? 'Live inference. Shared $3 cap. At least 13 seconds between turns.' : 'Real detector and rules. Synthetic scores. No API spend.';
  $('model-chip').textContent = live ? 'GPT-OSS-120B · LOW EFFORT' : 'RULES + MOCK';
  $('score-disclaimer').textContent = live ? 'Raw model score × 100, not the probability of a scam. The latest score may be low while an earlier warning remains unresolved.' : 'A raw indicator score, not the probability of a scam. Mock mode uses a synthetic rule-derived score.';
}
function renderControls() {
  const wait = cooldown();
  $('send').disabled = busy || running || wait > 0 || !$('text').value.trim();
  $('send').textContent = busy ? 'Assessing…' : wait ? `Wait ${wait}s` : 'Assess turn ↗';
  $('next').disabled = busy || running || wait > 0 || cursor >= queued.length;
  $('play').disabled = !running && (busy || cursor >= queued.length);
  $('play').textContent = running ? 'Ⅱ Pause replay' : '▶ Run scenario';
  $('mode').disabled = busy || running; $('reset').disabled = busy;
  $('mode-mock').disabled = busy || running;
  $('mode-live').disabled = busy || running || !config?.liveConfigured;
  $('mode-live').title = config?.liveConfigured ? 'Use real Cerebras assessments within the existing $3 budget' : (config?.publicMode ? 'Live models are not available in this public prototype' : 'Cerebras key/model not detected on the server');
  $('load-scenario').disabled = busy || running; $('scenario').disabled = busy || running;
  $('queue-count').textContent = `${queued.length - cursor} queued turns`;
  $('replay-state').textContent = busy ? 'Assessing turn…' : wait ? `Live cooldown · ${wait}s` : running ? 'Replaying…' : cursor >= queued.length ? 'Scenario complete' : 'Ready when you are';
}
function renderTranscript() {
  if (!turns.length) return;
  const evidence = new Set(snapshot?.evidence.map(s => s.id));
  const list = $('transcript'); list.replaceChildren();
  turns.forEach(turn => {
    const item = node('article', `turn ${turn.speaker}${evidence.has(turn.id) ? ' evidence' : ''}`); item.id = `turn-${turn.id}`;
    const heading = node('div', 'turn-heading'); heading.append(node('span', 'avatar', turn.speaker === 'caller' ? 'A' : 'B'), node('strong', '', turn.speaker === 'caller' ? 'Caller · track A' : 'Customer · track B'));
    if (evidence.has(turn.id)) heading.append(node('span', 'evidence-label', 'EVIDENCE'));
    heading.append(node('span', 'turn-id', turn.id)); item.append(heading, node('p', '', turn.text)); list.append(item);
  });
  list.scrollTop = list.scrollHeight;
}
function renderSnapshot() {
  if (!snapshot) return;
  const s = snapshot;
  $('risk-panel').dataset.level = s.severity;
  $('risk-value').replaceChildren(document.createTextNode(s.severity === 'none' ? 'No warning' : `${label(s.severity)} risk`), node('span', 'risk-indicator'));
  $('risk-symbol').textContent = ['high','critical'].includes(s.severity) ? '!' : '◎';
  $('risk-description').textContent = s.explanation;
  $('assessment-status').textContent = s.processingHealth.provider === 'degraded' ? 'PROVIDER DEGRADED' : s.warningState === 'unresolved' ? 'WARNING RETAINED' : 'ASSESSMENT COMPLETE';
  $('action').textContent = s.recommendedAction;
  $('categories').replaceChildren(...(s.categories.length ? s.categories.map(c => node('span','category',label(c))) : [node('span','quiet-chip','No supported warning categories')]));
  const score = s.rawModelScore === null ? null : Math.round(s.rawModelScore * 100);
  $('score').replaceChildren(document.createTextNode(score === null ? '—' : String(score)), node('small', '', '/ 100'));
  $('score-fill').style.width = `${score ?? 0}%`;
  $('score-caption').textContent = score === null ? 'No valid provider score' : `${mode() === 'mock' ? 'Synthetic mock' : 'Raw model'} · turn ${s.modelAssessedThroughSequence}`;
  if (s.modelAssessedThroughSequence !== s.processedThroughSequence && score !== null) $('score-caption').textContent += ' · stale';
  $('uncertainty').textContent = s.latestAssessment ? s.latestAssessment.insufficientEvidence ? 'Yes · intent is ambiguous' : 'No · provider assessment' : 'No valid assessment';
  $('latest-explanation').textContent = s.latestAssessment?.explanation ?? 'No valid provider assessment yet.';
  $('latest-label').textContent = s.latestAssessment ? `${label(s.latestAssessment.source)} · ${label(s.latestAssessment.severity)} · cited turns: ${s.latestAssessment.evidenceSegmentIds.join(', ') || 'none'}` : '';
  $('turn-count').textContent = `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`;
  $('warning-count').textContent = String(s.warnings.length);
  const warnings = $('warnings'); warnings.replaceChildren();
  if (!s.warnings.length) {
    const empty = node('div', 'empty-warning'); const p = node('p', '', 'No unresolved warnings.'); p.append(node('small', '', 'Continue testing. A clear result does not establish that a call is safe.')); empty.append(node('span','','◇'),p); warnings.append(empty);
  }
  s.warnings.forEach(w => {
    const box = node('article', 'warning');
    const heading = node('div','warning-heading'); heading.append(node('strong','',`${label(w.severity)} · ${label(w.category)}`),node('span','source-tag',w.source.toUpperCase()));
    box.append(heading,node('p','',w.explanation),node('p','warning-action',w.recommendedAction));
    w.evidence.forEach(e => {
      const button = node('button','evidence-button',`${e.id} · ${e.speaker}`); button.title = e.text;
      button.addEventListener('click', () => { const target = $(`turn-${e.id}`); target?.scrollIntoView({block:'center',behavior:'smooth'}); target?.classList.add('highlight'); setTimeout(() => target?.classList.remove('highlight'),1800); }); box.append(button);
    }); warnings.append(box);
  });
  $('provider-health').textContent = label(s.processingHealth.provider); $('input-health').textContent = label(s.processingHealth.input);
  $('latency').textContent = `${Math.round(latency)} ms`; $('assessed-through').textContent = s.modelAssessedThroughSequence === null ? 'None' : `Turn ${s.modelAssessedThroughSequence} / ${s.processedThroughSequence}`;
  renderTranscript();
  if (diagnostic || s.processingHealth.provider === 'degraded') notice(diagnostic ?? 'The provider assessment failed or timed out. Rule warnings remain active. The score may be absent or stale.');
}
async function sendTurn(text, speaker) {
  if (busy) return false;
  busy = true; notice(''); $('assessment-status').textContent = 'ASSESSING TURN'; renderControls();
  try {
    if (!call) call = await api('/api/calls', {method:'POST',body:JSON.stringify({mode:mode()})});
    const result = await api(`/api/calls/${call.id}/turn`, {method:'POST',body:JSON.stringify({text,speaker})});
    ({ snapshot, turns, latencyMs:latency, diagnostic } = result);
    nextLiveAt = result.nextLiveAt; renderBudget(result.budget); renderSnapshot(); return true;
  } catch (error) { notice(error.message); $('assessment-status').textContent = 'REQUEST FAILED'; $('provider-health').textContent = 'Request failed'; running = false; return false; }
  finally { busy = false; renderControls(); }
}
const initialTranscript = $('transcript').innerHTML;
async function reset() {
  running = false; replayToken++;
  if (call) await api(`/api/calls/${call.id}`,{method:'DELETE'}).catch(() => {});
  call = null; snapshot = null; turns = []; latency = null; diagnostic = null; cursor = 0;
  $('transcript').innerHTML = initialTranscript;
  $('risk-panel').dataset.level = 'idle'; $('risk-value').replaceChildren(document.createTextNode('Not assessed'),node('span','risk-indicator'));
  $('risk-symbol').textContent = '◎'; $('risk-description').textContent = 'Add a turn to begin the assessment.';
  $('assessment-status').textContent = 'AWAITING INPUT'; $('action').textContent = 'Keep sensitive information private while testing.';
  $('categories').replaceChildren(node('span','quiet-chip','No risk categories yet'));
  $('score').replaceChildren(document.createTextNode('—'),node('small','','/ 100')); $('score-fill').style.width = '0%'; $('score-caption').textContent = 'No assessment yet'; $('uncertainty').textContent = '—';
  $('latest-explanation').textContent = 'No valid provider assessment yet.'; $('latest-label').textContent = '';
  $('turn-count').textContent = '0 turns'; $('warning-count').textContent = '0';
  $('warnings').replaceChildren(node('div','empty-warning','No warnings yet. Run a scenario or add a turn.'));
  $('provider-health').textContent = 'Not started'; $('input-health').textContent = 'Not started'; $('latency').textContent = '— ms'; $('assessed-through').textContent = '— turn';
  notice(''); renderMode(); renderControls();
}
function selectScenario() {
  const scenario = scenarios[Number($('scenario').value)];
  queued = scenario.turns; cursor = 0;
  $('scenario-description').textContent = scenario.description; $('scenario-type').textContent = scenario.type;
  renderControls();
}
async function nextTurn() { if (cursor >= queued.length) return; const [speaker,text] = queued[cursor]; if (await sendTurn(text,speaker)) cursor++; renderControls(); }
async function play() {
  if (running) { running = false; replayToken++; renderControls(); return; }
  const token = ++replayToken;
  running = true; renderControls();
  while (running && token === replayToken && cursor < queued.length) {
    while (running && token === replayToken && cooldown()) { await new Promise(resolve=>setTimeout(resolve,250)); renderControls(); }
    if (!running || token !== replayToken) break;
    await nextTurn();
    if (snapshot?.processingHealth.provider === 'degraded') running = false;
    if (running) await new Promise(resolve=>setTimeout(resolve,650));
  }
  if (token === replayToken) running = false; renderControls();
}
function showData(title, data, description = '') { $('dialog-title').textContent = title; $('dialog-description').textContent = description; $('json-output').hidden = false; $('json-output').textContent = JSON.stringify(data,null,2); $('data-dialog').showModal(); }
scenarios.forEach((s,i)=>{const option=node('option','',s.name);option.value=String(i);$('scenario').append(option);});
$('load-scenario').addEventListener('click',async()=>{await reset();selectScenario();});
$('scenario').addEventListener('change',async()=>{await reset();selectScenario();});
$('next').addEventListener('click',nextTurn); $('play').addEventListener('click',play);
$('reset').addEventListener('click',async()=>{await reset();selectScenario();});
$('mode').addEventListener('change',async()=>{await reset();selectScenario();});
for (const [id, value] of [['mode-mock','mock'],['mode-live','cerebras']]) {
  $(id).addEventListener('click',()=>{if($('mode').value!==value){$('mode').value=value;$('mode').dispatchEvent(new Event('change'));}});
}
$('text').addEventListener('input',renderControls);
async function submit() {const text=$('text').value.trim(); if (!text || busy || running || cooldown()) return; if(await sendTurn(text,$('speaker').value))$('text').value=''; renderControls();}
$('send').addEventListener('click',submit); $('text').addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter'){event.preventDefault();submit();}});
$('raw-data').addEventListener('click',()=>showData('Session data',{mode:mode(),snapshot:snapshot??null,turns,latencyMs:latency??null},'Redacted engine output. The raw model score is uncalibrated; calibratedProbability is always null.'));
$('download').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({mode:mode(),snapshot:snapshot??null,turns,latencyMs:latency??null},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download='signal-test-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('close-dialog').addEventListener('click',()=>$('data-dialog').close());
$('lab-nav').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('verification-nav').addEventListener('click',async()=>{
  try{
    const data=await api('/api/verification');$('dialog-title').textContent='Verification results';$('json-output').hidden=true;
    const container=$('dialog-description');container.replaceChildren(node('p','','Frozen synthetic transcript checks. These are not production accuracy or calibrated probabilities. Engine replay gates differ from the stricter model-only gates.'));
    const table=node('table','verification-table'); const header=node('tr'); ['Round','Model gates','Engine gates'].forEach(x=>header.append(node('th','',x)));table.append(header);
    data.summaries.forEach(s=>{const tr=node('tr');[s.name,`${s.modelOnly.passed}/${s.attempted}`,`${s.currentEngine.passed}/${s.attempted}`].forEach(x=>tr.append(node('td','',x)));table.append(tr);});container.append(table,node('p','','Remaining gaps: payment/secrecy categorization, uncertainty flags, and complete context citations. Ordinary call context is bounded to 40 recent segments plus pending turns and warning evidence.'));
    $('data-dialog').showModal();
  }catch(error){notice(error.message);}
});
selectScenario(); renderMode(); renderControls();
refreshConfig().catch(()=>notice('The engine could not start. Reload the page or check the local server.'));
setInterval(renderControls,500);
