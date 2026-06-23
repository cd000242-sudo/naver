import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard: 업데이트 다운로드 완료 다이얼로그는 "나중에"로 미룰 수 있어야 한다 (2026-06-23).
 *
 * User report (with screenshot): during image generation/publishing, the "업데이트 준비 완료"
 * dialog popped with a single "지금 재시작하여 업데이트" button (no defer) — the auto-update
 * download finished mid-work and the only option force-restarted, destroying in-progress work.
 *
 * Fix: the update-downloaded dialog offers "지금 재시작하여 업데이트" / "나중에". "나중에" keeps
 * working and the update applies on the next launch. The 5s auto-restart and the restart-on-dialog-
 * error are removed so work is never force-interrupted.
 */
describe('update-downloaded dialog is deferrable', () => {
  const updater = read('updater.ts');

  it('offers a "나중에" (defer) button alongside restart', () => {
    expect(updater).toMatch(/buttons:\s*\['지금 재시작하여 업데이트',\s*'나중에'\]/);
  });

  it('does not auto-restart after 5 seconds', () => {
    expect(updater).not.toContain('5초 경과, 자동 재시작');
  });

  it('defers (does not force restart) when the user picks 나중에 or the dialog errors', () => {
    // 나중에 분기에서 작업 계속 (isUpdateInProgress 해제)
    expect(updater).toMatch(/result\.response !== 0[\s\S]*isUpdateInProgress = false/);
  });
});
