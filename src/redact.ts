// Best effort English redaction, not a general PII or secret detector.
export function redact(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b\d(?:[\d -]{2,}\d)\b/g, '[REDACTED_NUMBER]')
    .replace(/\b(password|code|otp|pin)\s*(?:is\s+|[:=]\s*)(?:"[^"\n]+"|'[^'\n]+'|\[REDACTED_NUMBER\]|[^\s.!?;,"']+)/gi, '$1 is [REDACTED_SECRET]')
    .replace(/\b(passphrase|recovery phrase|seed phrase)\s*(?:is\s+|[:=]\s*)["']?[^.!?;\n]+?(?=\s+(?:and|then|but)\s+(?:please\s+)?(?:install|download|open|run|share|give|read|send|tell|transfer|pay|move|buy)\b|[.!?;\n]|$)/gi, '$1 is [REDACTED_SECRET]');
}
