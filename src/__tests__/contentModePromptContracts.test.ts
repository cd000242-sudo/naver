/**
 * contentModePromptContracts.test.ts
 *
 * 홈판/SEO/쇼핑커넥트/업체홍보/사용자정의 모드가 공통 품질 계약을 잃지 않도록
 * 프롬프트와 조립부를 정적 검증한다.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('콘텐츠 모드 프롬프트 계약', () => {
  it('homefeed는 후킹/사람다움/근거성 계약을 동시에 가진다', () => {
    const prompt = read('prompts/homefeed/base.prompt');
    expect(prompt).toContain('GAMMA-7');
    expect(prompt).toContain('진짜 사람 디지털 지문');
    expect(prompt).toContain('자료 외 사실 작성 금지');
    expect(prompt).toContain('첫 3문장');
  });

  it('SEO는 D.I.A 대응: 검색 의도, 경험/정보성, 어뷰징 회피를 포함한다', () => {
    const prompt = read('prompts/seo/base.prompt');
    expect(prompt).toContain('검색 의도 분석');
    expect(prompt).toContain('자료 외 사실 작성 금지');
    expect(prompt).toContain('AI 브리핑');
    expect(prompt).toContain('키워드 반복');
  });

  it('네이버 메이트는 AI 브리핑 인용·주제 전문성·정책 위험 회피를 포함한다', () => {
    const prompt = read('prompts/mate/base.prompt');
    expect(prompt).toContain('AI 브리핑');
    expect(prompt).toContain('울트라 스코어카드');
    expect(prompt).toContain('인용 원자');
    expect(prompt).toContain('첫 300자');
    expect(prompt).toContain('주제 전문성');
    expect(prompt).toContain('허위 리뷰');
    expect(prompt).toContain('선정 보장');
  });

  it('쇼핑커넥트는 리뷰 데이터 부재 시 체험 위장을 막는다', () => {
    const prompt = read('prompts/affiliate/shopping_review.prompt');
    expect(prompt).toContain('리뷰 데이터 부재');
    expect(prompt).toContain('체험 서술 전면 금지');
    expect(prompt).toContain('과대광고');
  });

  it('업체홍보는 광고법/의료광고법과 입력 연락처 보존을 강제한다', () => {
    const prompt = read('prompts/business/base.prompt');
    expect(prompt).toContain('입력된 값만 사용');
    expect(prompt).toContain('의료광고법');
    expect(prompt).toContain('문의/견적/상담 안내');
    expect(prompt).toContain('입력/원본에 없는 숫자 근거는 절대 만들지 않는다');
    expect(prompt).toContain('총 3~6회만 자연 노출');
    expect(prompt).not.toContain('8~12회');
    expect(prompt).not.toContain('시공 1,200건');
  });

  it('사용자정의 모드도 자료 외 사실·거짓 경험·모바일 호흡 가드레일을 가진다', () => {
    const src = read('contentGenerator.ts');
    expect(src).toContain('사용자정의 모드');
    expect(src).toContain('사용자정의 모드 제어 규칙');
    expect(src).toContain('사용자 요청에서 목적, 대상 독자, 필수 형식, 금지 표현');
    expect(src).toContain('자료 외 사실 작성 금지');
    expect(src).toContain('거짓 경험 금지');
    expect(src).toContain('모바일 가독성');
  });
});

// 2026-06-12 라이브 실측: 기준/증빙/지급기준 4연속 발행에서 표 0개 — "가능하면"
// 재량 문구를 LLM이 인용구로 회피. 항목화 가능한 주제는 표를 필수로 강제한다.
describe('표 생성 강제 계약 (2026-06-12)', () => {
  const source = read('contentGenerator.ts');

  it('항목화 가능한 주제(기준·금액·서류·절차·비교)는 표 1개 필수를 명시한다', () => {
    expect(source).toContain('기준·금액·서류·절차·비교처럼 항목화 가능한 주제면 2열 마크다운 표 1개를 반드시 작성');
    expect(source).not.toContain('가능하면 마크다운 표를 실제로 작성한다');
  });

  it('jsonOutputFormat 요약 블록에도 동일 필수 조건이 들어간다', () => {
    expect(source).toContain('정보형 글은 기준·금액·서류·절차·비교 주제면 2열 마크다운 표 1개 필수');
    expect(source).not.toContain('정보형 글은 최대 2열 마크다운 표를 실제 본문에 작성');
  });
});

// 2026-06-12 라운드2: 표 필수화에도 발행물 표 0 — 원인은 프롬프트 자기모순.
// 최종 강제 조건의 "마크다운/설명 절대 금지"(위반 시 0점)가 표 작성 지시를
// 압도. 금지 범위를 "JSON 밖"으로 한정하고 표 필수를 강제 조건으로 승격.
describe('표 생성 프롬프트 자기모순 해소 (2026-06-12 라운드2)', () => {
  const source = read('contentGenerator.ts');

  it('마크다운 전면 금지 조항이 사라지고 JSON 밖 한정으로 바뀐다', () => {
    expect(source).not.toContain('마크다운/설명 절대 금지');
    expect(source).toContain('JSON 문자열 값 안의 마크다운 표·리스트는 허용');
  });

  it('표 필수가 최종 강제 조건 목록에 들어간다', () => {
    expect(source).toContain('6. 기준·금액·서류·절차·비교처럼 항목화 가능한 주제면 본문에 2열 마크다운 표');
  });
});
