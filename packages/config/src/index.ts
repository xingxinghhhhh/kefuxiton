export type AppEnvironment = 'development' | 'test' | 'production';
export type StaffAuthMode = 'deny' | 'test';
export type ConfigTarget = 'api' | 'web' | 'preflight';

export type ConfigErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'CONFIG_FORBIDDEN_IN_ENV'
  | 'CONFIG_SECRET_FORBIDDEN'
  | 'CONFIG_URL_INVALID';

export interface ConfigIssue {
  code: ConfigErrorCode;
  field: string;
}

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  port: number;
  webOrigin: string;
  databaseUrl: string;
  nextPublicApiBaseUrl: string;
  staffAuthMode: StaffAuthMode;
  testStaffToken?: string;
  testStaffId?: string;
  allowKnowledgePublish: boolean;
}

export interface ConfigValidationOptions {
  target?: ConfigTarget;
  strict?: boolean;
}

export interface PreflightSuccess {
  ok: true;
  appEnv: AppEnvironment;
  checkedFields: string[];
}

export interface PreflightFailure {
  ok: false;
  issues: ConfigIssue[];
}

export type PreflightResult = PreflightSuccess | PreflightFailure;

export class ConfigValidationError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super('Runtime configuration validation failed');
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

const DEFAULT_PORT = 3001;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';
const DEFAULT_API_BASE_URL = 'http://localhost:3001/api/v1';
const TEST_TOKEN_MIN_LENGTH = 16;
const CONFIG_FIELDS = [
  'APP_ENV',
  'PORT',
  'WEB_ORIGIN',
  'DATABASE_URL',
  'NEXT_PUBLIC_API_BASE_URL',
  'STAFF_AUTH_MODE',
  'ALLOW_KNOWLEDGE_PUBLISH',
];

type Environment = Readonly<Record<string, string | undefined>>;

function hasValue(environment: Environment, field: string): boolean {
  return environment[field] !== undefined && environment[field] !== '';
}

function addIssue(issues: ConfigIssue[], code: ConfigErrorCode, field: string): void {
  issues.push({ code, field });
}

function requiredValue(
  environment: Environment,
  field: string,
  issues: ConfigIssue[],
  required: boolean,
  fallback?: string,
): string | undefined {
  const value = environment[field];
  if (value === undefined || value === '') {
    if (required) addIssue(issues, 'CONFIG_MISSING', field);
    return fallback;
  }
  return value;
}

function parseEnvironment(value: string | undefined, issues: ConfigIssue[], required: boolean): AppEnvironment {
  if (value === undefined || value === '') {
    if (required) addIssue(issues, 'CONFIG_MISSING', 'APP_ENV');
    return 'development';
  }
  if (value === 'development' || value === 'test' || value === 'production') return value;
  addIssue(issues, 'CONFIG_INVALID', 'APP_ENV');
  return 'development';
}

function parsePort(value: string | undefined, issues: ConfigIssue[], required: boolean): number {
  if (value === undefined || value === '') {
    if (required) addIssue(issues, 'CONFIG_MISSING', 'PORT');
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(value)) {
    addIssue(issues, 'CONFIG_INVALID', 'PORT');
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    addIssue(issues, 'CONFIG_INVALID', 'PORT');
    return DEFAULT_PORT;
  }
  return port;
}

function parseOrigin(value: string, field: string, appEnv: AppEnvironment, issues: ConfigIssue[]): string {
  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      addIssue(issues, 'CONFIG_URL_INVALID', field);
    }
    if (appEnv === 'production' && url.protocol !== 'https:') addIssue(issues, 'CONFIG_FORBIDDEN_IN_ENV', field);
    if (appEnv !== 'production' && url.protocol === 'http:' && !isLocalHttp) addIssue(issues, 'CONFIG_FORBIDDEN_IN_ENV', field);
  } catch {
    addIssue(issues, 'CONFIG_URL_INVALID', field);
  }
  return value;
}

function parseDatabaseUrl(value: string, issues: ConfigIssue[]): string {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
      addIssue(issues, 'CONFIG_URL_INVALID', 'DATABASE_URL');
    }
  } catch {
    addIssue(issues, 'CONFIG_URL_INVALID', 'DATABASE_URL');
  }
  return value;
}

function parseApiBaseUrl(value: string, appEnv: AppEnvironment, issues: ConfigIssue[]): string {
  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || normalizedPath !== '/api/v1') {
      addIssue(issues, 'CONFIG_URL_INVALID', 'NEXT_PUBLIC_API_BASE_URL');
    }
    if (appEnv === 'production' && url.protocol !== 'https:') addIssue(issues, 'CONFIG_FORBIDDEN_IN_ENV', 'NEXT_PUBLIC_API_BASE_URL');
  } catch {
    addIssue(issues, 'CONFIG_URL_INVALID', 'NEXT_PUBLIC_API_BASE_URL');
  }
  return value;
}

function parseStaffAuthMode(value: string | undefined, issues: ConfigIssue[], required: boolean): StaffAuthMode {
  if (value === undefined || value === '') {
    if (required) addIssue(issues, 'CONFIG_MISSING', 'STAFF_AUTH_MODE');
    return 'deny';
  }
  if (value === 'deny' || value === 'test') return value;
  addIssue(issues, 'CONFIG_INVALID', 'STAFF_AUTH_MODE');
  return 'deny';
}

