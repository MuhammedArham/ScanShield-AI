import { createHash } from 'node:crypto';
import { Assessment, Event, rank, type Alert, type Segment, type Severity } from './schema.js';
import { mockProvider, type Provider } from './provider.js';
import { redact } from './redact.js';
import { rules } from './rules.js';

export interface Warning extends Alert { state: 'unresolved' }
export interface Snapshot {
  callState: 'active' | 'ended';
  latestAssessment: (Assessment & { source: Provider['source']; assessedThroughSequence: number }) | null;
  callId: string; assessmentSequence: number; processedThroughSequence: number;
  modelAssessedThroughSequence: number | null; severity: Severity;
  categories: Alert['category'][]; evidence: Segment[]; explanation: string; recommendedAction: string;
  warnings: Warning[]; warningState: 'none' | 'unresolved';
  rawModelScore: number | null; modelScoreCalibration: 'uncalibrated'; calibratedProbability: null;
  providerSource: Provider['source']; processingHealth: { provider: 'pending' | 'healthy' | 'degraded'; input: 'healthy' | 'degraded' };
}
export class InputError extends Error {
  readonly inputHealth = 'degraded';
  constructor(readonly code: 'invalid_event' | 'conflict' | 'late_event' | 'capacity') { super(`Transcript rejected: ${code}`); this.name = 'InputError'; }
}
interface Call { value: Snapshot; segments: Segment[]; unassessed: Map<string, Segment>; pending: Promise<void>; requested?: number; running?: boolean; controller?: AbortController; ledger: Map<string, { hash: string; final: boolean }>; events: Map<number, string>; ended: boolean }
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class Detector {
  private calls = new Map<string, Call>();
  private provider: Provider;
  private limits: { maxCalls: number; maxContextSegments: number; maxPendingSegments: number; maxSegments: number; maxEvents: number; maxEvidenceSegments: number };
  private onUpdate?: (snapshot: Snapshot) => void;
  private timeoutMs: number;
  constructor(options: { provider?: Provider; assessmentTimeoutMs?: number; onUpdate?: (snapshot: Snapshot) => void; limits?: Partial<{ maxCalls: number; maxContextSegments: number; maxPendingSegments: number; maxSegments: number; maxEvents: number; maxEvidenceSegments: number }> } = {}) {
    this.timeoutMs = options.assessmentTimeoutMs ?? 2500;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new Error('Invalid assessment timeout');
    this.limits = { maxCalls: 32, maxContextSegments: 40, maxPendingSegments: 40, maxSegments: 1000, maxEvents: 4000, maxEvidenceSegments: 100, ...options.limits };
    if (Object.values(this.limits).some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid detector limits');
    this.provider = options.provider ?? mockProvider;
    this.onUpdate = options.onUpdate;
  }
  ingest(input: unknown): Snapshot {
    const parsed = Event.safeParse(input);
    if (!parsed.success) throw new InputError('invalid_event');
    const event = parsed.data;
    const segmentHash = hash([event.segment.id, event.segment.speaker, event.segment.startedAtMs, event.segment.endedAtMs, event.segment.text, event.segment.final]);
    const eventHash = hash([event.sequence, segmentHash]);
    let call = this.calls.get(event.callId);
    if (!call) {
      if (this.calls.size >= this.limits.maxCalls) throw new InputError('capacity');
      call = { segments: [], unassessed: new Map(), pending: Promise.resolve(), ledger: new Map(), events: new Map(), ended: false, value: {
        callId: event.callId, callState: 'active', latestAssessment: null, assessmentSequence: 0, processedThroughSequence: 0,
        modelAssessedThroughSequence: null, severity: 'none', categories: [], evidence: [],
        explanation: 'No finalized unsafe request detected so far.', recommendedAction: 'Protect sensitive information.',
        warnings: [], warningState: 'none', rawModelScore: null, modelScoreCalibration: 'uncalibrated',
        calibratedProbability: null, providerSource: this.provider.source, processingHealth: { provider: 'pending', input: 'healthy' }
      } };
      this.calls.set(event.callId, call);
    }
    const reject = (code: 'conflict' | 'late_event' | 'capacity'): never => {
      call.value.processingHealth.input = 'degraded'; this.publish(call); throw new InputError(code);
    };
    const priorEvent = call.events.get(event.sequence);
    if (priorEvent === eventHash) return this.snapshot(event.callId);
    if (priorEvent) reject('conflict');
    if (event.sequence <= call.value.processedThroughSequence) reject('late_event');
    const prior = call.ledger.get(event.segment.id);
    if (prior?.final && prior.hash !== segmentHash) reject('conflict');
    if (call.events.size >= this.limits.maxEvents || (!prior && call.ledger.size >= this.limits.maxSegments)) reject('capacity');
    if (event.segment.final && !prior?.final && call.unassessed.size >= this.limits.maxPendingSegments) reject('capacity');
    const segment = { ...event.segment, text: redact(event.segment.text) };
    const alerts = event.segment.final && !prior?.final ? rules(segment, call.segments) : [];
    const retainedIds = new Set([...call.value.warnings.flatMap(w => w.evidence), ...alerts.flatMap(a => a.evidence)].map(s => s.id));
    if (retainedIds.size > this.limits.maxEvidenceSegments) reject('capacity');
    if (event.sequence !== call.value.processedThroughSequence + 1) call.value.processingHealth.input = 'degraded';
    call.events.set(event.sequence, eventHash);
    call.ledger.set(event.segment.id, { hash: segmentHash, final: event.segment.final });
    call.value.processedThroughSequence = event.sequence;
    if (event.segment.final && !prior?.final) {
      call.unassessed.set(segment.id, segment);
      call.segments.push(segment);
      call.segments = call.segments.slice(-this.limits.maxContextSegments);
      for (const alert of alerts) {
        const id = `${event.callId}:rule:${alert.category}`;
        this.mergeWarning(call, { ...alert, id });
      }
      this.aggregate(call);
      call.requested = event.sequence;
      this.schedule(call);
    }
    this.publish(call);
    return this.snapshot(event.callId);
  }
  private schedule(active: Call): void {
    if (active.running || active.ended || active.requested === undefined) return;
    active.running = true;
    const sequence = active.requested;
    active.requested = undefined;
    const context = structuredClone([...new Map([...active.value.warnings.flatMap(w => w.evidence), ...active.segments, ...active.unassessed.values()].map(s => [s.id, s])).values()].sort((a, b) => a.startedAtMs - b.startedAtMs));
    const event = { callId: active.value.callId, sequence };
      active.value.processingHealth.provider = 'pending';
      active.pending = Promise.resolve().then(async () => {
        if (active.ended || this.calls.get(event.callId) !== active) return;
        const controller = new AbortController();
        active.controller = controller;
        let settled = false;
        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const request = Promise.resolve().then(() => this.provider.assess(context, controller.signal));
        void request.then(() => { settled = true; }, () => { settled = true; }).then(() => {
          if (timedOut) { active.running = false; if (!active.ended) this.schedule(active); }
        });
        try {
          const assessment = Assessment.parse(await Promise.race([request, new Promise((_, reject) => {
            timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('Assessment timeout')); }, this.timeoutMs);
            controller.signal.addEventListener('abort', () => reject(new Error('Assessment cancelled')), { once: true });
          })]));
          clearTimeout(timer);
          if (active.ended || this.calls.get(event.callId) !== active) return;
          if (assessment.evidenceSegmentIds.some(id => !context.some(s => s.id === id))) throw new Error('Unknown evidence');
          if (assessment.severity !== 'none' && (!assessment.categories.length || !assessment.evidenceSegmentIds.length)) throw new Error('Missing evidence');
          if (assessment.insufficientEvidence && rank(assessment.severity) >= rank('high')) throw new Error('Insufficient evidence');
          const evidence = context.filter(s => assessment.evidenceSegmentIds.includes(s.id));
          const retained = new Set([...active.value.warnings.flatMap(w => w.evidence), ...evidence].map(s => s.id));
          if (retained.size > this.limits.maxEvidenceSegments) throw new Error('Evidence capacity');
          assessment.explanation = redact(assessment.explanation);
          assessment.recommendedAction = redact(assessment.recommendedAction);
          active.value.latestAssessment = { ...assessment, source: this.provider.source, assessedThroughSequence: event.sequence };
          active.value.rawModelScore = assessment.rawModelScore;
          active.value.modelAssessedThroughSequence = event.sequence;
          active.value.processingHealth.provider = 'healthy';
          for (const segment of context) active.unassessed.delete(segment.id);
          if (assessment.severity !== 'none') {
            for (const category of assessment.categories) {
              const id = `${event.callId}:${this.provider.source}:${category}`;
              this.mergeWarning(active, { id, category, evidence, severity: assessment.severity, source: this.provider.source, explanation: assessment.explanation, recommendedAction: assessment.recommendedAction });
            }
            this.aggregate(active);
          }
        } catch {
          clearTimeout(timer);
          if (active.ended || this.calls.get(event.callId) !== active) return;
          active.value.processingHealth.provider = 'degraded';
        }
        clearTimeout(timer);
        this.publish(active);
        if (settled) { active.running = false; this.schedule(active); }
      });
  }
  private mergeWarning(call: Call, alert: Alert): void {
    const existing = call.value.warnings.find(w => w.category === alert.category);
    if (!existing) { call.value.warnings.push({ ...alert, state: 'unresolved' }); return; }
    existing.evidence = [...new Map([...existing.evidence, ...alert.evidence].map(s => [s.id, s])).values()];
    if (rank(alert.severity) > rank(existing.severity)) {
      const { severity, source, explanation, recommendedAction } = alert;
      Object.assign(existing, { severity, source, explanation, recommendedAction });
    }
  }
  private aggregate(call: Call): void {
    const warnings = call.value.warnings;
    const strongest = [...warnings].sort((a, b) => rank(b.severity) - rank(a.severity))[0];
    if (!strongest) return;
    if (rank(strongest.severity) >= rank(call.value.severity)) {
      call.value.severity = strongest.severity;
      call.value.explanation = strongest.explanation;
      call.value.recommendedAction = strongest.recommendedAction;
    }
    call.value.categories = [...new Set(warnings.map(w => w.category))];
    call.value.evidence = [...new Map(warnings.flatMap(w => w.evidence).map(s => [s.id, s])).values()];
    call.value.warningState = 'unresolved';
  }
  private publish(call: Call): void {
    call.value.assessmentSequence++;
    this.onUpdate?.(structuredClone(call.value));
  }
  snapshot(callId: string): Snapshot {
    const call = this.calls.get(callId);
    if (!call) throw new Error('Unknown call');
    return structuredClone(call.value);
  }
  async flush(callId: string): Promise<Snapshot> {
    const call = this.calls.get(callId);
    if (!call) throw new Error('Unknown call');
    while (true) { const pending = call.pending; await pending; if (pending === call.pending) break; }
    return this.snapshot(callId);
  }
  async endCall(callId: string): Promise<Snapshot> {
    const call = this.calls.get(callId);
    if (!call) throw new Error('Unknown call');
    call.ended = true;
    call.value.callState = 'ended';
    call.controller?.abort();
    this.publish(call);
    this.calls.delete(callId);
    const result = structuredClone(call.value);
    return result;
  }
}
