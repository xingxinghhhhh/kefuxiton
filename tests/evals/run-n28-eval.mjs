import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const ARTIFACT_EXTENSIONS = new Set(['.cjs', '.css', '.html', '.js', '.json', '.map', '.mjs', '.txt']);
const IGNORED_DIRECTORY_NAMES = new Set(['.next/cache', '.next/static/development', 'dist/cache', 'node_modules']);

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readTree(relativePath) {
  return readDirectoryTree(relativePath, SOURCE_EXTENSIONS, IGNORED_DIRECTORY_NAMES);
}

function readArtifactTree(relativePath) {
  return readDirectoryTree(relativePath, ARTIFACT_EXTENSIONS, IGNORED_DIRECTORY_NAMES);
}

function readDirectoryTree(relativePath, allowedExtensions, ignoredDirectories) {
  const absoluteRoot = join(root, relativePath);
  assert(existsSync(absoluteRoot));
  const files = [];
  function visit(directory, relativeDirectory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const childRelativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const ignored = [...ignoredDirectories].some((directoryName) => childRelativePath.endsWith(directoryName));
        if (!ignored) visit(join(directory, entry.name), childRelativePath);
      } else if (allowedExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(join(directory, entry.name));
      }
    }
  }
  visit(absoluteRoot, relativePath.replaceAll('\\', '/'));
  return files.sort().map((file) => readFileSync(file, 'utf8')).join('\n');
}

function runReadiness(target, environment = {}) {
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(packageManager, ['release:readiness', `--target=${target}`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    windowsHide: true,
    shell: true,
  });
  const output = `${result.stdout ?? ''}`.trim().split(/\r?\n/u).filter((line) => line.startsWith('{')).at(-1) ?? '';
  return { exitCode: result.status, report: JSON.parse(output) };
}

function assert(condition) {
  if (!condition) throw new Error('assertion failed');
}

function assertSafeReport(report) {
  assert(Object.keys(report).sort().join(',') === 'reasonCodes,status,target');
  assert(typeof report.status === 'string' && typeof report.target === 'string' && Array.isArray(report.reasonCodes));
}

function assertNoProductionMarker(value) {
  assert(!/(langgraph-lab|@langchain|MemorySaver|LangGraph)/u.test(value));
}

