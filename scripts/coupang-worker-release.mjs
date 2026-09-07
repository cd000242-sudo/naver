/** Usage: node ... --project-root=<root with .env> [--deploy --expected-sha=<inspected hash>]
 * Cloudflare /content PUT changes code only, leaving config/metadata intact.
 * Docs: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/update/
 */
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { patchCoupangWorker } from './coupang-worker-patch.mjs';

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(option('project-root') || process.cwd());
const require = createRequire(path.join(root, 'package.json'));
require(path.join(root, 'scripts/load-project-env.js')).loadProjectEnv(root);
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Cloudflare API token is not configured');
const deploymentScript = await readFile(path.join(root, 'tmp/cf-worker/deploy.js'), 'utf8');
const account = deploymentScript.match(/const ACCOUNT = '([a-f0-9]{32})'/)?.[1];
if (!account) throw new Error('Existing Worker account could not be resolved');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/leword-keyword-api`;
const hash = text => createHash('sha256').update(text).digest('hex');
const request = async (suffix, options = {}) => {
  const response = await fetch(base + suffix, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cloudflare request failed: ${response.status}`);
  return response;
};
const settings = async () => {
  const result = await (await request('/settings')).json();
  if (!result.success) throw new Error('Could not read current Worker settings');
  return result.result;
};
const getCode = async () => {
  const response = await request('/content/v2');
  const main = response.headers.get('cf-worker-main-module-part');
  const form = await response.formData();
  const modules = [];
  for (const [name, value] of form) if (typeof value !== 'string') modules.push({ name, file: value });
  if (modules.length !== 1 || (main && modules[0].name !== main)) throw new Error('Multi-module or unknown Worker layout; inspect manually');
  return { moduleName: modules[0].name, source: await modules[0].file.text() };
};
const current = await getCode();
const beforeSettings = await settings();
const beforeHash = hash(current.source);
const patched = patchCoupangWorker(current.source);
console.log(JSON.stringify({ mode: args.includes('--deploy') ? 'deploy' : 'inspect', beforeHash, afterHash: hash(patched), module: current.moduleName,
  needsChange: patched !== current.source, bindings: (beforeSettings.bindings || []).map(({ name, type }) => ({ name, type })) }));
if (args.includes('--deploy') && patched !== current.source) {
  if (option('expected-sha') !== beforeHash) throw new Error('Current source differs from inspected hash; refusing upload');
  // Backup is an ignored recovery artifact, never a repository file or log output.
  const backupDir = path.join(root, 'tmp', `coupang-worker-backup-${Date.now()}`);
  await mkdir(backupDir, { recursive: false });
  await writeFile(path.join(backupDir, 'before.mjs'), current.source, { flag: 'wx' });
  await writeFile(path.join(backupDir, 'after.mjs'), patched, { flag: 'wx' });
  const syntax = spawnSync(process.execPath, ['--check', path.join(backupDir, 'after.mjs')], { encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error('Patched Worker syntax check failed; refusing upload');
  const latest = await getCode();
  if (hash(latest.source) !== beforeHash) throw new Error('Concurrent Worker deployment detected; refusing upload');
  const body = new FormData();
  body.set('metadata', JSON.stringify({ main_module: current.moduleName }));
  body.set(current.moduleName, new Blob([patched], { type: 'application/javascript+module' }), current.moduleName);
  const uploaded = await (await request('/content', { method: 'PUT', body })).json();
  if (!uploaded.success) throw new Error('Worker code upload did not succeed');
  const verified = await getCode();
  if (hash(verified.source) !== hash(patched)) throw new Error('Uploaded Worker code differs; inspect deployment');
  const afterSettings = await settings();
  const fields = ['bindings', 'compatibility_date', 'compatibility_flags', 'usage_model', 'placement', 'tags', 'tail_consumers', 'logpush'];
  const unchanged = fields.every(field => JSON.stringify(beforeSettings[field]) === JSON.stringify(afterSettings[field]));
  if (!unchanged) throw new Error('Worker settings changed; inspect before continuing');
  console.log(JSON.stringify({ deployed: true, sourceVerified: true, settingsPreserved: true, backupDir }));
}
