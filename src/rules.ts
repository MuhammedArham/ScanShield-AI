import type { Alert, Segment } from './schema.js';

export function rules(segment: Segment, context: readonly Segment[] = []): Alert[] {
  // Split explicit new actions, retaining credential continuations such as
  // "read the one time code and send it to me" in the same request.
  return segment.text.split(/[.!?;]|\bbut\b|\b(?:and|then)\s+(?=(?:now\s+|please\s+)*(?:install|download|open|run|grant|allow|transfer|pay|move|buy)\b)|\b(?:and|then)\s+(?=now\s+(?:read|send|share|give|tell)\b)/i).flatMap(clause => clauseRules(segment, clause, context));
}

function clauseRules(segment: Segment, clause: string, context: readonly Segment[]): Alert[] {
  const text = clause.toLowerCase();
  // Training, negation and reported warnings are counterexamples, not unsafe requests.
  if (/\b(never|do not|don't|should not|shouldn't)\s+(?:ever\s+)?(?:share|give|read|send|tell|disclose|install|download|open|run|grant|allow|transfer|pay|move|buy)\b/.test(text) || /\b(training|example|roleplay|security awareness)\b/.test(text)) return [];
  // Scope this exception to a reported clause with an explicit refusal. A later
  // clause remains actionable; conjunctions keep ambiguous mixed requests live.
  if (/^\s*(?:the|a|that)\s+(?:caller|stranger|scammer)\s+(?:said|asked|told)\b/.test(text)
    && /\b(?:i|we)\s+(?:refused|declined|did not comply|hung up|ended the call)\b/i.test(segment.text)
    && !/\b(?:and|then|now|but)\b/.test(text)) return [];
  const alerts: Alert[] = [];
  const request = /\b(?:tell|give|read|send|share|disclose|provide|enter|confirm|repeat)\b.{0,60}\b(?:me|us|your|the)\b/.test(text);
  const credential = /\b(?:otp|one[- ]time (?:code|passcode|password)|verification code|authentication code|password|recovery phrase|seed phrase)\b/.test(text);
  const make = (category: Alert['category'], severity: Alert['severity'], explanation: string, recommendedAction: string): Alert => ({
    id: `rule:${category}`, category, severity, explanation, recommendedAction, evidence: [segment], source: 'rule'
  });
  const ownAppContext = context.some(s => s.speaker === segment.speaker && /\b(?:official|your own)\s+(?:app|website)\b/i.test(s.text) && /\b(?:yourself|usual|independently)\b/i.test(s.text));
  const appEntry = /\b(?:enter|type)\b.{0,60}\b(?:in|inside|into|on)\s+(?:(?:your|own|official|the|that|this)\s+)*(?:app|website)\b/.test(text)
    && (/\b(?:official|your own)\s+(?:app|website)\b/.test(text) || (ownAppContext && /\b(?:that|the)\s+(?:app|website)\b/.test(text)));
  const disclosure = /\b(?:read|send|share|give|tell|disclose|provide|repeat)\b.{0,60}\b(?:me|us)\b/.test(text);
  if (request && credential && (!appEntry || disclosure)) alerts.push(make('credential_theft', 'critical', 'A participant requested disclosure of an authentication secret.', 'Do not disclose OTPs or passwords. Verify through an independently obtained contact.'));
  if (/\b(install|download|open|run)\b.{0,60}\b(anydesk|teamviewer|remote[- ](?:access|control))\b/.test(text)) alerts.push(make('remote_access', 'high', 'A participant requested remote-access software.', 'Verify the support request through an official channel before granting access.'));
  const earlierRemote = [...context].reverse().find(s => s.id !== segment.id && s.speaker === segment.speaker && /\b(anydesk|teamviewer|remote[- ](?:access|control))\b/i.test(s.text) && !/\b(never|don't|do not|training|example)\b/i.test(s.text));
  if (earlierRemote && /\b(install|download|open|run)\s+(?:it|that|the tool)\b/.test(text)) {
    const alert = make('remote_access', 'high', 'A participant requested installation of a previously named remote-access tool.', 'Verify the support request independently before installing or granting access.');
    alert.evidence = [earlierRemote, segment];
    alerts.push(alert);
  }
  if (/\b(send|transfer|pay|move|buy)\b/.test(text) && /\b(money|funds|payment|gift cards?|crypto|bitcoin)\b/.test(text) && /\b(new account|safe account|immediately|urgent|now|today)\b/.test(text)) alerts.push(make('payment_redirection', 'high', 'A payment request includes urgency or a new destination.', 'Pause the payment and verify the destination through an independent channel.'));
  const earlierPayment = [...context].reverse().find(s => s.id !== segment.id && s.speaker === segment.speaker && /\b(transfer|send|move|pay)\b.{0,60}\b(money|funds|payment)\b/i.test(s.text) && !/\b(never|don't|do not|training|example)\b/i.test(s.text));
  if (earlierPayment && /\b(?:do|send|transfer|move)\s+(?:it|that|the money|the funds)\b/.test(text) && /\b(immediately|urgent|now|today|new account|safe account)\b/.test(text)) {
    const alert = make('payment_redirection', 'high', 'A participant urged proceeding with a previously proposed payment transfer.', 'Pause the payment and verify the destination through an independent channel.');
    alert.evidence = [earlierPayment, segment];
    alerts.push(alert);
  }
  return alerts;
}
