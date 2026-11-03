import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendHarmonyLedger, conflictKeyOf, HARMONY_LEDGER_FILE, HARMONY_LEDGER_MAX_BYTES,
} from '../content/agentHarmony/harmonyLedger';
import type { VerifiedComplementItem } from '../content/agentHarmony/harmonyPacketTypes';

const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(path.join(tmpdir(), 'bln-harmony-ledger-')); dirs.push(dir); return dir; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const ITEM: VerifiedComplementItem = {
  kind: 'conflict', instructionQuote: '제목의 약속은 도입부에서 첫 답을 준다', otherQuote: '소제목은 3~7개로 한다',
  resolution: '자료가 받쳐 주는 5개로 맞춤', rule: 'payoff', affected: ['headings'], quoteVerified: true,
};
const meta = (userDataDir: string, extra: Record<string, unknown> = {}) => ({
  userDataDir, runId: 'run-1', appVersion: '2.11.376', engine: 'agent-claude', model: 'claude(구독)', mode: 'homefeed',
  now: () => new Date('2026-11-04T01:02:03.000Z'), ...extra,
});
const lines = (dir: string, name = HARMONY_LEDGER_FILE) => readFileSync(path.join(dir, 'agent-harmony', name), 'utf8').trim().split('\n').map(line => JSON.parse(line));

describe('appendHarmonyLedger', () => {
  it('appends one JSONL line per report item under <userData>/agent-harmony/complement-ledger.jsonl', () => {
    const dir = tmp();
    const second = { ...ITEM, kind: 'gap' as const, otherQuote: '', quoteVerified: false };
    expect(appendHarmonyLedger(meta(dir), [ITEM, second])).toEqual({ written: 2 });
    const rows = lines(dir);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      at: '2026-11-04T01:02:03.000Z', runId: 'run-1', appVersion: '2.11.376', engine: 'agent-claude', model: 'claude(구독)', mode: 'homefeed',
      kind: 'conflict', conflictKey: conflictKeyOf(ITEM.instructionQuote, ITEM.otherQuote), quotes: [ITEM.instructionQuote, ITEM.otherQuote],
      resolution: ITEM.resolution, rule: 'payoff', affected: ['headings'], quoteVerified: true,
    });
    expect(rows[1].quoteVerified).toBe(false);
    appendHarmonyLedger(meta(dir), [ITEM]);
    expect(lines(dir)).toHaveLength(3);
  });

  it('writes nothing for an empty report', () => {
    const dir = tmp();
    expect(appendHarmonyLedger(meta(dir), [])).toEqual({ written: 0 });
    expect(existsSync(path.join(dir, 'agent-harmony', HARMONY_LEDGER_FILE))).toBe(false);
  });

  it('derives a stable 16-hex conflictKey that ignores whitespace, case and quote order', () => {
    const key = conflictKeyOf('제목의 약속은 도입부에서 첫 답을 준다', '소제목은 3~7개로 한다');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(conflictKeyOf('제목의   약속은 도입부에서\n첫 답을 준다', '소제목은 3~7개로 한다')).toBe(key);
    expect(conflictKeyOf('소제목은 3~7개로 한다', '제목의 약속은 도입부에서 첫 답을 준다')).toBe(key);
    expect(conflictKeyOf('다른 문장입니다 정말로 다릅니다', '소제목은 3~7개로 한다')).not.toBe(key);
  });

  it('rotates to .1 once the file reaches the size cap, then keeps appending to a fresh file', () => {
    expect(HARMONY_LEDGER_MAX_BYTES).toBe(5 * 1024 * 1024);
    const dir = tmp();
    appendHarmonyLedger(meta(dir, { maxBytes: 600 }), [ITEM, ITEM, ITEM]);
    appendHarmonyLedger(meta(dir, { maxBytes: 600 }), [ITEM]);
    expect(existsSync(path.join(dir, 'agent-harmony', `${HARMONY_LEDGER_FILE}.1`))).toBe(true);
    expect(lines(dir)).toHaveLength(1);
    expect(lines(dir, `${HARMONY_LEDGER_FILE}.1`).length).toBeGreaterThanOrEqual(3);
  });

  it('masks API keys in the text it stores', () => {
    const dir = tmp();
    appendHarmonyLedger(meta(dir), [{ ...ITEM, resolution: '키 sk-ant-abcdefghijklmnop1234567890 가 섞임' }]);
    const text = readFileSync(path.join(dir, 'agent-harmony', HARMONY_LEDGER_FILE), 'utf8');
    expect(text).not.toContain('abcdefghijklmnop1234567890');
    expect(text).toContain('sk-ant-***');
  });

  it('never throws: unwritable location, bad input, missing userData', () => {
    const dir = tmp();
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'a file where a directory is needed');
    expect(() => appendHarmonyLedger(meta(path.join(blocker, 'nested')), [ITEM])).not.toThrow();
    expect(appendHarmonyLedger(meta(path.join(blocker, 'nested')), [ITEM])).toEqual({ written: 0 });
    expect(() => appendHarmonyLedger(undefined as never, undefined as never)).not.toThrow();
    expect(() => appendHarmonyLedger(meta(dir), [null as never, { kind: 1 } as never])).not.toThrow();
    expect(() => appendHarmonyLedger({ ...meta(dir), userDataDir: '' }, [ITEM])).not.toThrow();
  });
});

describe('the ledger is never fed back into prompts', () => {
  it('only the harmony runtime imports the ledger module', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(full); continue; }
        if (/\.tsx?$/.test(name) && /from\s+['"][^'"]*harmonyLedger(\.js)?['"]|import\(['"][^'"]*harmonyLedger/.test(readFileSync(full, 'utf8'))) importers.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(root);
    expect(importers.sort()).toEqual(['content/agentHarmony/harmonyRuntime.ts']);
  });
});
