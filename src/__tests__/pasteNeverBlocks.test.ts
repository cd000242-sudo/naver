import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assessPartialSalvage } from '../automation/richTextPaste';

/**
 * [v2.11.140b] 발행 무중단 계약 (사용자 지시: "어떤 상황이든 발행 완주").
 *
 * 붙여넣는 본문은 우리가 직접 만든 리치 HTML이므로 검증의 역할은 "차단"이 아니라
 * "복구 트리거"다. richPaste는 어떤 실패 경로에서도 safeToFallback:false(치명)를
 * 반환하지 않는다 — 과반 안착이면 인정(salvage), 아니면 키보드 입력 fallback이
 * 섹션을 완성한다. EDITOR_PARTIAL_INSERT_UNRECOVERED는 도달 불가가 된다.
 */
describe('paste never blocks publishing (v2.11.140b)', () => {
  const source = readFileSync(
    resolve(__dirname, '../automation/richTextPaste.ts'),
    'utf8',
  );

  it('richTextPaste에 치명 반환(safeToFallback: false) 리터럴이 없다', () => {
    expect(source).not.toContain('safeToFallback: false');
  });

  it('롤백은 Ctrl+Z를 최대 3회 시도한다 (1회 실패가 발행을 죽이지 않게)', () => {
    expect(source).toMatch(/for \(let press = 0; press < 3; press \+= 1\)/);
  });

  it('[v2.11.140c] 서식 보존 우선: native 리치 붙여넣기를 폴백 체인 전에 재시도한다', () => {
    // 사용자 지시: 타이핑 폴백은 글 구조가 깨지므로 리치 붙여넣기 자체가 성공해야 한다.
    // 클립보드에 리치 HTML이 남아 있으므로 롤백 검증 후 같은 Ctrl+V를 한 번 더 시도.
    expect(source).toMatch(/for \(let pasteAttempt = 0; pasteAttempt < 2; pasteAttempt \+= 1\)/);
    // 재시도 루프는 이벤트 디스패치 폴백보다 앞에 있어야 한다 (서식 보존 경로 우선).
    const retryAt = source.indexOf('pasteAttempt < 2');
    const eventFallbackAt = source.indexOf('await dispatchRichPasteEventAtCursor(frame, trimmedHtml, trimmedPlain)');
    expect(retryAt).toBeGreaterThan(-1);
    expect(eventFallbackAt).toBeGreaterThan(-1);
    expect(retryAt).toBeLessThan(eventFallbackAt);
  });

  it('과반 안착 + 시작 앵커 정위치면 salvage 인정 (중복 없이 진행)', () => {
    const expected = '가'.repeat(200);
    const before = { chars: 300, text: 'ㄴ'.repeat(300) };
    // 60% 안착: before 뒤에 expected의 앞 120자
    const after = { chars: 420, text: 'ㄴ'.repeat(300) + expected.slice(0, 120) };
    const salvage = assessPartialSalvage(before, after, expected);
    expect(salvage.acceptable).toBe(true);
    expect(salvage.coverage).toBeGreaterThanOrEqual(0.55);
  });

  it('소량 파편(cov<0.55)은 salvage 거부 → 키보드 fallback 경로가 완성 담당', () => {
    const expected = '가'.repeat(200);
    const before = { chars: 300, text: 'ㄴ'.repeat(300) };
    const after = { chars: 340, text: 'ㄴ'.repeat(300) + expected.slice(0, 40) }; // 20%
    expect(assessPartialSalvage(before, after, expected).acceptable).toBe(false);
  });

  it('시작 앵커가 append 지점에 없으면(오배치) salvage 거부', () => {
    const expected = '가'.repeat(100) + '나'.repeat(100);
    const before = { chars: 300, text: 'ㄴ'.repeat(300) };
    // 내용 분량은 늘었지만 expected의 시작이 어디에도 없음
    const after = { chars: 460, text: 'ㄴ'.repeat(300) + '다'.repeat(160) };
    expect(assessPartialSalvage(before, after, expected).acceptable).toBe(false);
  });
});
