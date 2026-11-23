// Saved-account registry for the subscription agents that can keep one folder per account.
//
// Layout (under Electron userData, never inside ~/.codex or ~/.claude):
//   agent-profiles/registry.json            ids + timestamps + active pointer ONLY (no secrets)
//   agent-profiles/<provider>/<id>/         CODEX_HOME / CLAUDE_CONFIG_DIR of that account
//
// The account that is already logged in at the CLI's own default location stays the "default"
// account: it is never moved, copied, or deleted by this module.
//
// Everything here is synchronous on purpose: the environment builders that every CLI launch goes
// through are synchronous, and the registry is small. The active pointer is not a secret.
import { app } from 'electron';
import { randomBytes } from 'crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';

export const DEFAULT_ACCOUNT_ID = 'default';
export type AccountScopedProvider = 'codex' | 'claude';

export interface AgentAccountRecord {
  readonly id: string;
  readonly createdAt: number;
}

interface RegistryState {
  readonly version: 1;
  readonly active: Readonly<Partial<Record<AccountScopedProvider, string>>>;
  readonly accounts: Readonly<Record<AccountScopedProvider, readonly AgentAccountRecord[]>>;
}

const ACCOUNT_ID_PATTERN = /^acct-[0-9a-f]{12}$/;
const EMPTY_STATE: RegistryState = Object.freeze({
  version: 1,
  active: Object.freeze({}),
  accounts: Object.freeze({ codex: Object.freeze([]), claude: Object.freeze([]) }),
});

let cachedState: RegistryState | undefined;

export function isAccountScopedProvider(value: unknown): value is AccountScopedProvider {
  return value === 'codex' || value === 'claude';
}

export function isValidAgentAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value);
}

export function getAgentProfilesRoot(): string {
  return join(app.getPath('userData'), 'agent-profiles');
}

function registryFile(): string {
  return join(getAgentProfilesRoot(), 'registry.json');
}

function sanitizeRecords(value: unknown): readonly AgentAccountRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: AgentAccountRecord[] = [];
  for (const item of value) {
    const id = (item as { id?: unknown } | null)?.id;
    const createdAt = (item as { createdAt?: unknown } | null)?.createdAt;
    if (!isValidAgentAccountId(id) || seen.has(id)) continue;
    seen.add(id);
    records.push(Object.freeze({ id, createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0 }));
  }
  return Object.freeze(records);
}

function parseState(raw: string): RegistryState {
  try {
    const parsed = JSON.parse(raw) as { active?: Record<string, unknown>; accounts?: Record<string, unknown> };
    const accounts = {
      codex: sanitizeRecords(parsed?.accounts?.codex),
      claude: sanitizeRecords(parsed?.accounts?.claude),
    };
    const active: Partial<Record<AccountScopedProvider, string>> = {};
    for (const provider of ['codex', 'claude'] as const) {
      const id = parsed?.active?.[provider];
      // A pointer to an account that is not in the list is ignored rather than trusted.
      if (isValidAgentAccountId(id) && accounts[provider].some((record) => record.id === id)) active[provider] = id;
    }
    return Object.freeze({ version: 1 as const, active: Object.freeze(active), accounts: Object.freeze(accounts) });
  } catch {
    return EMPTY_STATE;
  }
}

function loadState(): RegistryState {
  if (cachedState) return cachedState;
  let raw = '';
  try { raw = readFileSync(registryFile(), 'utf8'); } catch { /* No registry yet: fresh install. */ }
  cachedState = raw ? parseState(raw) : EMPTY_STATE;
  return cachedState;
}

function saveState(next: RegistryState): void {
  const file = registryFile();
  mkdirSync(getAgentProfilesRoot(), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  cachedState = next;
}

/** Test hook and cold-restart simulation: the next read goes back to disk. */
export function resetAgentAccountRegistryCache(): void {
  cachedState = undefined;
}

export function listAgentAccountRecords(provider: AccountScopedProvider): readonly AgentAccountRecord[] {
  return loadState().accounts[provider];
}

export function hasAgentAccount(provider: AccountScopedProvider, accountId: string): boolean {
  if (accountId === DEFAULT_ACCOUNT_ID) return true;
  return isValidAgentAccountId(accountId) && loadState().accounts[provider].some((record) => record.id === accountId);
}

export function getActiveAgentAccountId(provider: AccountScopedProvider): string {
  return loadState().active[provider] ?? DEFAULT_ACCOUNT_ID;
}

/** Folder that holds one saved account. The id is validated, so it can never escape the root. */
export function getAgentAccountDir(provider: AccountScopedProvider, accountId: string): string {
  if (!isValidAgentAccountId(accountId)) throw new Error('저장된 계정 정보가 올바르지 않습니다.');
  return join(getAgentProfilesRoot(), provider, accountId);
}

export function createAgentAccountRecord(provider: AccountScopedProvider, now: number = Date.now()): AgentAccountRecord {
  const state = loadState();
  let id = '';
  do { id = `acct-${randomBytes(6).toString('hex')}`; } while (state.accounts[provider].some((record) => record.id === id));
  mkdirSync(getAgentAccountDir(provider, id), { recursive: true });
  const record: AgentAccountRecord = Object.freeze({ id, createdAt: now });
  saveState(Object.freeze({
    ...state,
    accounts: Object.freeze({ ...state.accounts, [provider]: Object.freeze([...state.accounts[provider], record]) }),
  }));
  return record;
}

export function setActiveAgentAccount(provider: AccountScopedProvider, accountId: string): void {
  if (!hasAgentAccount(provider, accountId)) throw new Error('저장되지 않은 계정은 선택할 수 없습니다.');
  const state = loadState();
  const active = { ...state.active };
  if (accountId === DEFAULT_ACCOUNT_ID) delete active[provider];
  else {
    active[provider] = accountId;
    // The folder may have been cleaned by hand; recreate it so the CLI sees "not logged in", not a crash.
    mkdirSync(getAgentAccountDir(provider, accountId), { recursive: true });
  }
  saveState(Object.freeze({ ...state, active: Object.freeze(active) }));
}

function removeAccountFolder(provider: AccountScopedProvider, accountId: string): void {
  const dir = resolve(getAgentAccountDir(provider, accountId));
  const root = resolve(getAgentProfilesRoot());
  if (!dir.startsWith(root + sep)) throw new Error('계정 폴더 위치가 올바르지 않습니다.');
  if (!existsSync(dir)) return;
  // A link here would make a recursive delete reach somewhere else. Leave it for a human to inspect.
  if (lstatSync(dir).isSymbolicLink()) throw new Error('계정 폴더가 다른 위치로 연결돼 있어 지우지 않았습니다.');
  rmSync(dir, { recursive: true, force: true });
}

/** Forget a saved account and delete its folder. The default account can never be removed. */
export function removeAgentAccountRecord(
  provider: AccountScopedProvider,
  accountId: string,
): { removedActive: boolean } {
  if (accountId === DEFAULT_ACCOUNT_ID || !hasAgentAccount(provider, accountId)) {
    throw new Error('기본 계정이거나 저장되지 않은 계정은 뺄 수 없습니다.');
  }
  removeAccountFolder(provider, accountId);
  const state = loadState();
  const removedActive = state.active[provider] === accountId;
  const active = { ...state.active };
  if (removedActive) delete active[provider];
  saveState(Object.freeze({
    ...state,
    active: Object.freeze(active),
    accounts: Object.freeze({
      ...state.accounts,
      [provider]: Object.freeze(state.accounts[provider].filter((record) => record.id !== accountId)),
    }),
  }));
  return { removedActive };
}
