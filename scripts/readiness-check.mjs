import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BusinessInputPackageValidationError,
  canonicalizeBusinessInputPackage,
  evaluateBusinessReadiness,
  loadBusinessInputPackage,
} from '../packages/config/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArguments(argumentsList) {
  const values = { activeManifests: [] };
  for (const argument of argumentsList) {
    const separator = argument.indexOf('=');
    const name = separator >= 0 ? argument.slice(0, separator) : argument;
    const value = separator >= 0 ? argument.slice(separator + 1) : '';
    if (name === '--manifest' || name === '--target' || name === '--active-manifest') {
      if (!value) throw new Error('INVALID_ARGUMENT');
      if (name === '--active-manifest') values.activeManifests.push(value);
      else values[name.slice(2)] = value;
    } else {
      throw new Error('INVALID_ARGUMENT');
    }
  }
  if (!values.manifest || !['local_eval', 'production'].includes(values.target)) throw new Error('INVALID_ARGUMENT');
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

async function readPackage(manifestPath) {
  const content = await readFile(safePath(manifestPath), 'utf8');
  const raw = JSON.parse(content);
  const packageInput = loadBusinessInputPackage(raw);
  const sourceContentSha256 = packageInput.knowledgeSource.sourceFile
    ? sha256(await readFile(safePath(packageInput.knowledgeSource.sourceFile), 'utf8'))
    : undefined;
  return {
    packageInput,
    canonicalSha256: sha256(canonicalizeBusinessInputPackage(packageInput)),
    sourceContentSha256,
  };
}

function output(report) {
  console.log(JSON.stringify({
    status: report.status,
    target: report.target,
    packageId: report.packageId,
    packageVersion: report.packageVersion,
    reasonCodes: report.reasonCodes,
    canonicalSha256: report.canonicalSha256,
  }));
}

function isCliInputError(error) {
  return error instanceof SyntaxError || ['ENOENT', 'EACCES', 'INVALID_PATH', 'INVALID_ARGUMENT'].includes(error?.code ?? error?.message);
}

let argumentsValue;
try {
  argumentsValue = parseArguments(process.argv.slice(2));
} catch {
  output({ status: 'NOT_READY', target: 'local_eval', packageId: null, packageVersion: null, reasonCodes: ['INVALID_FIELD'], canonicalSha256: null });
  process.exitCode = 2;
}

if (argumentsValue) {
  try {
    const current = await readPackage(argumentsValue.manifest);
    const active = [];
    for (const manifest of argumentsValue.activeManifests) active.push((await readPackage(manifest)).packageInput);
    const report = evaluateBusinessReadiness(current.packageInput, argumentsValue.target, {
      canonicalSha256: current.canonicalSha256,
      sourceContentSha256: current.sourceContentSha256,
      activePackages: [current.packageInput, ...active],
    });
    output(report);
    process.exitCode = report.status === 'NOT_READY' ? 1 : 0;
  } catch (error) {
    const reasonCodes = error instanceof BusinessInputPackageValidationError ? error.reasonCodes : ['INVALID_FIELD'];
    output({ status: 'NOT_READY', target: argumentsValue.target, packageId: null, packageVersion: null, reasonCodes, canonicalSha256: null });
    process.exitCode = error instanceof BusinessInputPackageValidationError ? 1 : (isCliInputError(error) ? 2 : 3);
  }
}
