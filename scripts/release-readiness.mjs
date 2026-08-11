import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalizeBusinessInputPackage,
  evaluateBusinessReadiness,
  evaluateReleaseReadiness,
  loadBusinessInputPackage,
  runPreflight,
  capabilitiesForRuntime,
  normalizeKnowledgeMarkdown,
} from '../packages/config/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_MANIFEST = 'config/business-readiness/synthetic-local-eval.json';
const SAFE_DATABASE_URL = 'postgresql://readiness-check@localhost:5432/readiness-check';

function output(report) {
  console.log(JSON.stringify({ status: report.status, target: report.target, reasonCodes: report.reasonCodes }));
}

function parseArguments(argumentsList) {
  const values = { manifest: DEFAULT_MANIFEST, target: undefined };
  for (const argument of argumentsList) {
    const separator = argument.indexOf('=');
    const name = separator >= 0 ? argument.slice(0, separator) : argument;
    const value = separator >= 0 ? argument.slice(separator + 1) : '';
    if (name === '--target' || name === '--manifest') {
      if (!value) throw new Error('INVALID_ARGUMENT');
      values[name.slice(2)] = value;
    } else {
      throw new Error('INVALID_ARGUMENT');
    }
  }
  if (!['local_eval', 'rehearsal', 'production'].includes(values.target)) throw new Error('INVALID_ARGUMENT');
  return values;
}

function safePath(candidate) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const relativePath = relative(root, absolute);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('INVALID_PATH');
  return absolute;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashKnowledgeMarkdown(markdown) {
  return sha256(normalizeKnowledgeMarkdown(markdown));
}

async function readBusinessReport(manifestPath, target) {
  const raw = JSON.parse(await readFile(safePath(manifestPath), 'utf8'));
  const packageInput = loadBusinessInputPackage(raw);
  const canonicalSha256 = sha256(canonicalizeBusinessInputPackage(packageInput));
  const sourceContentSha256 = packageInput.knowledgeSource.sourceFile
    ? hashKnowledgeMarkdown(await readFile(safePath(packageInput.knowledgeSource.sourceFile), 'utf8'))
    : undefined;
  return evaluateBusinessReadiness(packageInput, target === 'production' ? 'production' : 'local_eval', {
    canonicalSha256,
    sourceContentSha256,
  });
}

function buildRuntimeEnvironment(target) {
  const appEnv = process.env.APP_ENV ?? target;
  return {
    ...process.env,
    APP_ENV: appEnv,
    PORT: process.env.PORT ?? '3001',
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? (appEnv === 'production' ? 'https://support.example.test' : 'http://localhost:3000'),
    DATABASE_URL: process.env.DATABASE_URL ?? SAFE_DATABASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? (appEnv === 'production' ? 'https://api.example.test/api/v1' : 'http://localhost:3001/api/v1'),
    STAFF_AUTH_MODE: process.env.STAFF_AUTH_MODE ?? 'deny',
    ALLOW_KNOWLEDGE_PUBLISH: process.env.ALLOW_KNOWLEDGE_PUBLISH ?? '0',
  };
}

let argumentsValue;
try {
  argumentsValue = parseArguments(process.argv.slice(2));
} catch {
  output({ status: 'NOT_READY', target: 'production', reasonCodes: ['CONFIG_INVALID'] });
  process.exitCode = 2;
}

if (argumentsValue) {
  const environment = buildRuntimeEnvironment(argumentsValue.target);
  const preflight = runPreflight(environment);
  if (!preflight.ok) {
    output(evaluateReleaseReadiness({
      target: argumentsValue.target,
      appEnv: environment.APP_ENV,
      configValid: false,
      businessReadiness: null,
      capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
    }));
    process.exitCode = 1;
  } else {
    let businessReadiness = null;
    try {
      businessReadiness = await readBusinessReport(argumentsValue.manifest, argumentsValue.target);
    } catch {
      output(evaluateReleaseReadiness({
        target: argumentsValue.target,
        appEnv: preflight.appEnv,
        configValid: true,
        businessReadiness: null,
        capabilities: capabilitiesForRuntime({ staffAuthMode: 'deny' }),
      }));
      process.exitCode = 1;
    }
    if (businessReadiness) {
      const runtime = { staffAuthMode: environment.STAFF_AUTH_MODE === 'test' ? 'test' : 'deny' };
      const report = evaluateReleaseReadiness({
        target: argumentsValue.target,
        appEnv: preflight.appEnv,
        configValid: true,
        businessReadiness,
        capabilities: capabilitiesForRuntime(runtime),
      });
      output(report);
      process.exitCode = report.status === 'NOT_READY' ? 1 : 0;
    }
  }
}