function runCase(caseId, callback) {
  try {
    callback();
    console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  } catch {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N28_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
const cases = readJson('tests/evals/n28-release-decision.json');
const rootPackage = readJson('package.json');
const productionPackages = ['apps/api/package.json', 'apps/web/package.json', 'packages/config/package.json', 'packages/contracts/package.json'];
const productionSources = {
  api: readTree('apps/api/src'),
  web: readTree('apps/web'),
  config: readTree('packages/config/src'),
  contracts: readTree('packages/contracts/src'),
};
const readinessSource = readText('packages/config/src/release-readiness.ts');
const mainSource = readText('apps/api/src/main.ts');
const snapshotSource = readText('packages/langgraph-lab/src/gate-snapshot.ts');
const n27Eval = readText('tests/evals/run-n27-eval.mjs');
const n27Cases = readJson('tests/evals/n27-langgraph-evidence-chain.json');
const evaluatorSource = readText('tests/evals/run-n28-eval.mjs');
const packageManifests = productionPackages.map(readText).join('\n');

assert(cases.length === 21);
assert(new Set(cases.map((testCase) => testCase.id)).size === 21);
assert(cases.filter((testCase) => testCase.category === 'readiness').length === 10);
assert(cases.filter((testCase) => testCase.category === 'production-isolation').length === 5);
assert(cases.filter((testCase) => testCase.category === 'contract').length === 3);
assert(cases.filter((testCase) => testCase.category === 'safety').length === 3);

const productionReasons = [
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
];

runCase('N28-R01', () => {
  const result = runReadiness('local_eval');
  assert(result.exitCode === 0 && result.report.status === 'LOCAL_EVAL_READY' && result.report.reasonCodes.length === 0);
});
runCase('N28-R02', () => {
  const result = runReadiness('rehearsal');
  assert(result.exitCode === 0 && result.report.status === 'REHEARSAL_READY' && result.report.reasonCodes.length === 0);
});
runCase('N28-R03', () => {
  const result = runReadiness('production');
  assert(result.exitCode === 1 && result.report.status === 'NOT_READY' && result.report.target === 'production');
});
runCase('N28-R04', () => {
  const result = runReadiness('production');
  assert(JSON.stringify(result.report.reasonCodes) === JSON.stringify(productionReasons));
});
runCase('N28-R05', () => {
  assert(readinessSource.includes("knowledge: 'synthetic_local_eval'"));
  assert(readinessSource.includes("'SYNTHETIC_NOT_PRODUCTION'"));
});
runCase('N28-R06', () => {
  const result = runReadiness('production', { STAFF_AUTH_MODE: 'deny' });
  assert(result.report.reasonCodes.includes('STAFF_IDENTITY_NOT_CONFIGURED'));
  assert(readinessSource.includes("staff !== 'identity_provider'"));
});
runCase('N28-R07', () => {
  const result = runReadiness('production');
  assert(result.report.reasonCodes.includes('AGENT_PROVIDER_NOT_CONFIGURED'));
  assert(readinessSource.includes("agent !== 'provider'"));
});
runCase('N28-R08', () => {
  assert(readinessSource.includes('deploymentConfigured: false'));
  assert(readinessSource.includes('DEPLOYMENT_TARGET_NOT_CONFIGURED'));
});
runCase('N28-R09', () => {
  const result = runReadiness('production');
  assertSafeReport(result.report);
});
runCase('N28-R10', () => {
  assert(readinessSource.includes('Capability values are supplied by code-owned adapters'));
  assert(mainSource.includes('evaluateReleaseReadiness'));
  assert(mainSource.includes('NestFactory.create'));
});
runCase('N28-R11', () => assertNoProductionMarker(productionSources.api));
runCase('N28-R12', () => assertNoProductionMarker(productionSources.web));
runCase('N28-R13', () => assertNoProductionMarker(`${productionSources.config}\n${productionSources.contracts}`));
runCase('N28-R14', () => assertNoProductionMarker(packageManifests));
runCase('N28-R15', () => {
  assert(rootPackage.scripts.build === 'pnpm --filter @ai-agent/config build && pnpm --filter @ai-agent/contracts build && pnpm --filter @ai-agent/api build && pnpm --filter @ai-agent/web build');
  assert(!rootPackage.scripts.build.includes('langgraph'));
  const productionArtifacts = `${readArtifactTree('apps/api/dist')}\n${readArtifactTree('apps/web/.next')}`;
  assertNoProductionMarker(productionArtifacts);
});
runCase('N28-R16', () => {
  assert(snapshotSource.includes('export interface EvidenceGateSnapshot'));
  for (const field of ['status', 'bundleSchemaVersion', 'sourceSchemaVersion', 'digestAlgorithm', 'expectedCaseCount', 'validatedCaseCount', 'bundleDigest', 'bundleDigestMatch', 'reasonCode']) {
    assert(snapshotSource.includes(`${field}:`));
  }
  assert(!snapshotSource.includes(['n28', 'v1'].join('.')));
});
runCase('N28-R17', () => {
  assert(n27Cases.length === 18);
  const runtimeSchemaMarker = ['n28', 'v1'].join('.');
  assert(!n27Eval.includes(runtimeSchemaMarker));
  assert(!evaluatorSource.includes(runtimeSchemaMarker));
});
runCase('N28-R18', () => {
  for (const evalName of ['run-n17-eval.mjs', 'run-n18-eval.mjs', 'run-n19-eval.mjs', 'run-n20-eval.mjs', 'run-n21-eval.mjs', 'run-n22-eval.mjs', 'run-n23-eval.mjs', 'run-n24-eval.mjs', 'run-n25-eval.mjs', 'run-n26-eval.mjs', 'run-n27-eval.mjs']) {
    assert(rootPackage.scripts['test:langgraph-lab'].includes(evalName));
  }
});
runCase('N28-R19', () => {
  assert(!evaluatorSource.includes(['fet', 'ch('].join('')));
  assert(!evaluatorSource.includes(['write', 'File'].join('')));
  assert(!evaluatorSource.includes(['mk', 'dir'].join('')));
  assert(!evaluatorSource.includes(['rm', 'Sync'].join('')));
  assert(!evaluatorSource.includes(['@', 'prisma'].join('')) && !evaluatorSource.includes(['@', 'nestjs'].join('')));
});
runCase('N28-R20', () => {
  assert(evaluatorSource.includes("{ caseId, status: 'passed', reasonCode: 'NONE' }"));
  assert(evaluatorSource.includes("{ caseId, status: 'failed', reasonCode: 'N28_EVAL_FAILED' }"));
});
runCase('N28-R21', () => {
  const evaluatedText = `${readText('tests/evals/n28-release-decision.json')}\n${evaluatorSource}`;
  const secretPattern = new RegExp([
    ['sk', '-[A-Za-z0-9]'].join(''),
    ['postgres', 'ql:\\/\\/[^\\s@]+@'].join(''),
    ['C:', '\\\\\\\\'].join(''),
    ['D:', '\\\\\\\\'].join(''),
  ].join('|'), 'u');
  assert(!secretPattern.test(evaluatedText));
  assert(!evaluatorSource.includes(['cus', 'tomer'].join('')) && !evaluatorSource.includes(['pro', 'mpt'].join('')) && !evaluatorSource.includes(['to', 'ken'].join('')));
});

if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N28-BOOTSTRAP', status: 'failed', reasonCode: 'N28_EVAL_FAILED' }));
  process.exitCode = 1;
}
