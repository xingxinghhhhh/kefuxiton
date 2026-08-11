import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatConfigIssues, runPreflight } from '../packages/config/dist/index.js';
import { canonicalizeBusinessInputPackage, evaluateBusinessReadiness, loadBusinessInputPackage, normalizeKnowledgeMarkdown } from '../packages/config/dist/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
function resolveRepositoryPath(candidate, base = repositoryRoot) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(base, candidate);
  const relativePath = relative(repositoryRoot, absolute);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('INVALID_READINESS_PATH');
  return absolute;
}

const readinessManifestPath = process.argv.find((argument) => argument.startsWith('--readiness-manifest='))?.slice('--readiness-manifest='.length);
const requestedReadinessTarget = process.argv.find((argument) => argument.startsWith('--readiness-target='))?.slice('--readiness-target='.length);

function hashKnowledgeMarkdown(markdown) {
  return createHash('sha256').update(normalizeKnowledgeMarkdown(markdown), 'utf8').digest('hex');
}

try {
  const result = runPreflight(process.env);
  if (!result.ok) {
    console.error(`Configuration preflight failed: ${formatConfigIssues(result.issues)}`);
    process.exitCode = 1;
  } else if (readinessManifestPath) {
    const readinessTarget = result.appEnv === 'production' ? 'production' : (requestedReadinessTarget ?? 'local_eval');
    if (!['local_eval', 'production'].includes(readinessTarget)) throw new Error('INVALID_READINESS_TARGET');
    const manifest = JSON.parse(await readFile(resolveRepositoryPath(readinessManifestPath, process.cwd()), 'utf8'));
    const packageInput = loadBusinessInputPackage(manifest);
    const canonicalSha256 = createHash('sha256').update(canonicalizeBusinessInputPackage(packageInput), 'utf8').digest('hex');
    const sourceContentSha256 = packageInput.knowledgeSource.sourceFile
      ? hashKnowledgeMarkdown(await readFile(resolveRepositoryPath(packageInput.knowledgeSource.sourceFile), 'utf8'))
      : undefined;
    const readiness = evaluateBusinessReadiness(packageInput, readinessTarget, { canonicalSha256, sourceContentSha256 });
    if (readiness.status === 'NOT_READY') {
      console.error(`Business readiness preflight failed: target=${readiness.target}; reasons=${readiness.reasonCodes.join(',')}`);
      process.exitCode = 1;
    } else {
      console.log(`Configuration and business readiness preflight passed: environment=${result.appEnv}; target=${readiness.target}; status=${readiness.status}`);
    }
  } else {
    console.log(`Configuration preflight passed: environment=${result.appEnv}; fields=${result.checkedFields.join(',')}`);
  }
} catch {
  console.error('Configuration preflight failed: CONFIG_INVALID field=PREFLIGHT');
  process.exitCode = 2;
}
