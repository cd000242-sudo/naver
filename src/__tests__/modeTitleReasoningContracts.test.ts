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

/*
 * [2026-09-10 사장님] "여행글도 홈판 노출이 가능하니? SEO 노출에 부합하는 제목인지
 * 확인해볼래? 자동생성인데 제목이 밋밋한 것 같아."
 *
 * 위 base.prompt 계약은 멀쩡한데 실제 발행 제목은 "거제 근포땅굴 여행, 초록 역광" 같은
 * 라벨형만 나왔다. 원인은 로드 순서다 — loadSystemPrompt 는 `base + "\n\n" + <mode>.prompt`
 * 로 이어 붙이는데, 5개 모드 프롬프트가 저마다 **JSON 스키마를 통째로 다시 선언**하면서
 * titleReason 을 빠뜨렸다. 모델이 마지막에 읽는 스키마에 추론 필드가 없으니 제목 계약이
 * 조용히 사라진다. paragraphs(사진-문단 짝맞춤)도 같은 이유로 빠져 있었다.
 *
 * 계약: 모드 프롬프트는 base 를 **덧붙이기만** 한다. 스키마는 base 하나가 정본이다.
 */
describe('imageNarrative 모드 프롬프트는 base 스키마를 덮지 않는다', () => {
  const MODES = ['travel', 'food', 'lodging', 'daily', 'review'] as const;
  const read = (name: string) =>
    readFileSync(resolve(ROOT, 'prompts', 'imageNarrative', `${name}.prompt`), 'utf-8');

  for (const mode of MODES) {
    describe(`${mode}.prompt`, () => {
      it('title/sections/introduction/conclusion 스키마를 다시 선언하지 않는다', () => {
        const prompt = read(mode);
        for (const field of ['"title"', '"sections"', '"introduction"', '"conclusion"']) {
          expect(prompt, `${mode}.prompt 가 ${field} 를 재선언한다`).not.toContain(field);
        }
      });

      it('base 스키마를 따른다고 명시한다', () => {
        expect(read(mode)).toMatch(/base\.prompt/);
      });
    });
  }
});

describe('제목 계약 — 검색되는 말과 장면을 함께 문다', () => {
  const prompt = readFileSync(resolve(ROOT, 'prompts', 'imageNarrative', 'base.prompt'), 'utf-8');

  it('검색 수요가 있는 말을 제목에 넣도록 요구한다', () => {
    expect(prompt).toContain('TT6');
    expect(prompt).toMatch(/검색되는 말/);
  });

  /*
   * travel.prompt 는 자기 규칙에 T1~T6 을 쓴다. 제목 계약도 T 로 번호를 매기면 한 프롬프트
   * 안에 같은 이름표가 두 벌 생겨 모델이 어느 T6 인지 알 수 없다. 제목 계약은 TT 로 가른다.
   */
  it('제목 계약 번호가 모드 규칙 번호와 겹치지 않는다', () => {
    const block = prompt.slice(prompt.indexOf('[제목 계약'), prompt.indexOf('[JSON 출력 스키마]'));
    expect(block).not.toMatch(/^T\d\./m);
    expect(block).toMatch(/^TT1\./m);
  });

  it('paragraphs 계약은 base 에 그대로 남아 있다', () => {
    expect(prompt).toContain('"paragraphs"');
  });
});
