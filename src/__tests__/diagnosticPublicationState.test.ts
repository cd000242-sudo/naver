import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostic-policy-'));
vi.mock('electron', () => ({ app: { getPath: () => temp, getVersion: () => 'test' }, ipcMain: { handle: vi.fn() } }));
vi.mock('../browserUtils.js', () => ({ getChromiumExecutablePath: async () => null }));
import { app } from 'electron';
import { generateDiagnosticReport } from '../main/ipc/diagnosticsHandlers';
const stateFile = path.join(temp, 'content-policy-publication-state.json');
const write = (value: unknown) => fs.writeFileSync(stateFile, JSON.stringify(value));
beforeEach(() => { vi.spyOn(app, 'getPath').mockReturnValue(temp); fs.rmSync(stateFile, { force: true }); });
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('publication diagnostics are bounded, private and read-only', () => {
  it('shows the raw pause and advisory fields without applying store migration', async () => {
    write({ status: 'PAUSED', pause_reason: 'EXPOSURE_MONITOR_FAILURE', paused_at: '2026-10-24T01:02:03.000Z', last_advisory_reason: 'STATE_REBUILT_FROM_CORRUPT', last_advisory_at: '2026-10-23T01:02:03.000Z', history: [{ article_id: 'SECRET-ARTICLE', account: 'SECRET-ACCOUNT', body: 'SECRET-BODY' }] });
    const original = fs.readFileSync(stateFile, 'utf8');
    const { report, ok } = await generateDiagnosticReport();
    expect(ok).toBe(true);
    for (const field of ['status: PAUSED', 'pause_origin: (없음)', 'pause_reason: EXPOSURE_MONITOR_FAILURE', 'paused_at: 2026-10-24T01:02:03.000Z', 'last_advisory_reason: STATE_REBUILT_FROM_CORRUPT', 'last_advisory_at: 2026-10-23T01:02:03.000Z', 'historyCount: 1']) expect(report).toContain(field);
    expect(report).not.toContain('SECRET-');
    expect(fs.readFileSync(stateFile, 'utf8')).toBe(original);
  });
  it('preserves the exact known noncritical pause cause and recovery advisory', async () => {
    const cause = 'POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE';
    const recovered = `RECOVERED_NONCRITICAL_RECORD_PAUSE:${cause}`;
    write({ status: 'PAUSED', pause_origin: 'integrity', pause_reason: cause, history: [] });
    expect((await generateDiagnosticReport()).report).toContain(`pause_reason: ${cause}`);
    write({ status: 'ACTIVE', last_advisory_reason: recovered, history: [] });
    const { report } = await generateDiagnosticReport();
    expect(report).toContain('status: ACTIVE');
    expect(report).toContain(`last_advisory_reason: ${recovered}`);
  });
  it('does not disclose arbitrary suffixes appended to known composite codes', async () => {
    write({ status: 'PAUSED', pause_reason: 'POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE:PRIVATE_ACCOUNT', last_advisory_reason: 'RECOVERED_NONCRITICAL_RECORD_PAUSE:POLICY_POST_PUBLISH_RECORD_FAILED:RECENT_POST_RECORD_INCOMPLETE:PRIVATE_SECRET' });
    const { report } = await generateDiagnosticReport();
    expect(report).toContain('pause_reason: POLICY_POST_PUBLISH_RECORD_FAILED\n');
    expect(report).not.toContain('PRIVATE_');
  });
  it('keeps an integrity reason code but omits its arbitrary exception details', async () => {
    write({ status: 'PAUSED', pause_origin: 'integrity', pause_reason: 'POLICY_POST_PUBLISH_RECORD_FAILED: account=PRIVATE_ACCOUNT password=PRIVATE_PASS C:/Users/PRIVATE_USER/file', history: [] });
    const { report } = await generateDiagnosticReport();
    expect(report).toContain('pause_origin: integrity');
    expect(report).toContain('pause_reason: POLICY_POST_PUBLISH_RECORD_FAILED');
    expect(report).not.toContain('PRIVATE_');
  });
  it('omits free-form operator reasons and malformed scalar values', async () => {
    write({ status: 'PAUSED', pause_origin: 'operator', pause_reason: 'PRIVATE_ACCOUNT sk-PRIVATE_TOKEN', paused_at: 'PRIVATE_TIME', last_advisory_reason: { password: 'PRIVATE_PASS' }, last_advisory_at: 'PRIVATE_DATE', history: 'PRIVATE_HISTORY' });
    const { report } = await generateDiagnosticReport();
    expect(report).toContain('pause_origin: operator');
    expect(report).toContain('pause_reason: (비공개 사유)');
    expect(report).not.toContain('PRIVATE_');
    expect(report).toContain('historyCount: (잘못된 형식)');
  });
  it('reports missing state without creating it', async () => {
    const { report, ok } = await generateDiagnosticReport();
    expect(ok).toBe(true); expect(report).toContain('발행 정책 상태: 파일 없음');
    expect(fs.existsSync(stateFile)).toBe(false);
  });
  it.each(['{broken PRIVATE_SECRET', 'null', '[]', '42'])('continues without repairing malformed data: %s', async (raw) => {
    fs.writeFileSync(stateFile, raw);
    const { report, ok } = await generateDiagnosticReport();
    expect(ok).toBe(true); expect(report).toContain('발행 정책 상태: 읽기 실패 또는 잘못된 형식');
    expect(report).not.toContain('PRIVATE_SECRET'); expect(fs.readFileSync(stateFile, 'utf8')).toBe(raw);
    expect(fs.readdirSync(temp).some(name => name.includes('.corrupt-'))).toBe(false);
  });
  it('reports an active state and bounded known advisory codes', async () => {
    write({ status: 'ACTIVE', pause_origin: 'PRIVATE_ORIGIN', last_advisory_reason: 'POLICY_EXPOSURE_TARGET_INVALID,POLICY_EXPOSURE_QUEUE_WRITE_FAILED', history: [] });
    const { report, savedPath } = await generateDiagnosticReport();
    expect(savedPath.startsWith(temp)).toBe(true);
    expect(report).toContain('status: ACTIVE');
    expect(report).toContain('pause_reason: (없음)');
    expect(report).toContain('historyCount: 0');
    expect(report).toContain('last_advisory_reason: POLICY_EXPOSURE_TARGET_INVALID,POLICY_EXPOSURE_QUEUE_WRITE_FAILED');
    expect(report).not.toContain('PRIVATE_ORIGIN');
  });
  it('continues on an inaccessible state without disclosing the filesystem error', async () => {
    fs.mkdirSync(stateFile);
    try {
      const { report, ok } = await generateDiagnosticReport();
      expect(ok).toBe(true);
      expect(report).toContain('발행 정책 상태: 읽기 실패 또는 잘못된 형식');
      expect(report).not.toContain('PRIVATE_');
    } finally { fs.rmdirSync(stateFile); }
  });
  it('skips oversized state and still writes the report', async () => {
    fs.writeFileSync(stateFile, 'x'.repeat(1024 * 1024 + 1));
    const { report, ok } = await generateDiagnosticReport();
    expect(ok).toBe(true); expect(report).toContain('발행 정책 상태: 크기 제한 초과');
    expect(fs.statSync(stateFile).size).toBe(1024 * 1024 + 1);
  });
});
