/**
 * continuousPublishCompletionGuard.test.ts
 *
 * [2026-07-02] Regression guard: the continuous-publishing Enhanced loop marks an item
 * 'completed' right after `await executeUnifiedAutomation(...)`. But executeUnifiedAutomation
 * wraps the whole flow in withErrorHandling, which SWALLOWS every error and returns normally
 * (never throws). So "did not throw" is NOT a success signal — a failed publish
 * (EDITOR_NOT_READY / POST_CONTENT_APPLIED) was being reported as 완료 while the post never
 * went up. This test freezes the fix: the loop must verify the real success marker
 * (_lastPublishOutcome === 'success') before marking completed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const continuous = fs.readFileSync(
  path.resolve(__dirname, '../renderer/modules/continuousPublishing.ts'),
  'utf-8',
);
const rendererUtils = fs.readFileSync(
  path.resolve(__dirname, '../renderer/modules/rendererUtils.ts'),
  'utf-8',
);

describe('연속발행 완료 오보 방지 가드', () => {
  it('withErrorHandling은 에러를 삼키고 fallback을 반환한다 (never throws) — 가드 전제', () => {
    // 이 전제가 깨지면(= re-throw로 바뀌면) 아래 가드의 필요성 자체가 달라지므로 함께 박제한다.
    expect(rendererUtils).toMatch(/return\s+fallbackValue;/);
    expect(rendererUtils).toMatch(/Promise<T \| undefined>/);
  });

  it('발행 직후 _lastPublishOutcome === "success"를 확인한 뒤에만 completed로 마킹한다', () => {
    const publishIdx = continuous.indexOf("await withStopCheck(executeUnifiedAutomation(formData), { kind: 'publish' });");
    const guardIdx = continuous.indexOf("_lastPublishOutcome !== 'success'");
    const completedIdx = continuous.indexOf("item.status = 'completed';");

    expect(publishIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(completedIdx).toBeGreaterThan(-1);

    // 순서: 발행 호출 → 성공마커 가드 → completed 마킹
    expect(publishIdx).toBeLessThan(guardIdx);
    expect(guardIdx).toBeLessThan(completedIdx);
  });

  it('미확인 시 throw하여 기존 catch(재시도→failed) 경로로 라우팅한다', () => {
    const guardIdx = continuous.indexOf("_lastPublishOutcome !== 'success'");
    const window = continuous.slice(guardIdx, guardIdx + 200);
    expect(window).toMatch(/throw new Error\(/);
  });
});
