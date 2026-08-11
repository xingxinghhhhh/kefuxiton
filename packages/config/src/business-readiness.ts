export type BusinessReadinessTarget = 'local_eval' | 'production';
export type BusinessReadinessStatus = 'NOT_READY' | 'LOCAL_EVAL_READY' | 'PRODUCTION_READY';
export type BusinessPackageStatus = 'draft' | 'pending_confirmation' | 'confirmed' | 'superseded' | 'expired' | 'rejected';
export type BusinessSourceStatus = 'local_eval' | 'published' | 'superseded' | 'expired';

export type BusinessReadinessReasonCode =
  | 'MISSING_FIELD'
  | 'INVALID_FIELD'
  | 'NOT_CONFIRMED'
  | 'SOURCE_NOT_APPROVED'
  | 'EFFECTIVE_DATE_NOT_REACHED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'HASH_MISMATCH'
  | 'SYNTHETIC_NOT_PRODUCTION'
  | 'CONFLICTING_ACTIVE_VERSION'
  | 'IDENTITY_NOT_READY';

export interface BusinessInputDomain {
  domainId: string;
  name: string;
}

export interface BusinessInputKnowledgeSource {
  sourceId: string;
  sourceRef: string;
  sourceStatus: BusinessSourceStatus;
  documentVersion: string;
  contentSha256: string;
  sourceFile?: string;
}

export interface BusinessInputAccountability {
  businessOwnerRef: string;
  finalApproverRef: string;
  confirmationRef: string;
  confirmationMethod: string;
  confirmedAt: string;
}

export interface BusinessInputPackage {
  schemaVersion: string;
  packageId: string;
  packageVersion: string;
  packageStatus: BusinessPackageStatus;
  synthetic: boolean;
  domain: BusinessInputDomain;
  serviceAudience: string;
  allowedScope: string[];
  excludedScope: string[];
  handoffScenarios: string[];
  prohibitedActions: string[];
  knowledgeSource: BusinessInputKnowledgeSource;
  accountability: BusinessInputAccountability;
  effectiveAt: string;
  expiresAt?: string;
  canonicalSha256: string;
}

export interface BusinessReadinessReport {
  status: BusinessReadinessStatus;
  target: BusinessReadinessTarget;
  packageId: string | null;
  packageVersion: string | null;
  reasonCodes: BusinessReadinessReasonCode[];
  canonicalSha256: string | null;
}

export interface BusinessReadinessEvaluationOptions {
  canonicalSha256: string | null;
  sourceContentSha256?: string | null;
  now?: Date;
  activePackages?: readonly BusinessInputPackage[];
}

export class BusinessInputPackageValidationError extends Error {
  readonly reasonCodes: BusinessReadinessReasonCode[];

  constructor(reasonCodes: BusinessReadinessReasonCode[]) {
    super('Business input package validation failed');
    this.name = 'BusinessInputPackageValidationError';
    this.reasonCodes = reasonCodes;
  }
}

export class BusinessReadinessError extends Error {
  readonly report: BusinessReadinessReport;

  constructor(report: BusinessReadinessReport) {
    super('Business readiness assertion failed');
    this.name = 'BusinessReadinessError';
    this.report = report;
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PACKAGE_STATUSES: BusinessPackageStatus[] = ['draft', 'pending_confirmation', 'confirmed', 'superseded', 'expired', 'rejected'];
const SOURCE_STATUSES: BusinessSourceStatus[] = ['local_eval', 'published', 'superseded', 'expired'];
const PACKAGE_KEYS = [
  'schemaVersion',
  'packageId',
  'packageVersion',
  'packageStatus',
  'synthetic',
  'domain',
  'serviceAudience',
  'allowedScope',
  'excludedScope',
  'handoffScenarios',
  'prohibitedActions',
  'knowledgeSource',
  'accountability',
  'effectiveAt',
  'expiresAt',
  'canonicalSha256',
] as const;
const DOMAIN_KEYS = ['domainId', 'name'] as const;
const SOURCE_KEYS = ['sourceId', 'sourceRef', 'sourceStatus', 'documentVersion', 'contentSha256', 'sourceFile'] as const;
const ACCOUNTABILITY_KEYS = ['businessOwnerRef', 'finalApproverRef', 'confirmationRef', 'confirmationMethod', 'confirmedAt'] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function collectUnknownKeys(record: RecordValue, allowedKeys: readonly string[], reasons: BusinessReadinessReasonCode[]): void {
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) reasons.push('INVALID_FIELD');
}

function readString(record: RecordValue, key: string, reasons: BusinessReadinessReasonCode[], required = true): string | undefined {
  if (!hasOwn(record, key)) {
    if (required) reasons.push('MISSING_FIELD');
    return undefined;
  }
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    reasons.push('INVALID_FIELD');
    return undefined;
  }
  return value;
}

