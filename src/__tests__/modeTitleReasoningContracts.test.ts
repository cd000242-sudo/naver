import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-08-20 3차] 사장님 지시: "업체홍보모드·사진으로 글생성·페러프레이징·네이버 메이트·
 * SEO — 각 모드에 맞게 추론해야 돼. 발행해보니 예전 그대로 절대 나오면 안 돼."
 *
 * 본선(contentJsonPromptFormat)의 모드 계약은 homefeedTitleClickReason.test.ts 가 잠근다.
 * 이 파일은 본선 밖에 살던 두 경로를 잠근다 — 여기가 "예전 그대로"의 실제 발원지였다:
 *
 *   ① 페러프레이징: 렌더러 하드코딩 프롬프트가 "총정리·완벽 가이드·충격·소름" 옛 제목
 *      공식을 **필수로** 강제했고, custom 모드에선 사용자 프롬프트가 최우선이라
 *      가드레일을 뒤엎었다.
 *   ② 사진으로 글생성: imageNarrative base.prompt 의 제목 규칙이 "블로그 제목 (25~40자)"
 *      한 줄뿐 — 추론 단계가 아예 없었다.
 */

const ROOT = resolve(__dirname, '..');

describe('paraphrase prompt title contract', () => {
  const source = readFileSync(resolve(ROOT, 'renderer', 'modules', 'contentGeneration.ts'), 'utf-8');

  it('no longer mandates the legacy trigger formula (총정리/충격/소름)', () => {
    expect(source).not.toContain('[제목 트리거 필수 포함]');
    expect(source).not.toContain('"~보고 소름"');
    expect(source).not.toContain('"총정리", "완벽 가이드"');
  });

  it('forces reasoning before the title and bans original-title reshuffles', () => {
    expect(source).toContain('제목 100점 재작성 — 추론이 먼저다');
    expect(source).toContain('clickReason');
    expect(source).toContain('원본 제목을 복사하거나 단어만');
  });

  it('bans summary-noun endings and baseless emotion words in the rewrite rules', () => {
    expect(source).toContain('요약 명사 종결 금지');
    expect(source).toContain('클릭베이트 금지');
  });

  it('final checklist verifies the click reason instead of demanding triggers', () => {
    expect(source).not.toContain('□ 제목에 감정/숫자 트리거 포함');
    expect(source).toContain('□ 제목이 clickReason 에서 출발했고');
  });
});

describe('photo-mode (imageNarrative) title contract', () => {
  const prompt = readFileSync(resolve(ROOT, 'prompts', 'imageNarrative', 'base.prompt'), 'utf-8');

  it('carries the reasoning-first title contract', () => {
    expect(prompt).toContain('[제목 계약 — 추론이 먼저다]');
    expect(prompt).toContain('titleReason');
  });

  it('orders titleReason before title in the JSON schema (field order = reasoning order)', () => {
    const reasonAt = prompt.indexOf('"titleReason"');
    const titleAt = prompt.indexOf('"title"');
    expect(reasonAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(-1);
    expect(reasonAt).toBeLessThan(titleAt);
  });

  it('bans label titles, summary endings, and fabricated facts in titles', () => {
    expect(prompt).toContain('라벨형 제목');
    expect(prompt).toContain('요약 명사 종결 금지');
    expect(prompt).toContain('사진·입력 정보에 없는 사실');
  });
});
