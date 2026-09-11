import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  applyDetectedHeadings,
  isMarkedHeadingLine,
  lineIndexAtOffset,
  listHeadingLines,
  renameHeadingLine,
  toggleHeadingLine,
} from '../renderer/utils/headingMarkup';
import { normalizeSemiAutoHeadingTitle } from '../renderer/utils/semiAutoHeadingExtractor';

/**
 * [2026-09-09 사장님] "혹시 내가 소제목을 정할 수 있게 못하니?? 반자동 편집에
 * 붙여넣기하면 소제목을 알아서 분석하지만 내 의도와 다른 내용을 소제목으로 지정해놨더라고."
 * "사진으로 글생성 말고도 다른 모드도 마찬가지야."
 *
 * 본문을 유일한 원천으로 둔다 — 목록 편집도 본문 줄 지정도 결국 "## " 표기를 고치는 일이다.
 */

const BODY = [
  '토요일에 거제로 떠났어요.',
  '',
  '근포땅굴 도착',
  '바다 앞 부둣가에 차를 세웠어요.',
  '',
  '점심 꼬막 한 상',
  '10분 기다려 자리에 앉았어요.',
].join('\n');

describe('소제목 표기 읽기', () => {
  it('표기가 없으면 목록도 비어 있다', () => {
    expect(listHeadingLines(BODY)).toEqual([]);
  });

  it('표기된 줄만 소제목으로 센다', () => {
    const marked = toggleHeadingLine(BODY, 2);
    expect(listHeadingLines(marked)).toEqual([{ lineIndex: 2, title: '근포땅굴 도착' }]);
  });

  it('"##" 만 있고 글자가 없으면 소제목이 아니다', () => {
    expect(listHeadingLines('##\n내용')).toEqual([]);
  });
});

describe('줄을 소제목으로 지정·해제', () => {
  it('지정하면 표기가 붙는다', () => {
    const next = toggleHeadingLine(BODY, 5);
    expect(next.split('\n')[5]).toBe('## 점심 꼬막 한 상');
  });

  it('한 번 더 누르면 해제되고 글자는 남는다', () => {
    const marked = toggleHeadingLine(BODY, 5);
    const unmarked = toggleHeadingLine(marked, 5);
    expect(unmarked.split('\n')[5]).toBe('점심 꼬막 한 상');
    // 해제해도 본문 줄이 사라지지 않는다 — 실수로 글이 없어지면 안 된다.
    expect(unmarked.split('\n')).toHaveLength(BODY.split('\n').length);
  });

  it('빈 줄은 소제목이 되지 않는다', () => {
    expect(toggleHeadingLine(BODY, 1)).toBe(BODY);
  });

  it('범위 밖 줄은 무시한다', () => {
    expect(toggleHeadingLine(BODY, 99)).toBe(BODY);
    expect(toggleHeadingLine(BODY, -1)).toBe(BODY);
  });

  it('다른 줄은 건드리지 않는다', () => {
    const next = toggleHeadingLine(BODY, 2).split('\n');
    const before = BODY.split('\n');
    next.forEach((line, i) => {
      if (i !== 2) expect(line).toBe(before[i]);
    });
  });
});

describe('소제목 글자 고치기', () => {
  it('표기된 줄의 글자를 바꾼다', () => {
    const marked = toggleHeadingLine(BODY, 2);
    const renamed = renameHeadingLine(marked, 2, '바다로 뚫린 땅굴, 역광이 만든 초록');
    expect(renamed.split('\n')[2]).toBe('## 바다로 뚫린 땅굴, 역광이 만든 초록');
  });

  it('표기가 없는 줄은 바꾸지 않는다', () => {
    expect(renameHeadingLine(BODY, 3, '아무거나')).toBe(BODY);
  });

  it('빈 제목으로 만들지 않는다 (지우려면 해제를 쓴다)', () => {
    const marked = toggleHeadingLine(BODY, 2);
    expect(renameHeadingLine(marked, 2, '   ')).toBe(marked);
  });
});

describe('커서 위치 → 줄 번호', () => {
  it('첫 줄 안이면 0', () => {
    expect(lineIndexAtOffset(BODY, 3)).toBe(0);
  });

  it('세 번째 줄 안이면 2', () => {
    const offset = BODY.indexOf('근포땅굴 도착') + 2;
    expect(lineIndexAtOffset(BODY, offset)).toBe(2);
  });

  it('범위를 벗어나도 터지지 않는다', () => {
    expect(lineIndexAtOffset(BODY, -5)).toBe(0);
    expect(lineIndexAtOffset(BODY, 99999)).toBe(BODY.split('\n').length - 1);
  });
});