function readBoolean(record: RecordValue, key: string, reasons: BusinessReadinessReasonCode[]): boolean | undefined {
  if (!hasOwn(record, key)) {
    reasons.push('MISSING_FIELD');
    return undefined;
  }
  if (typeof record[key] !== 'boolean') reasons.push('INVALID_FIELD');
  return typeof record[key] === 'boolean' ? record[key] : undefined;
}

function readStringArray(record: RecordValue, key: string, reasons: BusinessReadinessReasonCode[]): string[] | undefined {
  if (!hasOwn(record, key)) {
    reasons.push('MISSING_FIELD');
    return undefined;
  }
  const value = record[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item): item is string => typeof item === 'string' && item.trim() !== '')) {
    reasons.push('INVALID_FIELD');
    return undefined;
  }
  return value;
}

function isPackageStatus(value: string): value is BusinessPackageStatus {
  return PACKAGE_STATUSES.some((candidate) => candidate === value);
}

function isSourceStatus(value: string): value is BusinessSourceStatus {
  return SOURCE_STATUSES.some((candidate) => candidate === value);
}

function readDomain(record: RecordValue, reasons: BusinessReadinessReasonCode[]): BusinessInputDomain | undefined {
  const value = record.domain;
  if (!isRecord(value)) {
    reasons.push(hasOwn(record, 'domain') ? 'INVALID_FIELD' : 'MISSING_FIELD');
    return undefined;
  }
  collectUnknownKeys(value, DOMAIN_KEYS, reasons);
  const domainId = readString(value, 'domainId', reasons);
  const name = readString(value, 'name', reasons);
  return domainId && name ? { domainId, name } : undefined;
}

function readKnowledgeSource(record: RecordValue, reasons: BusinessReadinessReasonCode[]): BusinessInputKnowledgeSource | undefined {
  const value = record.knowledgeSource;
  if (!isRecord(value)) {
    reasons.push(hasOwn(record, 'knowledgeSource') ? 'INVALID_FIELD' : 'MISSING_FIELD');
    return undefined;
  }
  collectUnknownKeys(value, SOURCE_KEYS, reasons);
  const sourceId = readString(value, 'sourceId', reasons);
  const sourceRef = readString(value, 'sourceRef', reasons);
  const sourceStatus = readString(value, 'sourceStatus', reasons);
  const documentVersion = readString(value, 'documentVersion', reasons);
  const contentSha256 = readString(value, 'contentSha256', reasons);
  const sourceFile = readString(value, 'sourceFile', reasons, false);
  if (sourceStatus && !isSourceStatus(sourceStatus)) reasons.push('INVALID_FIELD');
  if (contentSha256 && !SHA256_PATTERN.test(contentSha256)) reasons.push('INVALID_FIELD');
  return sourceId && sourceRef && documentVersion && contentSha256 && sourceStatus && isSourceStatus(sourceStatus)
    ? { sourceId, sourceRef, sourceStatus, documentVersion, contentSha256, ...(sourceFile ? { sourceFile } : {}) }
    : undefined;
}

function readAccountability(record: RecordValue, reasons: BusinessReadinessReasonCode[]): BusinessInputAccountability | undefined {
  const value = record.accountability;
  if (!isRecord(value)) {
    reasons.push(hasOwn(record, 'accountability') ? 'INVALID_FIELD' : 'MISSING_FIELD');
    return undefined;
  }
  collectUnknownKeys(value, ACCOUNTABILITY_KEYS, reasons);
  const businessOwnerRef = readString(value, 'businessOwnerRef', reasons);
  const finalApproverRef = readString(value, 'finalApproverRef', reasons);
  const confirmationRef = readString(value, 'confirmationRef', reasons);
  const confirmationMethod = readString(value, 'confirmationMethod', reasons);
  const confirmedAt = readString(value, 'confirmedAt', reasons);
  return businessOwnerRef && finalApproverRef && confirmationRef && confirmationMethod && confirmedAt
    ? { businessOwnerRef, finalApproverRef, confirmationRef, confirmationMethod, confirmedAt }
    : undefined;
}

