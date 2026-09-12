/**
 * [2026-09-12 사장님 지적] "굳이 API로 비용 들여가면서 수집할 필요 없다 — 일렉트론 앱인데."
 *
 * 소스들이 캡션을 **이미 손에 쥐고 있으면서 버리고 있었다.** 다음은 실제 브라우저로 DOM 을
 * 읽으면서 alt 를 안 담았고, DDG 는 title 을 받아놓고 안 담았고, 뉴스 og 는 기사 페이지를
 * 열어놓고 제목을 안 담았다. 그래놓고 관련성을 Vision API 로 되샀다.
 *
 * 캡션이 없으면 로컬 판정기가 판정 불가로 남긴다 — 곧 수집량이 0이 된다. 그래서 캡션을
 * 담는지 자체를 계약으로 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (name: string) => readFileSync(resolve(__dirname, `../crawler/issueHarness/sources/${name}`), 'utf8');

describe('소스 어댑터가 캡션을 버리지 않는다', () => {
  it('네이버 — API 가 주는 title 을 담는다(<b> 태그 제거)', () => {
    const s = src('naverApiSource.ts');
    expect(s).toMatch(/caption:/);
    expect(s).toMatch(/replace\(\/<\[\^>\]\+>\/g, ''\)/);
  });

  it('다음 — 브라우저 DOM 의 alt 를 담는다', () => {
    const s = src('daumImageSource.ts');
    expect(s).toMatch(/getAttribute\('alt'\)/);
    expect(s).toMatch(/caption: item\.caption/);
  });

  it('덕덕고 — 이미 받던 title 을 담는다', () => {
    expect(src('duckduckgoSource.ts')).toMatch(/caption: String\(r\.title \|\| ''\)/);
  });

  it('뉴스 og — 기사 제목과 기사 주소를 담는다', () => {
    const s = src('newsOgImageSource.ts');
    expect(s).toMatch(/function extractOgTitle/);
    expect(s).toMatch(/caption: found\.title/);
    expect(s).toMatch(/pageUrl: articleUrl/);
  });

  it('후보 타입이 캡션·출처 페이지를 갖는다', () => {
    const types = readFileSync(resolve(__dirname, '../crawler/issueHarness/types.ts'), 'utf8');
    expect(types).toMatch(/caption\?: string;/);
    expect(types).toMatch(/pageUrl\?: string;/);
  });
});
