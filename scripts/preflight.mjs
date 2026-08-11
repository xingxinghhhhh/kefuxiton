import { formatConfigIssues, runPreflight } from '../packages/config/dist/index.js';

try {
  const result = runPreflight(process.env);
  if (!result.ok) {
    console.error(`Configuration preflight failed: ${formatConfigIssues(result.issues)}`);
    process.exitCode = 1;
  } else {
    console.log(`Configuration preflight passed: environment=${result.appEnv}; fields=${result.checkedFields.join(',')}`);
  }
} catch {
  console.error('Configuration preflight failed: CONFIG_INVALID field=PREFLIGHT');
  process.exitCode = 2;
}
