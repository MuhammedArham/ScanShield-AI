import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Detector } from './detector.js';
import { mockProvider, type Provider } from './provider.js';
import { Event, rank, type Severity, type TranscriptEvent } from './schema.js';

export interface Scenario {
  fixture: string; name?: string; benign?: boolean; trigger?: number; fault?: boolean;
  duplicates?: boolean; inputDegradedFrom?: number; stableWarnings?: boolean;
  prefixes: [number, Severity, string[]][]; events: TranscriptEvent[];
}
export async function loadScenarios(): Promise<Scenario[]> {
  const labels = JSON.parse(await readFile('fixtures/evaluation-labels.json', 'utf8')) as Omit<Scenario, 'events'>[];
  return Promise.all(labels.map(async label => ({ ...label, events: (JSON.parse(await readFile(`fixtures/${label.fixture}`, 'utf8')) as unknown[]).map(e => Event.parse(e)) })));
}
function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted.length ? sorted[Math.ceil(sorted.length * .5) - 1]! : null,
    p95: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1]! : null, max: sorted.at(-1) ?? null };
}
/** Local synthetic regression evaluation. Never selects a provider from environment variables. */
export async function evaluate(scenarios: Scenario[], options: { provider?: Provider } = {}) {
  if (!scenarios.length || scenarios.some(s => !s.events.length)) throw new Error('Evaluation requires samples');
  if (options.provider && options.provider.source !== 'mock') throw new Error('Evaluation requires a synthetic mock provider');
  for (const scenario of scenarios) {
    const sequences = scenario.events.map(event => event.sequence);
    if (scenario.prefixes.length !== sequences.length || new Set(scenario.prefixes.map(p => p[0])).size !== sequences.length || sequences.some(sequence => !scenario.prefixes.some(p => p[0] === sequence))) throw new Error('Evaluation requires complete prefix labels');
  }
  const ruleTimes: number[] = [], providerTimes: number[] = [], warningTimes: number[] = [];
  let falseHigh = 0, falseCritical = 0, missedExpected = 0, prefixCount = 0;
  const outcomes = [];
  for (const scenario of scenarios) {
    const failures: string[] = []; let received = 0; let firstUsefulWarningMs: number | null = null;
    const provider: Provider = scenario.fault ? { source: 'mock', async assess() { throw new Error('Synthetic outage'); } } : options.provider ?? mockProvider;
    const timedProvider: Provider = { source: provider.source, async assess(segments, signal) {
      const start = performance.now();
      try { return await provider.assess(segments, signal); } finally { providerTimes.push(performance.now() - start); }
    } };
    const seenIds = new Set<string>(); const ruleSeen = new Set<string>();
    const detector = new Detector({ provider: timedProvider, onUpdate(snapshot) {
      for (const warning of snapshot.warnings) if (!seenIds.has(warning.id)) {
        seenIds.add(warning.id); const elapsed = performance.now() - received;
        if (rank(warning.severity) >= rank('high')) { warningTimes.push(elapsed); firstUsefulWarningMs ??= elapsed; }
        if (warning.source === 'rule' && !ruleSeen.has(warning.id)) { ruleSeen.add(warning.id); ruleTimes.push(elapsed); }
      }
    } });
    const prefixes = []; let previousWarnings: string[] = [];
    for (const event of scenario.events) {
      received = performance.now(); detector.ingest(event);
      let snapshot = await detector.flush(event.callId);
      if (scenario.duplicates) {
        const before = JSON.stringify(snapshot); detector.ingest(event); snapshot = await detector.flush(event.callId);
        if (before !== JSON.stringify(snapshot)) failures.push(`duplicate changed snapshot at ${event.sequence}`);
      }
      const label = scenario.prefixes.find(p => p[0] === event.sequence);
      if (!label) { failures.push(`unlabelled prefix ${event.sequence}`); continue; }
      prefixCount++;
      const actualEvidence = snapshot.evidence.map(s => s.id);
      const observable = new Set(scenario.events.filter(e => e.sequence <= event.sequence && e.segment.final).map(e => e.segment.id));
      if (snapshot.warnings.some(w => w.evidence.some(s => !observable.has(s.id))) || actualEvidence.some(id => !observable.has(id)) || snapshot.latestAssessment?.evidenceSegmentIds.some(id => !observable.has(id))) failures.push(`invalid/future evidence at ${event.sequence}`);
      if (snapshot.severity !== label[1] || label[2].some(id => !actualEvidence.includes(id))) failures.push(`prefix label mismatch at ${event.sequence}`);
      if (rank(label[1]) >= rank('high') && rank(snapshot.severity) < rank(label[1])) missedExpected++;
      if (rank(label[1]) < rank('high') && rank(snapshot.severity) >= rank('high')) falseHigh++;
      if (scenario.benign && snapshot.severity === 'critical') falseCritical++;
      if (scenario.trigger === event.sequence && rank(snapshot.severity) < rank('high')) failures.push('missed trigger');
      if (scenario.fault && snapshot.processingHealth.provider !== 'degraded') failures.push('invisible provider failure');
      if (scenario.inputDegradedFrom && event.sequence >= scenario.inputDegradedFrom && snapshot.processingHealth.input !== 'degraded') failures.push('invisible input gap');
      if (previousWarnings.some(id => !snapshot.warnings.some(w => w.id === id))) failures.push('warning lost');
      if (scenario.stableWarnings && previousWarnings.length && JSON.stringify(previousWarnings) !== JSON.stringify(snapshot.warnings.map(w => w.id))) failures.push('repeated request duplicated warning');
      if (snapshot.calibratedProbability !== null || snapshot.modelScoreCalibration !== 'uncalibrated') failures.push('unsupported calibration');
      previousWarnings = snapshot.warnings.map(w => w.id);
      prefixes.push({ throughSequence: event.sequence, expectedSeverity: label[1], actualSeverity: snapshot.severity, expectedEvidence: label[2], actualEvidence, health: snapshot.processingHealth });
    }
    await detector.endCall(scenario.events[0]!.callId);
    outcomes.push({ scenario: scenario.name ?? scenario.fixture, split: 'synthetic-regression', trigger: scenario.trigger ?? null, firstUsefulWarningMs, passed: failures.length === 0, failures, prefixes });
  }
  return { providerMode: 'synthetic/mock', scenarioCount: scenarios.length, prefixCount, falseHigh, falseCritical, missedExpected,
    gatePassed: outcomes.every(o => o.passed) && falseCritical === 0 && missedExpected === 0,
    finalizedEventToWarningTargetMs: 3000, targetPassed: warningTimes.length ? warningTimes.every(t => t <= 3000) : null,
    latency: { ruleWarningMs: distribution(ruleTimes), providerRequestMs: distribution(providerTimes), usefulWarningMs: distribution(warningTimes) },
    audioToWarningLatency: null, calibration: 'unimplemented', calibratedProbability: null,
    limitations: 'Tiny synthetic regression set; mock reuses rules. No real-world precision/recall, Cerebras quality, audio latency or calibrated probability measured.', outcomes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await evaluate(await loadScenarios());
    console.log(JSON.stringify(report, null, 2));
    if (!report.gatePassed || report.targetPassed === false) process.exitCode = 1;
  } catch { console.error('Evaluation failed: invalid synthetic fixtures or inaccessible files.'); process.exitCode = 1; }
}
