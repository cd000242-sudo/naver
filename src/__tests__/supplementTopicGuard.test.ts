import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSupplementQuery,
  filterOnTopicSupplement,
  isOnTopicForKeyword,
} from '../content/supplementTopicGuard';

/**
 * [2026-08-27 사장님 실측 — 주제가 통째로 바뀐 사고]
 *
 * 사장님이 넣은 URL은 윤은혜 '민폐 하객' 논란 해명 기사였는데, 발행된 글은 처음부터
 * 끝까지 김수현 넉오프 이야기였다. 로그가 전말을 보여준다.
 *
 *   크롤 1,472자 (윤은혜)
 *   [URL 심화보강] 원본 1472자 < 1500자 → 상위글 풀텍스트 수집
 *   [네이버 검색 API] "윤은혜, 때아닌 결혼식 '민폐 하객' 논란 해명 "정해진 드레스 코드 있어" | 스타뉴스" 검색 중
 *   [URL 심화보강] ✅ 4건 / 10,330자 보강
 *   rawText 11,831자
 *
 * 두 가지가 겹쳤다.
 *   1. 검색어가 기사 제목 통째였다 — 매체명 꼬리("| 스타뉴스")와 따옴표 인용까지.
 *      네이버는 긴 문장을 토큰으로 쪼개 매칭하므로 "논란 해명" 같은 일반어로 엉뚱한
 *      글이 걸린다.
 *   2. 걸려온 자료를 주제 확인 없이 그대로 이어붙였다. 재료의 87%가 다른 주제였고,
 *      모델은 다수를 따랐다.
 *
 * 보강은 배경용 보조 자료다. 주제가 다르면 없느니만 못하다 — 원본이 얇은 채로 가는
 * 편이 주제가 바뀌는 것보다 낫다.
 */
