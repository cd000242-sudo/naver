import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * SPEC-STABILITY-2026 R3 (S3): "소제목 이미지 빈 결과 — 원인 불명 중단".
 *
 * Terminal failure paths in nanoBananaProGenerator returned null per item and
 * the batch returned a bare empty array — the renderer could only say
 * "이미지가 비어있습니다". These guards lock the structured-cause contract:
 * every terminal failure records {code, detail}, and a total failure throws
 * NANO_<code> upward so the user log shows WHY (쿼터/429/인증/빈 응답).
 */
describe('nanoBananaPro empty-result cause (R3)', () => {
  const code = read('image/nanoBananaProGenerator.ts');

  it('exposes the last structured failure for diagnostics', () => {
    expect(code).toMatch(/export function getLastNanoBananaFailure/);
  });

  it('records a cause at every terminal failure path (quota-zero, billing, max-retries)', () => {
    const records = code.match(/recordNanoFailure\(/g) || [];
    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/recordNanoFailure\('QUOTA_ZERO'/);
    expect(code).toMatch(/recordNanoFailure\('BILLING_REQUIRED'/);
  });

  it('classifies empty Gemini responses separately from quota/auth/server', () => {
    expect(code).toMatch(/EMPTY_RESPONSE/);
  });

  it('throws a structured NANO_<code> error when the whole batch produced nothing', () => {
    expect(code).toMatch(/NANO_\$\{batchFailure\.code\}/);
  });
});
