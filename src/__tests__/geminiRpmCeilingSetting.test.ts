import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { describeGeminiQuotaCause } from '../image/geminiQuotaClassifier';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님] "금액이 있는데 왜 429가 뜨냐고."
 *
 * 429는 잔액이 아니라 속도 제한이다. 그런데 앱은 상한을 10 으로 하드코딩해 두고
 * (Tier 1 기준) 429를 한 번 만나면 6까지 줄였다 — 누적 결제 $100을 넘겨 Tier 2
 * (1,000 RPM)가 된 사용자일수록 손해를 봤다. 올릴 창구는 환경변수뿐이었다.
 *
 * 그리고 원인 분류는 v2.11.232부터 하고 있었지만 재시도 판단에만 쓰이고
 * 사용자에게는 보이지 않아, 답이 로그 파일 안에만 있었다.
 */

describe('429 원인을 화면 문구로 바꾼다', () => {
  it('일일 소진은 오늘 안 풀린다고 말한다', () => {
    const msg = describeGeminiQuotaCause({ scope: 'per-day' }, 1);
    expect(msg).toContain('일일 한도');
    expect(msg).toContain('내일');
  });

  it('분당 초과는 잔액 문제가 아님을 분명히 하고 대기 시간을 알려준다', () => {
    const msg = describeGeminiQuotaCause({ scope: 'per-minute', retryDelayMs: 21_000 }, 1);
    expect(msg).toContain('잔액 문제가 아닙니다');
    expect(msg).toContain('21초');
    expect(msg).toContain('Tier 1');
  });

  it('판별 불가여도 "잔액이 아니다"를 먼저 말한다', () => {
    const msg = describeGeminiQuotaCause({ scope: 'unknown' }, 1);
    expect(msg).toContain('잔액이 아니라');
  });

  it('키가 하나뿐일 때만 키 추가를 권한다', () => {
    expect(describeGeminiQuotaCause({ scope: 'per-day' }, 1)).toContain('API 키를 2개 이상');
    expect(describeGeminiQuotaCause({ scope: 'per-day' }, 3)).not.toContain('API 키를 2개 이상');
  });

  it('생성기가 이 문구를 실제로 사용자에게 보낸다', () => {
    const generator = read('image/nanoBananaProGenerator.ts');
    expect(generator).toMatch(/sendImageLog\(`⚠️ \$\{describeGeminiQuotaCause\(quotaClass, availableKeyCount\)\}/);
    // 분류가 메시지보다 앞에서 계산돼야 한다 — 뒤에 있으면 문구에 쓸 수 없다.
    const classifyAt = generator.indexOf('const quotaClass = classifyGeminiQuotaError(');
    const messageAt = generator.indexOf('describeGeminiQuotaCause(quotaClass, availableKeyCount)');
    expect(classifyAt).toBeGreaterThan(-1);
    expect(classifyAt).toBeLessThan(messageAt);
  });
});

describe('Gemini 이미지 분당 상한 설정', () => {
  const generator = read('image/nanoBananaProGenerator.ts');
  const config = read('configManager.ts');
  const settings = read('renderer/modules/priceInfoModal.ts');
  const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

  it('설정 필드가 AppConfig 에 있다', () => {
    expect(config).toMatch(/geminiRpmCeiling\?: number;/);
  });

  it('설정값이 환경변수로 올라간다 (기존 경로 재사용)', () => {
    expect(config).toMatch(/process\.env\.GEMINI_RPM_CEILING = String\(Math\.floor\(rpmCeiling\)\)/);
  });

  it('1~1000 밖의 값은 무시한다', () => {
    expect(config).toMatch(/rpmCeiling >= 1 && rpmCeiling <= 1000/);
    expect(settings).toMatch(/v >= 1 && v <= 1000/);
  });

  it('쓰로틀러가 지연 생성이라 재시작 없이 반영된다 (회귀 잠금)', () => {
    // 모듈 로드 시점 고정 생성으로 되돌아가면 설정을 바꿔도 앱을 껐다 켜야 한다.
    expect(generator).not.toMatch(/^const geminiRpmThrottler = new GeminiRpmThrottler\(/m);
    expect(generator).toMatch(/function getGeminiRpmThrottler\(\): GeminiRpmThrottler/);
    expect(generator).toMatch(/geminiRpmThrottlerCeiling !== ceiling/);
  });

  it('상한이 그대로면 같은 인스턴스를 유지한다 (분당 기록 유실 방지)', () => {
    expect(generator).toMatch(/if \(!geminiRpmThrottlerInstance \|\| geminiRpmThrottlerCeiling !== ceiling\)/);
  });

  it('화면에 입력칸과 안내가 있다', () => {
    expect(html).toMatch(/id="gemini-rpm-ceiling"/);
    expect(html).toMatch(/Tier 1은 분당 10장/);
    expect(html).toMatch(/429는 잔액이 아니라/);
  });

  it('빈칸이면 설정을 지워 기본값(10)으로 돌아간다', () => {
    expect(settings).toMatch(/delete \(config as any\)\.geminiRpmCeiling;/);
  });
});
