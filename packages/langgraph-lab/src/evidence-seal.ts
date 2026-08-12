import { createHash } from 'node:crypto';
import {
  N20_CASE_IDS,
  N20_REPLAY_ERROR_CODES,
  N20_SCHEMA_VERSION,
  REPLAY_MISMATCH_KINDS,
  type N20CaseId,
  type N20ReplayErrorCode,
} from './replay-contract.js';
import {
  N19_ERROR_CODES,
  N19_SCHEMA_VERSION,
  TRACE_EVENT_TYPES,
  TRACE_NODES,
  TRACE_ROUTES,
  type N19ErrorCode,
} from './trace-contract.js';
import {
  N21_COMPARE_BASES,
  N21_DIAGNOSTIC_KINDS,
  N21_DIAGNOSTIC_STATUSES,
  N21_FIXTURE_VERSION,
  N21_MAX_PATH_ITEMS,
  N21_MAX_REPORT_BYTES,
  N21_MAX_SEQUENCE_VALUE,
  N21_REASON_CODES,
  N21_SCHEMA_VERSION,
  type N21ReasonCode,
  type ReplayDiagnosticReport,
  type SafeDeterminismReport,
  type SafeMismatch,
  type SafeReplaySummary,
} from './replay-diagnostic-contract.js';
import {
  N22_DIGEST_ALGORITHM,
  N22_EVIDENCE_TYPE,
  N22_MAX_ENVELOPE_BYTES,
  N22_SCHEMA_VERSION,
  N22_SOURCE_SCHEMA_VERSION,
  type EvidenceEnvelope,
  type EvidenceVerificationResult,
  type N22ReasonCode,
} from './evidence-contract.js';

const ENVELOPE_KEYS = ['schemaVersion', 'evidenceType', 'sourceSchemaVersion', 'digestAlgorithm', 'report', 'evidenceDigest'] as const;
const REPORT_KEYS = [
  'schemaVersion',
  'caseId',
  'fixtureVersion',
  'diagnosticStatus',
  'diagnosticKind',
  'reasonCode',
  'sourceErrorCode',
  'compareBasis',
  'determinism',
  'actualSummary',
  'firstMismatch',
] as const;
const DETERMINISM_KEYS = ['runsCompared', 'matchesGolden', 'matchesSecondRun', 'deterministic', 'firstMismatchIndex'] as const;
const SUMMARY_KEYS = [
  'schemaVersion',
  'eventTypes',
  'nodePath',
  'routes',
  'finalRunStatus',
  'finalResumeStatus',
  'terminalOutcome',
  'errorCode',
  'eventCount',
  'lastSequence',
] as const;
const MISMATCH_KEYS = ['kind', 'index', 'expected', 'actual'] as const;

const FINAL_RUN_STATUSES = ['paused', 'completed', 'rejected'] as const;
const RESUME_STATUSES = ['not_started', 'paused', 'approved', 'denied', 'invalid', 'duplicate', 'stale'] as const;
const TERMINAL_OUTCOMES = ['knowledge_answer', 'safe_unavailable', 'handoff_recommended', 'mock_fallback', 'safe_refusal', 'fail_closed'] as const;

export class EvidenceSealError extends Error {
  readonly code: N22ReasonCode;

  constructor(code: N22ReasonCode) {
    super(code);
    this.name = 'EvidenceSealError';
    this.code = code;
  }
}

export function sealReplayDiagnosticReport(report: ReplayDiagnosticReport): EvidenceEnvelope {
  const validated = validateReport(report);
  if (!validated.valid) throw new EvidenceSealError(validated.reasonCode);
  if (byteLength(canonicalJson(validated.report)) > N21_MAX_REPORT_BYTES) throw new EvidenceSealError('SIZE_LIMIT_EXCEEDED');

  const unsigned = createUnsignedEnvelope(validated.report);
  const canonicalPayload = canonicalJson(unsigned);
  if (byteLength(canonicalPayload) > N22_MAX_ENVELOPE_BYTES) throw new EvidenceSealError('SIZE_LIMIT_EXCEEDED');

  const envelope: EvidenceEnvelope = {
    ...unsigned,
    evidenceDigest: sha256(canonicalPayload),
  };
  if (byteLength(canonicalJson(envelope)) > N22_MAX_ENVELOPE_BYTES) throw new EvidenceSealError('SIZE_LIMIT_EXCEEDED');
  return envelope;
}