function parseBooleanFlag(value: string | undefined, field: string, issues: ConfigIssue[], required: boolean): boolean {
  if (value === undefined || value === '') {
    if (required) addIssue(issues, 'CONFIG_MISSING', field);
    return false;
  }
  if (value === '0') return false;
  if (value === '1') return true;
  addIssue(issues, 'CONFIG_INVALID', field);
  return false;
}

function uniqueIssues(issues: ConfigIssue[]): ConfigIssue[] {
  return issues.filter((issue, index) => issues.findIndex((candidate) => candidate.code === issue.code && candidate.field === issue.field) === index);
}

/**
 * Validates configuration without including values in errors, because environment values can contain secrets.
 * Runtime callers may use safe development defaults; the preflight target always requires explicit fields.
 */
export function validateRuntimeConfig(environment: Environment, options: ConfigValidationOptions = {}): RuntimeConfig {
  const target = options.target ?? 'preflight';
  const strict = options.strict ?? target === 'preflight';
  const issues: ConfigIssue[] = [];
  const appEnv = parseEnvironment(environment.APP_ENV, issues, strict);
  const port = parsePort(environment.PORT, issues, strict);
  const webOriginValue = requiredValue(environment, 'WEB_ORIGIN', issues, strict, DEFAULT_WEB_ORIGIN) ?? DEFAULT_WEB_ORIGIN;
  const databaseValue = requiredValue(environment, 'DATABASE_URL', issues, target === 'api' || target === 'preflight') ?? '';
  const apiBaseValue = requiredValue(environment, 'NEXT_PUBLIC_API_BASE_URL', issues, strict && (target === 'web' || target === 'preflight'), DEFAULT_API_BASE_URL) ?? DEFAULT_API_BASE_URL;
  const staffAuthMode = parseStaffAuthMode(environment.STAFF_AUTH_MODE, issues, strict);
  const allowKnowledgePublish = parseBooleanFlag(environment.ALLOW_KNOWLEDGE_PUBLISH, 'ALLOW_KNOWLEDGE_PUBLISH', issues, strict);

  if (databaseValue) parseDatabaseUrl(databaseValue, issues);
  parseOrigin(webOriginValue, 'WEB_ORIGIN', appEnv, issues);
  parseApiBaseUrl(apiBaseValue, appEnv, issues);

  const testStaffToken = environment.AI_AGENT_TEST_STAFF_TOKEN;
  const testStaffId = environment.AI_AGENT_TEST_STAFF_ID;
  if (staffAuthMode === 'test') {
    if (!testStaffToken) addIssue(issues, 'CONFIG_MISSING', 'AI_AGENT_TEST_STAFF_TOKEN');
    else if (testStaffToken.length < TEST_TOKEN_MIN_LENGTH) addIssue(issues, 'CONFIG_INVALID', 'AI_AGENT_TEST_STAFF_TOKEN');
    if (appEnv === 'production') addIssue(issues, 'CONFIG_FORBIDDEN_IN_ENV', 'STAFF_AUTH_MODE');
  }
  if (appEnv === 'production') {
    if (testStaffToken !== undefined) addIssue(issues, 'CONFIG_SECRET_FORBIDDEN', 'AI_AGENT_TEST_STAFF_TOKEN');
    if (testStaffId !== undefined) addIssue(issues, 'CONFIG_SECRET_FORBIDDEN', 'AI_AGENT_TEST_STAFF_ID');
    if (allowKnowledgePublish) addIssue(issues, 'CONFIG_FORBIDDEN_IN_ENV', 'ALLOW_KNOWLEDGE_PUBLISH');
  }

  const finalIssues = uniqueIssues(issues);
  if (finalIssues.length > 0) throw new ConfigValidationError(finalIssues);
  return {
    appEnv,
    port,
    webOrigin: webOriginValue,
    databaseUrl: databaseValue,
    nextPublicApiBaseUrl: apiBaseValue,
    staffAuthMode,
    testStaffToken,
    testStaffId,
    allowKnowledgePublish,
  };
}

export function loadApiConfig(environment: Environment): RuntimeConfig {
  return validateRuntimeConfig(environment, { target: 'api', strict: false });
}

export function loadWebConfig(environment: Environment, strict = false): RuntimeConfig {
  return validateRuntimeConfig(environment, { target: 'web', strict });
}

export function runPreflight(environment: Environment): PreflightResult {
  try {
    const config = validateRuntimeConfig(environment, { target: 'preflight', strict: true });
    return { ok: true, appEnv: config.appEnv, checkedFields: CONFIG_FIELDS };
  } catch (error) {
    if (error instanceof ConfigValidationError) return { ok: false, issues: error.issues };
    return { ok: false, issues: [{ code: 'CONFIG_INVALID', field: 'RUNTIME_CONFIG' }] };
  }
}

export function formatConfigIssues(error: ConfigValidationError | ConfigIssue[]): string {
  const issues = Array.isArray(error) ? error : error.issues;
  return issues.map((issue) => `${issue.code} field=${issue.field}`).join('; ');
}

export function getStaffAuthMode(environment: Environment): StaffAuthMode {
  return parseStaffAuthMode(environment.STAFF_AUTH_MODE, [], false);
}

export function isKnowledgePublishAllowed(environment: Environment): boolean {
  return environment.ALLOW_KNOWLEDGE_PUBLISH === '1';
}

export * from './business-readiness.js';