describe('보강 검색어 정제', () => {
  const TITLE = '윤은혜, 때아닌 결혼식 \'민폐 하객\' 논란 해명 "정해진 드레스 코드 있어" | 스타뉴스';

  it('매체명 꼬리를 뗀다', () => {
    expect(buildSupplementQuery(TITLE, [])).not.toContain('스타뉴스');
  });

  it('따옴표 인용을 뗀다 — 기사 제목의 인용구는 검색어가 아니다', () => {
    expect(buildSupplementQuery(TITLE, [])).not.toContain('드레스 코드');
  });

  it('주체는 남긴다', () => {
    expect(buildSupplementQuery(TITLE, [])).toContain('윤은혜');
  });

  it('검색어를 짧게 자른다 — 긴 문장은 일반어로 엉뚱한 글을 부른다', () => {
    const q = buildSupplementQuery(TITLE, []);
    expect(q.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it('제목이 없으면 키워드를 쓴다', () => {
    expect(buildSupplementQuery('', ['윤은혜', '민폐 하객'])).toContain('윤은혜');
  });

  it('쓸 게 없으면 빈 문자열 — 아무거나 검색하지 않는다', () => {
    expect(buildSupplementQuery('', [])).toBe('');
    expect(buildSupplementQuery(undefined as never, undefined as never)).toBe('');
  });
});

describe('보강 자료 주제 검증', () => {
  // 실전에서 이 보강은 원본 500~1500자 구간에서만 돈다. 시료도 그 규모로 둔다 —
  // 짧으면 "판정하지 않는다" 안전망에 걸려 검사 자체가 일어나지 않는다.
  const BASE = [
    '배우 윤은혜가 결혼식 하객룩 논란에 대해 직접 해명했다.',
    '윤은혜는 26일 자신의 채널을 통해 "정해진 드레스 코드가 있었다"라고 밝혔다.',
    '앞서 윤은혜가 참석한 결혼식 사진이 공개되며 민폐 하객 논란이 일었다.',
    '윤은혜 측은 신부와 사전에 상의된 복장이었다고 설명했다.',
    '결혼식에 참석한 다른 하객들도 비슷한 색상의 옷을 입었다는 목격담이 이어졌다.',
    '윤은혜의 해명 이후 결혼식 하객 복장을 둘러싼 논란은 잦아드는 분위기다.',
    '소속사는 윤은혜가 신부와 오랜 친분이 있었다는 점도 함께 전했다.',
    '드레스 코드를 미리 공유받았다는 설명이 나오면서 민폐 하객 지적은 힘을 잃었다.',
  ].join(' ');

  const ON = '[상위글 1 — 윤은혜 하객룩]\n윤은혜의 결혼식 하객 복장에 대한 반응을 정리했다. 드레스 코드 이야기가 나온다.';
  const OFF = '[상위글 2 — 김수현 넉오프]\n김수현의 디즈니플러스 시리즈 넉오프는 공개가 무기한 보류됐다. 김세의는 구속기소됐다.';

  it('주제가 다른 자료를 버린다', () => {
    const r = filterOnTopicSupplement(BASE, `${ON}\n\n${OFF}`);
    expect(r.text).toContain('윤은혜의 결혼식 하객');
    expect(r.text).not.toContain('넉오프');
    expect(r.dropped).toBe(1);
    expect(r.kept).toBe(1);
  });

  it('전부 주제가 다르면 보강을 통째로 버린다 — 얇은 원본이 낫다', () => {
    const r = filterOnTopicSupplement(BASE, OFF);
    expect(r.text).toBe('');
    expect(r.kept).toBe(0);
  });

  it('주제가 맞으면 그대로 둔다', () => {
    const r = filterOnTopicSupplement(BASE, ON);
    expect(r.kept).toBe(1);
    expect(r.dropped).toBe(0);
  });

  it('원본이 얇으면 판정하지 않는다 — 없는 근거로 버리지 않는다', () => {
    const r = filterOnTopicSupplement('짧다.', `${ON}\n\n${OFF}`);
    expect(r.kept).toBeGreaterThan(0);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => filterOnTopicSupplement(null as never, undefined as never)).not.toThrow();
  });
});

describe('본선 배선', () => {
  const src = readFileSync(resolve(__dirname, '../sourceAssembler.ts'), 'utf-8');

  it('심화보강이 정제된 검색어를 쓴다', () => {
    expect(src).toMatch(/buildSupplementQuery\(/);
  });

  it('심화보강이 주제 검증을 거친다', () => {
    expect(src).toMatch(/filterOnTopicSupplement\(/);
  });

  it('제목을 통째로 검색어에 쓰던 코드가 남아 있지 않다', () => {
    const codeOnly = src.split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toMatch(/const supplementQuery = baseTitle \|\|/);
  });
});

/**
 * [2026-08-27 사장님 실측 — 황석정 글] 2차전지 주식 시황과 조선시대 품계가 본문에 들어왔다.
 *
 *   원본 590자 (황석정 무덤 일화)
 *   [URL 심화보강] ⚠️ 주제가 다른 자료 2건 제외   ← 주제 필터는 작동했다
 *   [URL 심화보강] ✅ 3건 / 6544자 보강            ← 그런데 원본의 11배다
 *   rawText 6,334자
 *
 * 주제 필터를 통과한 블로그 안에도 잡다한 게 섞여 있었다(수집된 블로그 원본은 각각
 * 6,722자 / 24,045자 / 93,872자). 원본이 8%뿐이면 글의 주인은 이미 블로그다.
 *
 * 보강 경고문은 처음부터 이렇게 적고 있었다 — "원본이 주 근거, 보충은 배경/맥락용".
 * 코드가 그 말을 강제하지 않았을 뿐이다.
 */
describe('보강은 원본을 넘어설 수 없다', () => {
  const BASE = '황석정이 무덤 없는 땅을 샀는데 비석이 나왔다고 말했다. '.repeat(12); // 약 600자

  const block = (n: number, body: string) => `[상위글 ${n} — 황석정]\n황석정 ${body}`;

  it('원본의 몇 배를 넘으면 뒤쪽 블록을 버린다', () => {
    const huge = [1, 2, 3, 4, 5].map((n) => block(n, '무덤 이야기가 이어졌다. '.repeat(60))).join('\n\n');
    const r = filterOnTopicSupplement(BASE, huge);
    expect(r.text.length).toBeLessThanOrEqual(BASE.length * 3 + 200);
    expect(r.overflowDropped).toBeGreaterThan(0);
  });

  it('블록을 통째로만 자른다 — 문장이 끊기지 않는다', () => {
    const huge = [1, 2, 3, 4, 5].map((n) => block(n, '무덤 이야기가 이어졌다. '.repeat(60))).join('\n\n');
    const r = filterOnTopicSupplement(BASE, huge);
    for (const part of r.text.split('\n\n')) {
      if (part.trim()) expect(part.trim().startsWith('[상위글')).toBe(true);
    }
  });

  it('예산 안이면 그대로 둔다', () => {
    const small = block(1, '무덤 이야기가 짧게 이어졌다.');
    const r = filterOnTopicSupplement(BASE, small);
    expect(r.overflowDropped).toBe(0);
    expect(r.text).toContain('무덤 이야기가 짧게');
  });

  it('첫 블록이 예산보다 커도 하나는 남긴다 — 보강이 통째로 사라지지 않게', () => {
    const oneHuge = block(1, '무덤 이야기가 이어졌다. '.repeat(300));
    const r = filterOnTopicSupplement(BASE, oneHuge);
    expect(r.kept).toBe(1);
  });

  it('유지 건수는 실제 상위글 블록만 센다', () => {
    const two = `${block(1, '무덤 이야기.')}\n\n${block(2, '비석 이야기.')}`;
    expect(filterOnTopicSupplement(BASE, two).kept).toBe(2);
  });
});

/**
 * [2026-08-27 2번] 수집 단계에서 키워드와 주제를 대조한다.
 *
 * 지금까지의 주제 필터는 URL 모드의 심화보강에만 걸려 있었다. 기준이 될 원본 기사가
 * 있어야 대조가 되기 때문이다. 키워드 모드는 그 원본이 없다 — 블로그 여러 편이 대등하게
 * 섞이고, 그중 하나가 자동차 얘기면 그대로 들어온다.
 *
 * 실측: "서인영 46kg" 글에 미니 컨트리맨 스펙(전장 4445mm, 204마력, 4550만원)이
 * 소제목 두 개를 차지했다. 기사에는 "서인영"이 있어도 "4445mm"는 없다.
 *
 * 기준 원본이 없으면 키워드 자체를 기준으로 삼는다. 검색어에 든 고유명사를 하나도
 * 안 가진 글은 그 키워드의 자료가 아니다.
 */
describe('키워드로 주제를 대조한다', () => {
  it('키워드의 고유명사를 가진 글은 통과한다', () => {
    expect(isOnTopicForKeyword(
      '서인영이 15kg을 감량해 46kg이 됐다고 밝혔다. 탄수화물을 끊었다고 한다.',
      '서인영 46kg',
    )).toBe(true);
  });

  it('키워드와 아무 관계 없는 글은 걸러낸다', () => {
    expect(isOnTopicForKeyword(
      '미니 컨트리맨은 전장 4445mm 전폭 1845mm이며 최고출력 204마력을 낸다.',
      '서인영 46kg',
    )).toBe(false);
  });

  it('키워드가 여러 낱말이면 하나만 겹쳐도 통과한다', () => {
    expect(isOnTopicForKeyword('자판기처럼 애교가 나온다는 반응이 많다.', '서은광 애교 자판기'))
      .toBe(true);
  });

  it('숫자만 든 조각은 키워드 근거가 되지 못한다', () => {
    // "46kg" 은 토큰이 아니다 — 숫자가 섞인 말은 아무 글에나 있을 수 있다.
    expect(isOnTopicForKeyword('체중 46kg을 유지하는 방법입니다.', '서인영 46kg')).toBe(false);
  });

  it('키워드에서 토큰을 못 뽑으면 판정하지 않는다 — 못 보는 가드는 막지 않는다', () => {
    expect(isOnTopicForKeyword('아무 글이나', '2026')).toBe(true);
    expect(isOnTopicForKeyword('아무 글이나', '')).toBe(true);
  });

  it('본문이 비면 판정하지 않는다', () => {
    expect(isOnTopicForKeyword('', '서인영 46kg')).toBe(true);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => isOnTopicForKeyword(null as never, undefined as never)).not.toThrow();
  });
});

describe('수집기 배선', () => {
  const src = readFileSync(resolve(__dirname, '../sourceAssembler.ts'), 'utf-8');

  it('풀텍스트 수집이 키워드와 주제를 대조한다', () => {
    expect(src).toMatch(/isOnTopicForKeyword\(/);
  });

  it('걸러낸 건수를 로그로 남긴다 — 조용히 버리지 않는다', () => {
    expect(src).toMatch(/주제 밖[^\n]*건/);
  });
});