function uniqueReasons(reasons: BusinessReadinessReasonCode[]): BusinessReadinessReasonCode[] {
  const order: BusinessReadinessReasonCode[] = [
    'MISSING_FIELD',
    'INVALID_FIELD',
    'NOT_CONFIRMED',
    'SOURCE_NOT_APPROVED',
    'EFFECTIVE_DATE_NOT_REACHED',
    'EXPIRED',
    'SUPERSEDED',
    'HASH_MISMATCH',
    'SYNTHETIC_NOT_PRODUCTION',
    'CONFLICTING_ACTIVE_VERSION',
    'IDENTITY_NOT_READY',
  ];
  return order.filter((code) => reasons.includes(code));
}

export function loadBusinessInputPackage(input: unknown): BusinessInputPackage {
  const reasons: BusinessReadinessReasonCode[] = [];
  if (!isRecord(input)) throw new BusinessInputPackageValidationError(['INVALID_FIELD']);
  collectUnknownKeys(input, PACKAGE_KEYS, reasons);
  const schemaVersion = readString(input, 'schemaVersion', reasons);
  const packageId = readString(input, 'packageId', reasons);
  const packageVersion = readString(input, 'packageVersion', reasons);
  const packageStatus = readString(input, 'packageStatus', reasons);
  const synthetic = readBoolean(input, 'synthetic', reasons);
  const domain = readDomain(input, reasons);
  const serviceAudience = readString(input, 'serviceAudience', reasons);
  const allowedScope = readStringArray(input, 'allowedScope', reasons);
  const excludedScope = readStringArray(input, 'excludedScope', reasons);
  const handoffScenarios = readStringArray(input, 'handoffScenarios', reasons);
  const prohibitedActions = readStringArray(input, 'prohibitedActions', reasons);
  const knowledgeSource = readKnowledgeSource(input, reasons);
  const accountability = readAccountability(input, reasons);
  const effectiveAt = readString(input, 'effectiveAt', reasons);
  const expiresAt = readString(input, 'expiresAt', reasons, false);
  const canonicalSha256 = readString(input, 'canonicalSha256', reasons);
  if (packageStatus && !isPackageStatus(packageStatus)) reasons.push('INVALID_FIELD');
  if (canonicalSha256 && !SHA256_PATTERN.test(canonicalSha256)) reasons.push('INVALID_FIELD');
  if (reasons.length > 0 || !schemaVersion || !packageId || !packageVersion || !packageStatus || synthetic === undefined || !domain || !serviceAudience || !allowedScope || !excludedScope || !handoffScenarios || !prohibitedActions || !knowledgeSource || !accountability || !effectiveAt || !canonicalSha256 || !isPackageStatus(packageStatus)) {
    throw new BusinessInputPackageValidationError(uniqueReasons(reasons));
  }
  return {
    schemaVersion,
    packageId,
    packageVersion,
    packageStatus,
    synthetic,
    domain,
    serviceAudience,
    allowedScope,
    excludedScope,
    handoffScenarios,
    prohibitedActions,
    knowledgeSource,
    accountability,
    effectiveAt,
    ...(expiresAt ? { expiresAt } : {}),
    canonicalSha256,
  };
}

