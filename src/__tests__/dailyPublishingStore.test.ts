import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDailyPublishingStore, createDailySourceClaims, isDailySourceUsed } from '../main/services/dailyPublishingStore.js';
const temporary: string[] = [];
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function location() { const dir = await mkdtemp(path.join(tmpdir(), 'daily-state-')); temporary.push(dir); return path.join(dir, 'daily.json'); }
describe('daily publishing persistent state', () => {
  it('reads used material before model selection without claiming or rewriting the journal', async () => {
    const file = await location(), fp = 'a'.repeat(64), other = 'b'.repeat(64);
    expect(await isDailySourceUsed(file, 'issue', [fp])).toBe(false);
    await createDailySourceClaims(file)('issue', fp, 'first-job');
    const before = await readFile(file, 'utf8');
    expect(await isDailySourceUsed(file, 'issue', [other, fp])).toBe(true);
    expect(await isDailySourceUsed(file, 'sports', [fp])).toBe(false);
    expect(await readFile(file, 'utf8')).toBe(before);
    await expect(isDailySourceUsed(file, '../bad', [fp])).rejects.toThrow();
    await writeFile(file, '{bad'); await expect(isDailySourceUsed(file, 'issue', [fp])).rejects.toThrow();
  });
  it('atomically persists state and reports corrupt records without resetting them', async () => {
    const file = await location(); const store = createDailyPublishingStore(file);
    expect(await store.load()).toBeNull();
    const state = { version: 1, revision: 0, plans: [], runs: [] };
    await store.save(state as never); expect(await store.load()).toEqual(state);
    await writeFile(file, '{broken'); await expect(store.load()).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('{broken');
  });
  it('claims a source once across restart and serializes competing reservations', async () => {
    const file = await location(); const claim = createDailySourceClaims(file);
    const fingerprint = 'a'.repeat(64);
    expect(await Promise.all([claim('sports', fingerprint, 'job-1'), claim('sports', fingerprint, 'job-2')])).toEqual([true, false]);
    expect(await createDailySourceClaims(file)('sports', fingerprint, 'job-3')).toBe(false);
    expect(await claim('auto', fingerprint, 'job-4')).toBe(true);
    expect(await claim('sports', fingerprint, 'job-1')).toBe(false);
  });
  it('never proceeds after a corrupt claim journal or unsafe identifier', async () => {
    const file = await location(); await writeFile(file, '{}');
    await expect(createDailySourceClaims(file)('sports', 'a'.repeat(64), 'job')).rejects.toThrow();
    await expect(createDailySourceClaims(await location())('../secret', 'a'.repeat(64), 'job')).rejects.toThrow();
  });
});
