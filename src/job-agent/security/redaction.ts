const SECRET_KEY = /token|secret|password|authorization|api[_-]?key|cookie/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\w)\+?\d[\d\s()-]{7,}\d(?!\w)/g;

export function redact(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED_SECRET]';
  if (typeof value === 'string') return value.replace(EMAIL, '[REDACTED_EMAIL]').replace(PHONE, '[REDACTED_PHONE]');
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

export function assertSafeLocalFile(filePath: string, approvedPaths: string[]): void {
  if (!approvedPaths.includes(filePath)) throw new Error('POLICY_BLOCKED: file is not an approved CV variant');
}

export function assertUntrustedContentBoundary(content: string): void {
  const suspicious = /ignore (all|previous) instructions|system prompt|run (this )?(shell|command)|api key|password|secret/i;
  if (suspicious.test(content)) throw new Error('POLICY_BLOCKED: suspicious instruction-like webpage content detected');
}
