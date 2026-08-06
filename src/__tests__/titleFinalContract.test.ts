import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

import { evaluateTitleQuality } from '../contentTitleEvaluator';

/**
 * [2026-08-06 사용자 실측] "케이뱅크 황금캡슐 확인 가이드" — 상황도 클릭 이유도 없는
 * 템플릿 제목이 SEO 모드로 발행됐다.
 *
 * 원인은 모델이 아니라 제목 프롬프트 하네스 자체였다. title/{mode}/{category}.prompt 는
 * 카테고리 파일 하나만 로드된다(상속 없음). 그 파일 안에서
 *   - 클릭 트리거 목록이 "총정리 / 핵심만 / 빠르게 이해하기" 를 권하고
 *   - 100점 예시가 "...계산 방법 정리", "...해당되는 분 빠르게 확인" 으로 끝나고
 *   - 키워드를 앞 N글자에 "필수" 배치하라고 강제했다.
 * finance -> society 매핑이므로 케이뱅크 제목은 seo/society.prompt 가 만들었다.
 *
 * 해결(2단계):
 *   1) 원본 파일에서 충돌 지시를 실제로 제거했다 — 오버레이로 덮는 방식이 아니다.
 *      100점 예시는 few-shot 앵커라 뒤에 오는 지시보다 강하게 끌어당기기 때문이다.
 *   2) 카테고리 파일이 다루지 않는 공통 기준만 shared/title-final-contract.prompt 로
 *      분리해 뒤에 붙인다. 카테고리 파일과 충돌하는 문구는 두지 않는다.
 *
 * 아래 첫 describe 가 회귀 잠금이다 — 충돌 지시가 원본으로 다시 새어들면 실패한다.
 */

const TITLE_PROMPT_DIR = fileURLToPath(new URL('../prompts/title/', import.meta.url));

function collectPromptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectPromptFiles(full));
    else if (entry.endsWith('.prompt')) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return file.slice(TITLE_PROMPT_DIR.length).replace(/\\/g, '/');
}