export function verifyEvidenceEnvelope(envelope: unknown): EvidenceVerificationResult {
  if (!isRecord(envelope)) return invalid('ENVELOPE_INVALID');
  if (!hasExactKeys(envelope, ENVELOPE_KEYS)) return invalid(hasSensitiveOwnKey(envelope) ? 'SENSITIVE_DATA_REJECTED' : 'ENVELOPE_INVALID');
  if (serializedByteLength(envelope) > N22_MAX_ENVELOPE_BYTES) return invalid('SIZE_LIMIT_EXCEEDED');
  if (envelope.schemaVersion !== N22_SCHEMA_VERSION || envelope.evidenceType !== N22_EVIDENCE_TYPE || envelope.digestAlgorithm !== N22_DIGEST_ALGORITHM) {
    return invalid('ENVELOPE_INVALID');
  }
  if (envelope.sourceSchemaVersion !== N22_SOURCE_SCHEMA_VERSION) return invalid('SOURCE_VERSION_UNSUPPORTED');

  const validated = validateReport(envelope.report);
  if (!validated.valid) return invalid(validated.reasonCode);
  if (byteLength(canonicalJson(validated.report)) > N21_MAX_REPORT_BYTES) return invalid('SIZE_LIMIT_EXCEEDED');
  if (typeof envelope.evidenceDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(envelope.evidenceDigest)) return invalid('ENVELOPE_INVALID');

  const expectedDigest = sha256(canonicalJson(createUnsignedEnvelope(validated.report)));
  if (expectedDigest !== envelope.evidenceDigest) return invalid('DIGEST_MISMATCH');
  return { schemaVersion: N22_SCHEMA_VERSION, status: 'valid', reasonCode: 'NONE', digestMatch: true };
}

function createUnsignedEnvelope(report: ReplayDiagnosticReport): Omit<EvidenceEnvelope, 'evidenceDigest'> {
  return {
    schemaVersion: N22_SCHEMA_VERSION,
    evidenceType: N22_EVIDENCE_TYPE,
    sourceSchemaVersion: N22_SOURCE_SCHEMA_VERSION,
    digestAlgorithm: N22_DIGEST_ALGORITHM,
    report: copyReport(report),
  };
}

function copyReport(report: ReplayDiagnosticReport): ReplayDiagnosticReport {
  return {
    schemaVersion: report.schemaVersion,
    caseId: report.caseId,
    fixtureVersion: report.fixtureVersion,
    diagnosticStatus: report.diagnosticStatus,
    diagnosticKind: report.diagnosticKind,
    reasonCode: report.reasonCode,
    sourceErrorCode: report.sourceErrorCode,
    compareBasis: report.compareBasis,
    determinism: copyDeterminism(report.determinism),
    actualSummary: copySummary(report.actualSummary),
    firstMismatch: copyMismatch(report.firstMismatch),
  };
}

function copyDeterminism(value: SafeDeterminismReport | null): SafeDeterminismReport | null {
  return value === null ? null : {
    runsCompared: 2,
    matchesGolden: value.matchesGolden,
    matchesSecondRun: value.matchesSecondRun,
    deterministic: value.deterministic,
    firstMismatchIndex: value.firstMismatchIndex,
  };
}

function copySummary(value: SafeReplaySummary | null): SafeReplaySummary | null {
  return value === null ? null : {
    schemaVersion: value.schemaVersion,
    eventTypes: [...value.eventTypes],
    nodePath: [...value.nodePath],
    routes: [...value.routes],
    finalRunStatus: value.finalRunStatus,
    finalResumeStatus: value.finalResumeStatus,
    terminalOutcome: value.terminalOutcome,
    errorCode: value.errorCode,
    eventCount: value.eventCount,
    lastSequence: value.lastSequence,
  };
}

function copyMismatch(value: SafeMismatch | null): SafeMismatch | null {
  return value === null ? null : { kind: value.kind, index: value.index, expected: value.expected, actual: value.actual };
}

function validateReport(value: unknown): ReportValidationResult {
  if (!isRecord(value)) return { valid: false, reasonCode: 'ENVELOPE_INVALID' };
  if (!hasExactKeys(value, REPORT_KEYS)) return { valid: false, reasonCode: hasSensitiveOwnKey(value) ? 'SENSITIVE_DATA_REJECTED' : 'ENVELOPE_INVALID' };
  if (value.schemaVersion !== N21_SCHEMA_VERSION || !isCaseIdOrNull(value.caseId) || !isFixtureVersionOrNull(value.fixtureVersion)) return { valid: false, reasonCode: 'ENVELOPE_INVALID' };
  if (!isEnumValue(value.diagnosticStatus, N21_DIAGNOSTIC_STATUSES)
    || !isEnumValue(value.diagnosticKind, N21_DIAGNOSTIC_KINDS)
    || !isEnumValue(value.reasonCode, N21_REASON_CODES)
    || !isN20ErrorCodeOrNull(value.sourceErrorCode)
    || !isEnumValue(value.compareBasis, N21_COMPARE_BASES)) return { valid: false, reasonCode: 'ENVELOPE_INVALID' };

  if (value.determinism !== null && !isDeterminism(value.determinism)) return { valid: false, reasonCode: isSensitiveRecord(value.determinism) ? 'SENSITIVE_DATA_REJECTED' : 'ENVELOPE_INVALID' };
  if (value.actualSummary !== null && !isSummary(value.actualSummary)) return { valid: false, reasonCode: isSensitiveRecord(value.actualSummary) ? 'SENSITIVE_DATA_REJECTED' : 'ENVELOPE_INVALID' };
  if (value.firstMismatch !== null && !isMismatch(value.firstMismatch)) return { valid: false, reasonCode: isSensitiveRecord(value.firstMismatch) ? 'SENSITIVE_DATA_REJECTED' : 'ENVELOPE_INVALID' };
  return { valid: true, report: copyReport(value as unknown as ReplayDiagnosticReport) };
}