function metadata(input: unknown): Pick<BusinessReadinessReport, 'packageId' | 'packageVersion' | 'canonicalSha256'> {
  if (!isRecord(input)) return { packageId: null, packageVersion: null, canonicalSha256: null };
  return {
    packageId: typeof input.packageId === 'string' ? input.packageId : null,
    packageVersion: typeof input.packageVersion === 'string' ? input.packageVersion : null,
    canonicalSha256: typeof input.canonicalSha256 === 'string' && SHA256_PATTERN.test(input.canonicalSha256) ? input.canonicalSha256 : null,
  };
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function canonicalizeBusinessInputPackage(input: BusinessInputPackage): string {
  const { canonicalSha256: _canonicalSha256, ...withoutHash } = input;
  return stableStringify(withoutHash);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function reportFor(input: unknown, target: BusinessReadinessTarget, reasonCodes: BusinessReadinessReasonCode[]): BusinessReadinessReport {
  const details = metadata(input);
  return { status: 'NOT_READY', target, ...details, reasonCodes: uniqueReasons(reasonCodes), canonicalSha256: details.canonicalSha256 };
}

export function evaluateBusinessReadiness(input: unknown, target: BusinessReadinessTarget, options: BusinessReadinessEvaluationOptions): BusinessReadinessReport {
  const reasons: BusinessReadinessReasonCode[] = [];
  let packageInput: BusinessInputPackage;
  try {
    packageInput = loadBusinessInputPackage(input);
  } catch (error) {
    if (error instanceof BusinessInputPackageValidationError) return reportFor(input, target, error.reasonCodes);
    return reportFor(input, target, ['INVALID_FIELD']);
  }

  const now = options.now ?? new Date();
  if (!isValidDate(packageInput.effectiveAt)) reasons.push('INVALID_FIELD');
  if (packageInput.expiresAt && !isValidDate(packageInput.expiresAt)) reasons.push('INVALID_FIELD');
  if (isValidDate(packageInput.effectiveAt) && new Date(packageInput.effectiveAt) > now) reasons.push('EFFECTIVE_DATE_NOT_REACHED');
  if (packageInput.expiresAt && isValidDate(packageInput.expiresAt) && new Date(packageInput.expiresAt) <= now) reasons.push('EXPIRED');
  if (packageInput.expiresAt && isValidDate(packageInput.effectiveAt) && isValidDate(packageInput.expiresAt) && new Date(packageInput.expiresAt) <= new Date(packageInput.effectiveAt)) reasons.push('INVALID_FIELD');
  if (packageInput.packageStatus === 'superseded') reasons.push('SUPERSEDED');
  if (packageInput.packageStatus === 'expired') reasons.push('EXPIRED');
  if (packageInput.packageStatus === 'rejected' || packageInput.packageStatus !== 'confirmed') reasons.push('NOT_CONFIRMED');
  if (target === 'production' && packageInput.knowledgeSource.sourceStatus !== 'published') reasons.push('SOURCE_NOT_APPROVED');
  if (options.canonicalSha256 === null || options.canonicalSha256 !== packageInput.canonicalSha256) reasons.push('HASH_MISMATCH');
  if (options.sourceContentSha256 !== undefined && (options.sourceContentSha256 === null || options.sourceContentSha256 !== packageInput.knowledgeSource.contentSha256)) reasons.push('HASH_MISMATCH');

  if (packageInput.synthetic) {
    if (target === 'production') reasons.push('SYNTHETIC_NOT_PRODUCTION');
    if (packageInput.knowledgeSource.sourceStatus !== 'local_eval') reasons.push('SOURCE_NOT_APPROVED');
    if (packageInput.accountability.confirmationMethod !== 'synthetic_local_eval') reasons.push('INVALID_FIELD');
  } else {
    if (packageInput.accountability.confirmationMethod === 'synthetic_local_eval') reasons.push('INVALID_FIELD');
    if (target === 'production' && packageInput.knowledgeSource.sourceStatus !== 'published') reasons.push('SOURCE_NOT_APPROVED');
  }

  const activePackages = options.activePackages ?? [packageInput];
  const activeDomainVersions = activePackages.filter((candidate) => candidate.domain.domainId === packageInput.domain.domainId && candidate.packageStatus === 'confirmed' && (candidate.knowledgeSource.sourceStatus === 'published' || candidate.knowledgeSource.sourceStatus === 'local_eval') && new Date(candidate.effectiveAt) <= now && (!candidate.expiresAt || new Date(candidate.expiresAt) > now));
  if (activeDomainVersions.length > 1) reasons.push('CONFLICTING_ACTIVE_VERSION');

  const finalReasons = uniqueReasons(reasons);
  if (finalReasons.length > 0) return reportFor(packageInput, target, finalReasons);
  return {
    status: target === 'local_eval' ? 'LOCAL_EVAL_READY' : 'PRODUCTION_READY',
    target,
    packageId: packageInput.packageId,
    packageVersion: packageInput.packageVersion,
    reasonCodes: [],
    canonicalSha256: packageInput.canonicalSha256,
  };
}

export function assertProductionReadiness(report: BusinessReadinessReport): void {
  if (report.status !== 'PRODUCTION_READY') throw new BusinessReadinessError(report);
}