describe('제목 프롬프트 하네스 — 원본 충돌 잠금', () => {
  const files = collectPromptFiles(TITLE_PROMPT_DIR);

  it('제목 프롬프트가 실제로 존재한다 (스캔이 빈 통과하지 않도록)', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it('키워드를 앞 N글자에 "필수" 배치하라는 강제가 없다', () => {
    // 앞배치는 옵트인 후처리(contentGeneration.ts 의 useKeywordTitlePrefix)가 담당한다.
    // 프롬프트가 다시 강제하면 옵션 OFF 에서도 상황 서술이 밀려난다.
    const offenders = files.filter((f) =>
      /앞\s*\d+\s*글자\s*(내|이내에?)\s*(필수\s*)?배치\s*(필수)?/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('클릭 트리거 목록이 템플릿 종결어를 권하지 않는다', () => {
    const offenders = files.filter((f) => {
      const lines = readFileSync(f, 'utf8').split('\n');
      return lines.some(
        (line) =>
          /^\s*\d+\.\s/.test(line) && /"(총정리|핵심만|빠르게 이해하기|총 경비 정리)"/.test(line),
      );
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it('100점 예시가 템플릿 종결어로 끝나지 않는다 (few-shot 앵커 차단)', () => {
    const TAIL = /(총정리|정리|방법|가이드|꿀팁|확인|알아보기|비법)\s*$/;
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        // 예시 표 "| 키워드 | 제목 |" 는 split('|') 결과가 ['', 키워드, 제목, ''] 이다.
        // 감점표("| 표현 | 사유 | -50 |")는 셀이 하나 더 많아 자연히 제외된다.
        const cells = line.split('|').map((c) => c.trim());
        if (cells.length !== 4 || cells[0] !== '' || cells[3] !== '') continue;
        const [, keyword, title] = cells;
        if (!keyword || !title || title === '100점 제목' || /^-+$/.test(keyword)) continue;
        if (TAIL.test(title)) offenders.push(`${relative(f)} :: ${title}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('금지 표현은 감점표에 남아 있다 (정리가 금지까지 지우지 않았다)', () => {
    const homefeedBase = readFileSync(join(TITLE_PROMPT_DIR, 'homefeed/base.prompt'), 'utf8');
    expect(homefeedBase).toMatch(/"총정리"/);
    expect(homefeedBase).toMatch(/-50/);
  });
});

describe('title contract — 공통 계약 파일', () => {
  const contract = readFileSync(
    new URL('../prompts/title/shared/title-final-contract.prompt', import.meta.url), 'utf8',
  );

  it('카테고리 프롬프트를 무효화하지 않는다 (충돌 선언 금지)', () => {
    expect(contract).not.toMatch(/무효/);
    expect(contract).not.toMatch(/모든 제목 지시보다 우선/);
    expect(contract).toMatch(/충돌하는 지시는 없다/);
  });

  it('클릭 이유(상황·구체 지점)를 요구한다', () => {
    expect(contract).toMatch(/독자가 이 글을 열어야 할 이유/);
    expect(contract).toMatch(/상황·조건·갈림길/);
    expect(contract).toMatch(/도입부 첫 문장이 바로 답/);
  });

  it('템플릿 종결어를 금지한다 (채점기 감점 목록과 정합)', () => {
    for (const word of ['총정리', '방법', '가이드', '핵심정리', '꿀팁']) {
      expect(contract, word).toContain(word);
    }
    expect(contract).toMatch(/확인 가이드/); // 실측 사례 명시
    expect(contract).toMatch(/알아보기|정리해봤습니다/);
  });

  it('예시 베끼기를 막되 예시 자체를 부정하지는 않는다', () => {
    expect(contract).toMatch(/100점 예시는 각도를 보여주는 참고/);
    expect(contract).toMatch(/문장 틀을 그대로 베끼지 않는다/);
  });

  it('앞배치 옵션과 충돌하지 않는다 (권했다면 따르되 상황 우선)', () => {
    expect(contract).toMatch(/앞쪽 배치를 권했다면 따르되/);
    expect(contract).not.toMatch(/고정 위치로[\s\S]{0,20}비틀지 않는다/);
  });

  it('길이·출력 형식은 카테고리 프롬프트에 양보한다', () => {
    expect(contract).toMatch(/위 프롬프트가 지정한 글자 수를 따른다/);
    expect(contract).toMatch(/JSON 형식을 그대로 지킨다/);
    expect(contract).toMatch(/형식 규칙은 이 절이 바꾸지 않는다/);
  });

  it('후보 3개가 서로 다른 각도여야 한다', () => {
    expect(contract).toMatch(/서로 다른 각도/);
  });
});

describe('title contract — 배선', () => {
  it('제목 생성이 카테고리 프롬프트 뒤에 계약을 붙인다', () => {
    const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(generator).toMatch(/title-final-contract\.prompt/);
    expect(generator).toMatch(/titlePrompt = `\$\{titlePrompt\}/);
  });

  it('계약 파일이 빌드 산출물에 복사되는 경로에 있다 (src/prompts 하위)', () => {
    const dir = fileURLToPath(new URL('../prompts/title/shared/', import.meta.url));
    expect(readdirSync(dir)).toContain('title-final-contract.prompt');
  });
});

describe('채점기 정합 — 계약이 막는 제목은 실제로 감점된다', () => {
  it('"확인 가이드"류는 감점되고 상황형은 만점', () => {
    const bad = evaluateTitleQuality('케이뱅크 황금캡슐 확인 가이드', '케이뱅크 황금캡슐', 'seo' as never, '경제');
    const good = evaluateTitleQuality(
      '케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때', '케이뱅크 황금캡슐', 'seo' as never, '경제',
    );
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.issues.join(' ')).toMatch(/템플릿 종결어/);
    expect(good.score).toBeGreaterThanOrEqual(90);
  });
});