describe('자동 감지 결과를 표기로 굳히기', () => {
  it('본문에 있는 줄만 표기한다', () => {
    const next = applyDetectedHeadings(BODY, ['근포땅굴 도착', '점심 꼬막 한 상']);
    expect(listHeadingLines(next).map((h) => h.title))
      .toEqual(['근포땅굴 도착', '점심 꼬막 한 상']);
  });

  it('본문에 없는 제목은 끼워 넣지 않는다 (쓰지 않은 문장이 생기면 안 된다)', () => {
    const next = applyDetectedHeadings(BODY, ['있지도 않은 소제목']);
    expect(next).toBe(BODY);
  });

  it('이미 표기된 줄을 두 번 표기하지 않는다', () => {
    const once = applyDetectedHeadings(BODY, ['근포땅굴 도착']);
    const twice = applyDetectedHeadings(once, ['근포땅굴 도착']);
    expect(twice).toBe(once);
    expect(twice.split('\n')[2]).toBe('## 근포땅굴 도착');
  });
});

describe('발행 경로와 문법이 맞는다', () => {
  it('표기한 소제목을 기존 추출기가 그대로 읽는다', () => {
    const marked = toggleHeadingLine(BODY, 2);
    const line = marked.split('\n')[2]!;
    // 발행은 normalizeSemiAutoHeadingTitle 로 표기를 뗀다 — 같은 문법이어야 한다.
    expect(normalizeSemiAutoHeadingTitle(line)).toBe('근포땅굴 도착');
  });

  it('isMarkedHeadingLine 이 추출기 문법과 어긋나지 않는다', () => {
    ['## 제목', '# 제목', '### 제목', '  ## 제목'].forEach((line) => {
      expect(isMarkedHeadingLine(line)).toBe(true);
      expect(normalizeSemiAutoHeadingTitle(line)).toBe('제목');
    });
    expect(isMarkedHeadingLine('평범한 문장입니다.')).toBe(false);
  });
});

/**
 * 배선 잠금 — 화면·번들·잠금 세 곳이 맞물려야 실제로 동작한다.
 * (장소 검색 preload 사고처럼 "화면은 있는데 배선이 죽은" 상태를 막는다)
 */
describe('소제목 지정 패널 배선', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('화면에 패널과 두 버튼이 있다', () => {
    const html = read('../../public/index.html');
    expect(html).toMatch(/id="heading-control-panel"/);
    expect(html).toMatch(/id="heading-mark-current-line"/);   // 2번: 본문에서 지정
    expect(html).toMatch(/id="heading-list"/);                 // 1번: 목록 편집
  });

  it('렌더러가 패널을 초기화한다', () => {
    const renderer = read('../renderer/renderer.ts');
    expect(renderer).toMatch(/initHeadingControlPanel\(\);/);
  });

  it('번들 인라인 목록에 등록돼 있다 (누락되면 조용히 죽는다)', () => {
    const copyStatic = read('../../scripts/copy-static.mjs');
    expect(copyStatic).toMatch(/'headingControlPanel\.js',/);
    expect(copyStatic).toMatch(/'headingMarkup\.js',/);
  });

  /*
   * [2026-09-11 라이브] "적용 버튼을 눌러도 미리보기가 안 바뀐다."
   * updateUnifiedPreview / updateUnifiedImagePreview 는 fullAutoFlow.ts 의 최상위 함수라
   * 인라인 번들의 같은 스코프에서 풀린다 — window 에는 없다. window 로 찾으면 항상
   * undefined 이고, typeof 검사에 걸려 갱신이 조용히 건너뛰어진다. 빌드도 린트도 못 잡는다.
   */
  it('미리보기 갱신을 window 에서 찾지 않는다 — 번들 스코프 함수다', () => {
    for (const file of ['../renderer/modules/headingControlPanel.ts', '../renderer/modules/contentGeneration.ts']) {
      const src = read(file);
      const calls = src.replace(/^\s*(?:\*|\/\/).*$/gm, '');   // 주석 줄은 뺀다
      expect(calls).not.toMatch(/\(window as any\)\.updateUnifiedPreview/);
      expect(calls).not.toMatch(/\(window as any\)\.updateUnifiedImagePreview/);
    }
  });

  it('패널이 두 갱신 함수를 번들 전역으로 선언한다', () => {
    const panel = read('../renderer/modules/headingControlPanel.ts');
    expect(panel).toMatch(/declare function updateUnifiedPreview\(/);
    expect(panel).toMatch(/declare function updateUnifiedImagePreview\(/);
  });

  it('사용자가 정한 소제목을 자동 재추출이 덮지 않는다', () => {
    const gen = read('../renderer/modules/contentGeneration.ts');
    expect(gen).toMatch(/headingsLockedByUser === true/);
    const panel = read('../renderer/modules/headingControlPanel.ts');
    expect(panel).toMatch(/content\.headingsLockedByUser = true;/);
  });

  it('번들 단일 스코프 충돌을 피하려고 식별자를 고유하게 쓴다', () => {
    const panel = read('../renderer/modules/headingControlPanel.ts');
    expect(panel).toMatch(/HEADING_PANEL_IDS/);
    expect(panel).toMatch(/headingPanelById/);
    expect(panel).not.toMatch(/^function byId</m);
  });
});