function isDeterminism(value: unknown): value is SafeDeterminismReport {
  if (!isRecord(value) || !hasExactKeys(value, DETERMINISM_KEYS)) return false;
  return value.runsCompared === 2
    && typeof value.matchesGolden === 'boolean'
    && typeof value.matchesSecondRun === 'boolean'
    && typeof value.deterministic === 'boolean'
    && isSafeIndex(value.firstMismatchIndex);
}

function isSummary(value: unknown): value is SafeReplaySummary {
  if (!isRecord(value) || !hasExactKeys(value, SUMMARY_KEYS)) return false;
  return value.schemaVersion === N19_SCHEMA_VERSION
    && isEnum(value.eventTypes, TRACE_EVENT_TYPES)
    && isEnum(value.nodePath, TRACE_NODES)
    && isEnum(value.routes, TRACE_ROUTES)
    && value.eventTypes.length <= N21_MAX_PATH_ITEMS
    && value.nodePath.length <= N21_MAX_PATH_ITEMS
    && value.routes.length <= N21_MAX_PATH_ITEMS
    && isEnumValue(value.finalRunStatus, FINAL_RUN_STATUSES)
    && isEnumValue(value.finalResumeStatus, RESUME_STATUSES)
    && isEnumValueOrNull(value.terminalOutcome, TERMINAL_OUTCOMES)
    && isN19ErrorCodeOrNull(value.errorCode)
    && isBoundedNumber(value.eventCount)
    && isBoundedNumber(value.lastSequence);
}

function isMismatch(value: unknown): value is SafeMismatch {
  if (!isRecord(value) || !hasExactKeys(value, MISMATCH_KEYS)) return false;
  return isEnumValue(value.kind, REPLAY_MISMATCH_KINDS)
    && isSafeIndex(value.index)
    && isComparableValue(value.expected)
    && isComparableValue(value.actual);
}

function isComparableValue(value: unknown): boolean {
  if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= N21_MAX_SEQUENCE_VALUE)) return true;
  return typeof value === 'string'
    && ([
      N19_SCHEMA_VERSION,
      N20_SCHEMA_VERSION,
      ...TRACE_EVENT_TYPES,
      ...TRACE_NODES,
      ...TRACE_ROUTES,
      ...FINAL_RUN_STATUSES,
      ...RESUME_STATUSES,
      ...TERMINAL_OUTCOMES,
      ...N19_ERROR_CODES,
      ...N20_REPLAY_ERROR_CODES,
    ] as readonly string[]).includes(value);
}

function isCaseIdOrNull(value: unknown): value is N20CaseId | null {
  return value === null || (typeof value === 'string' && (N20_CASE_IDS as readonly string[]).includes(value));
}

function isFixtureVersionOrNull(value: unknown): value is typeof N21_FIXTURE_VERSION | null {
  return value === null || value === N21_FIXTURE_VERSION;
}

function isN20ErrorCodeOrNull(value: unknown): value is N20ReplayErrorCode | null {
  return value === null || (typeof value === 'string' && (N20_REPLAY_ERROR_CODES as readonly string[]).includes(value));
}

function isN19ErrorCodeOrNull(value: unknown): value is N19ErrorCode | null {
  return value === null || (typeof value === 'string' && (N19_ERROR_CODES as readonly string[]).includes(value));
}

function isSafeIndex(value: unknown): value is number | null {
  return value === null || isBoundedNumber(value);
}

function isBoundedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= N21_MAX_SEQUENCE_VALUE;
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((item) => isEnumValue(item, values));
}

function isEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isEnumValueOrNull<T extends string>(value: unknown, values: readonly T[]): value is T | null {
  return value === null || isEnumValue(value, values);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSensitiveRecord(value: unknown): boolean {
  return isRecord(value) && hasSensitiveOwnKey(value);
}

function hasSensitiveOwnKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => /input|payload|token|secret|password|credential|checkpoint|trace.?id|thread.?id|path|stack|prompt|operator|environment|database|connection|runtime/i.test(key));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function serializedByteLength(value: unknown): number {
  try {
    return byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function invalid(reasonCode: N22ReasonCode): EvidenceVerificationResult {
  return { schemaVersion: N22_SCHEMA_VERSION, status: 'invalid', reasonCode, digestMatch: false };
}

type ReportValidationResult =
  | { valid: true; report: ReplayDiagnosticReport }
  | { valid: false; reasonCode: N22ReasonCode };
