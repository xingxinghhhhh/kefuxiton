import {
  CLOSE_REASONS,
  LEGACY_UNCLASSIFIED,
  RESOLUTION_CODES,
  type CloseReason,
  type ResolutionCode,
  type StoredCloseReason,
  type StoredResolutionCode,
} from '@ai-agent/contracts';

export type CloseOutcome = {
  closeReason: StoredCloseReason;
  resolutionCode: StoredResolutionCode;
};

export type CloseOutcomeParseResult =
  | { kind: 'valid'; value: CloseOutcome }
  | { kind: 'invalid'; reason: 'both_fields_required' | 'unsupported_value' };

export function isCloseReason(value: unknown): value is CloseReason {
  return typeof value === 'string' && (CLOSE_REASONS as readonly string[]).includes(value);
}

export function isResolutionCode(value: unknown): value is ResolutionCode {
  return typeof value === 'string' && (RESOLUTION_CODES as readonly string[]).includes(value);
}

export function isStoredCloseReason(value: unknown): value is StoredCloseReason {
  return value === LEGACY_UNCLASSIFIED || isCloseReason(value);
}

export function isStoredResolutionCode(value: unknown): value is StoredResolutionCode {
  return value === LEGACY_UNCLASSIFIED || isResolutionCode(value);
}

export function parseCloseOutcome(closeReason: unknown, resolutionCode: unknown): CloseOutcomeParseResult {
  const reasonMissing = closeReason === undefined;
  const resolutionMissing = resolutionCode === undefined;
  if (reasonMissing && resolutionMissing) {
    return {
      kind: 'valid',
      value: { closeReason: LEGACY_UNCLASSIFIED, resolutionCode: LEGACY_UNCLASSIFIED },
    };
  }
  if (reasonMissing || resolutionMissing) return { kind: 'invalid', reason: 'both_fields_required' };
  if (!isCloseReason(closeReason) || !isResolutionCode(resolutionCode)) {
    return { kind: 'invalid', reason: 'unsupported_value' };
  }
  return { kind: 'valid', value: { closeReason, resolutionCode } };
}
