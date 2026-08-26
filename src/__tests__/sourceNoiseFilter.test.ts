import { describe, it, expect } from 'vitest';
import { stripSourceNoise } from '../content/sourceNoiseFilter';

/**
 * [2026-08-26 사장님 실측] 발행된 글 본문에 이 문장이 들어갔다.
 *   "발행 시각 07:27조회수를 기록한 관련 소식에 따르면, 두 사람은 2014년 6월에…"
 * 원본 기사의 발행 시각·조회수가 재료로 흘러들어가 모델이 사실인 양 엮었다.
 */
describe('기사 껍데기 제거', () => {
  it('실측 사례의 발행 시각·조회수를 걷어낸다', () => {
    const { text } = stripSourceNoise('발행 시각 07:27 조회수 1,234회 를 기록한 관련 소식에 따르면 두 사람은 2014년 6월에 결혼했다.');
    expect(text).not.toMatch(/발행 시각/);
    expect(text).not.toMatch(/조회수 1,234/);
    expect(text).toMatch(/두 사람은 2014년 6월에 결혼했다/);
  });

  it('입력·수정 시각 줄을 지운다', () => {
    const src = ['입력 2026.08.26. 오전 7:27', '수정 2026.08.26. 오전 8:10', '김윤주가 셀카를 공개했다.'].join('\n');
    const { text, removedLines } = stripSourceNoise(src);
    expect(removedLines).toBe(2);
    expect(text).toBe('김윤주가 셀카를 공개했다.');
  });

  it('저작권 고지와 기자 바이라인을 지운다', () => {
    const src = ['홍길동 기자', 'hong@news.com', '본문 내용입니다.', '저작권자 ⓒ 뉴스1 무단 전재 및 재배포 금지'].join('\n');
    const { text } = stripSourceNoise(src);
    expect(text).toBe('본문 내용입니다.');
  });

  it('사진 캡션과 관련기사 유도를 지운다', () => {
    const src = ['[사진=연합뉴스]', '본문입니다.', '▶ 관련기사 더보기'].join('\n');
    expect(stripSourceNoise(src).text).toBe('본문입니다.');
  });

  it('본문 속 날짜·숫자는 지키다 — 지우면 사실을 잃는다', () => {
    const src = '두 사람은 2014년 6월에 결혼해 13년차 부부다. 청약 금리는 2.8%로 올랐고 한도는 25만원이다.';
    expect(stripSourceNoise(src).text).toBe(src);
  });

  it('빈 입력은 그대로', () => {
    expect(stripSourceNoise('').text).toBe('');
    expect(stripSourceNoise(null).removedLines).toBe(0);
  });
});

describe('긴 줄은 통째로 지우지 않는다 (개발 중 실측한 함정)', () => {
  it('껍데기가 앞머리에만 있으면 그 조각만 뺀다', () => {
    const line = '발행 시각 07:27 조회수 1,234회 를 기록한 관련 소식에 따르면 두 사람은 2014년 6월에 결혼했다고 한다.';
    const { text, removedLines } = stripSourceNoise(line);
    expect(removedLines).toBe(0);
    expect(text).toMatch(/두 사람은 2014년 6월에 결혼했다고 한다/);
  });

  it('저작권 고지는 길어도 지운다', () => {
    const long = '저작권자 ⓒ 뉴스1 무단 전재 및 재배포 금지 — 본 기사는 뉴스1의 사전 동의 없이 어떠한 형태로도 사용할 수 없습니다.';
    expect(stripSourceNoise(long).text).toBe('');
  });
});
