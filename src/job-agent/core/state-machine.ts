import type { ApplicationState } from '../schemas/index.js';

const terminalStates = new Set<ApplicationState>([
  'SUBMITTED', 'SKIPPED', 'DUPLICATE', 'REJECTED_BY_USER', 'FAILED_PERMANENT', 'CANCELLED'
]);

const allowed = new Map<ApplicationState, Set<ApplicationState>>([
  ['DISCOVERED', new Set(['NORMALIZED', 'DUPLICATE', 'SKIPPED', 'CANCELLED'])],
  ['NORMALIZED', new Set(['SCORED', 'FAILED_RETRYABLE', 'CANCELLED'])],
  ['SCORED', new Set(['SELECTED', 'SKIPPED', 'POLICY_BLOCKED', 'CANCELLED'])],
  ['SELECTED', new Set(['APPLICATION_STARTED', 'DUPLICATE', 'CANCELLED'])],
  ['APPLICATION_STARTED', new Set(['QUESTIONS_EXTRACTED', 'AUTH_REQUIRED', 'USER_ACTION_REQUIRED', 'CAPTCHA_REQUIRED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'])],
  ['QUESTIONS_EXTRACTED', new Set(['ANSWERS_PREPARED', 'FAILED_RETRYABLE', 'CANCELLED'])],
  ['ANSWERS_PREPARED', new Set(['WAITING_FOR_APPROVAL', 'FILLING', 'POLICY_BLOCKED', 'CANCELLED'])],
  ['WAITING_FOR_APPROVAL', new Set(['FILLING', 'REJECTED_BY_USER', 'CANCELLED'])],
  ['FILLING', new Set(['VALIDATING', 'USER_ACTION_REQUIRED', 'CAPTCHA_REQUIRED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'])],
  ['VALIDATING', new Set(['READY_TO_SUBMIT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'])],
  ['READY_TO_SUBMIT', new Set(['SUBMITTING', 'POLICY_BLOCKED', 'CANCELLED'])],
  ['SUBMITTING', new Set(['SUBMITTED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'USER_ACTION_REQUIRED', 'CANCELLED'])],
  ['FAILED_RETRYABLE', new Set(['APPLICATION_STARTED', 'FILLING', 'CANCELLED', 'FAILED_PERMANENT'])],
  ['AUTH_REQUIRED', new Set(['APPLICATION_STARTED', 'CANCELLED'])],
  ['USER_ACTION_REQUIRED', new Set(['APPLICATION_STARTED', 'FILLING', 'CANCELLED'])],
  ['CAPTCHA_REQUIRED', new Set(['APPLICATION_STARTED', 'FILLING', 'CANCELLED'])],
  ['POLICY_BLOCKED', new Set(['CANCELLED'])]
]);

export function canTransition(from: ApplicationState, to: ApplicationState): boolean {
  return !terminalStates.has(from) && (allowed.get(from)?.has(to) ?? false);
}

export function assertTransition(from: ApplicationState, to: ApplicationState): void {
  if (!canTransition(from, to)) throw new Error(`Invalid application state transition: ${from} -> ${to}`);
}
