import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06 배치 6] sports 양모드 신규격 — 26파일 스키마 최종 완결.
 *
 * 이전 배치들이 "도달 불가(CATEGORY_MAP '스포츠'→entertainment)"를 이유로 미룬
 * 마지막 2파일. 라우팅은 그대로 두되(스포츠 이슈글이 issue-story 골격을 받는 현
 * 설계는 의도된 것), 파일 자체는 나머지 24개와 같은 규격으로 맞춘다 — 라우팅이
 * 바뀌거나 title/{mode}/sports.prompt 경로로 쓰일 때 규격 차이가 남지 않도록.
 *
 * 스포츠 고유 위험: 경기 결과·기록 날조, 이적·부상 소문 확정, 직관 경험 위장,
 * 선수 개인 비난. 승부 예측 단정(도박성)도 차단한다.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const seo = read('seo/sports.prompt');
const hf = read('homefeed/sports.prompt');
const ALL: Array<[string, string]> = [['seo', seo], ['homefeed', hf]];

describe('배치 6 — sports 공통 규격', () => {
  it.each(ALL)('%s: ★ 우선 선언 + 조건부 발동', (_n, p) => {
    expect(p).toMatch(/★[\s\S]{0,100}\[SECTION -2\][\s\S]{0,200}(?:우선|항상 위)/);
  });

  it.each(ALL)('%s: LF 전용 + 분량 대역', (_n, p) => {
    expect(p).not.toMatch(/\r/);
    const lines = p.split('\n').length;
    expect(lines).toBeGreaterThanOrEqual(30);
    expect(lines).toBeLessThanOrEqual(62);
  });

  it.each(ALL)('%s: 금지 패턴 부재 (재진술·압력·변환 의무)', (_n, p) => {
    expect(p).not.toMatch(/첫 화면에는/);
    expect(p).not.toMatch(/반드시/);
    expect(p).not.toMatch(/없으면[^\n]*(로 안내한다|로 대체한다|로 채운다|채워 넣는다)/);
    expect(p).not.toContain('필수 경험 표현');
  });

  it.each(ALL)('%s: 기록·결과 입력 한정 + 소문 확정 금지', (_n, p) => {
    expect(p).toMatch(/입력(된| 자료)?에 (있는|적힌|확인된)/);
    expect(p).toMatch(/이적|부상|영입/);
    expect(p).toMatch(/확정(된 사실)?처럼 (쓰지|다루지) 않는다/);
  });

  it.each(ALL)('%s: 직관·시청 경험 게이트', (_n, p) => {
    expect(p).toMatch(/직접 관람·직관·시청 메모가 있을 때만/);
  });

  it.each(ALL)('%s: 승부 예측 단정·도박성 유도 금지', (_n, p) => {
    expect(p).toMatch(/승부 예측|예측을 단정/);
    expect(p).toMatch(/배당|베팅|토토/);
  });

  it.each(ALL)('%s: 선수 개인 비난·인신공격 금지', (_n, p) => {
    expect(p).toMatch(/선수 개인.{0,40}(비난|공격)|인신공격/);
  });
});

describe('배치 6 — SEO sports 고유', () => {
  it('검색 독자가 찾는 것(결과·기록·일정)을 앞에 배치', () => {
    expect(seo).toMatch(/결과[·,\s]{0,3}기록|기록[·,\s]{0,3}일정/);
    expect(seo).toMatch(/먼저 (쓴다|배치한다|답한다)/);
  });

  it('기록 수치는 입력 값만 — 환산·추정 금지', () => {
    expect(seo).toMatch(/평균·환산·누적을 새로 계산하지\s*않고/);
    expect(seo).toMatch(/추정해 만들지 않는다/);
  });
});

describe('배치 6 — 홈판 sports 고유', () => {
  it('멈춤 만들기 — 결과가 아니라 장면·전환점', () => {
    expect(hf).toMatch(/멈춘다면|멈추는/);
    expect(hf).toMatch(/장면|전환점|흐름이 갈린/);
  });

  it('팬 반응·집단 감정 날조 금지', () => {
    expect(hf).toMatch(/팬 반응|집단 (반응|감정)/);
    expect(hf).toMatch(/지어내지 않는다|만들지 않는다/);
  });

  it('base 분기 폴백 문형 공유', () => {
    expect(hf).toMatch(/분기하지 않고 base 구조를 그대로 따른다\./);
  });
});
