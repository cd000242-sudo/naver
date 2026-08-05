import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05 배치 4a] SEO life·fashion·it 신규격 계약.
 *
 * 비평서 실측: life 는 생활·쇼핑·자동차·문화 4개 도메인이 한 줄에 뭉쳐 사실상
 * 무보정과 다름없었고(상품리뷰가 이 경로로 온다 — 매출 직결), fashion 은
 * 반품을 가르는 축(실측 치수·소재·세탁)이, it 은 구매 전 확인 축(연결 요건·
 * 추가 지출)이 없었다.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const life = read('seo/life.prompt');
const fashion = read('seo/fashion.prompt');
const itp = read('seo/it.prompt');

describe('배치 4a — 우선순위 선언', () => {
  it.each([['life', life], ['fashion', fashion], ['it', itp]])('%s가 base 우선을 선언한다', (_n, p) => {
    expect(p).toMatch(/★[\s\S]{0,80}\[SECTION -2\][\s\S]{0,160}(?:우선|항상 위)/);
  });
});

describe('life — 선택 갈림 배치 계약', () => {
  it('스펙 문단을 따로 만들지 않고 갈림 지점에서 꺼낸다', () => {
    expect(life).toMatch(/스펙을 모아둔 문단을 따로 만들지 않고/);
    expect(life).toMatch(/선택을 가르는 지점에서 꺼낸다/);
  });

  it('자동차 값들을 후보 갈림 기준으로 배치한다', () => {
    expect(life).toMatch(/연식·트림·주행거리/);
  });

  it('구매 형태가 명시되면 그 형태만 다룬다', () => {
    expect(life).toMatch(/신차·중고차·리스·렌트/);
    expect(life).toMatch(/그 형태에 해당하는 조건만/);
  });

  it('할인·재고는 시점성이 드러나야 하고 없으면 언급 금지', () => {
    expect(life).toMatch(/시점에 따라 바뀌는 값임이[\s\S]{0,8}드러나게/);
    expect(life).toMatch(/없으면 언급하지 않는다/);
  });
});

describe('fashion — 반품 축 계약', () => {
  it('실측 치수를 표기 사이즈보다 먼저, 역산 금지', () => {
    expect(fashion).toMatch(/실측 치수/);
    expect(fashion).toMatch(/역산하지 않는다/);
  });

  it('소재를 관리 난이도와 연결한다 (나열 금지)', () => {
    expect(fashion).toMatch(/관리 난이도와 같은 문단에서 연결한다/);
    expect(fashion).toMatch(/소재만 따로 나열하지 않는다/);
  });

  it('감각 서술 대신 표기 범위로 설명한다', () => {
    expect(fashion).toMatch(/착용감·발림·유지력/);
    expect(fashion).toMatch(/표기 범위로 설명한다/);
  });

  it('효능은 표기 범위를 넘기지 않는다', () => {
    expect(fashion).toMatch(/표기 범위를 넘겨 단정하지 않는다/);
    expect(fashion).toMatch(/표기가 없으면 효능을 서술하지 않는다/);
  });

  it('반품 안내를 지어내지 않는다', () => {
    expect(fashion).toMatch(/일반적인 반품 안내를 만들지 않는다/);
  });
});

describe('it — 구매 전 확인 축 계약', () => {
  it('연결·설치 요건을 성능보다 먼저 쓴다', () => {
    expect(itp).toMatch(/연결·설치 요건/);
    expect(itp).toMatch(/성능·사양 설명보다 먼저/);
  });

  it('사용 조건은 입력 어휘로만 나눈다', () => {
    expect(itp).toMatch(/입력에 적힌 사용 조건 어휘/);
    expect(itp).toMatch(/지어내 나누지 않는다/);
  });

  it('비교는 같은 항목 값이 둘 이상일 때만', () => {
    expect(itp).toMatch(/같은 항목의 값이 둘 이상 있을 때만/);
    expect(itp).toMatch(/비교 형태로 옮기지 않는다/);
  });

  it('총비용을 임의 합산하지 않는다', () => {
    expect(itp).toMatch(/본체 가격 외 지출/);
    expect(itp).toMatch(/총비용이라고 부르지 않는다/);
  });
});

describe('배치 4a — 날조 유발 문구 부재', () => {
  it.each([['life', life], ['fashion', fashion], ['it', itp]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });

  it.each([['life', life], ['fashion', fashion], ['it', itp]])('%s가 경험 날조를 요구하지 않는다', (_n, p) => {
    expect(p).not.toContain('필수 경험 표현');
    expect(p).not.toMatch(/구체적 에피소드 필수/);
  });
});
