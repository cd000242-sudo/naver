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
const readGenerationPromptSources = () => [
  read('contentGenerator.ts'),
  read('contentJsonPromptFormat.ts'),
  read('contentCustomModePrompt.ts'),
].join('\n');

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
    expect(prompt).toContain('구매자 리뷰는 작성자 본인의 경험이 아니다');
    expect(prompt).toContain('친한 친구');
    expect(prompt).not.toContain('이 제품을 구매해서 사용한 실제 소비자');
    expect(prompt).not.toContain('2주 정도 사용해봤어요');
  });

  it('쇼핑커넥트는 사실 기반 구매 매력과 확인 문구 예산을 함께 강제한다', () => {
    const reviewPrompt = read('prompts/affiliate/shopping_review.prompt');
    const specPrompt = read('prompts/affiliate/shopping_spec_analysis.prompt');

    for (const prompt of [reviewPrompt, specPrompt]) {
      expect(prompt).toContain('문제 → 확인된 속성 → 생활상 이익');
      expect(prompt).toContain('가장 잘 맞는 사람');
      expect(prompt).toContain('확인 계열 표현은 글 전체 최대 2회');
      expect(prompt).toContain('CTA는 마지막 1회');
    }
    expect(reviewPrompt).not.toContain('목표는 상품을 띄우는 글이 아니다');
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
    const src = readGenerationPromptSources();
    expect(src).toContain('사용자정의 모드');
    expect(src).toContain('사용자정의 모드 제어 규칙');
    expect(src).toContain('사용자 요청에서 목적, 대상 독자, 필수 형식, 금지 표현');
    expect(src).toContain('자료 외 사실 작성 금지');
    expect(src).toContain('거짓 경험 금지');
    expect(src).toContain('모바일 가독성');
  });
});

// 표는 비교 행과 입력 근거가 있을 때 강제하고, 서사형 글에는 억지 삽입하지 않는다.
describe('표 생성 적합성 계약', () => {
  const source = readGenerationPromptSources();

  it('비교 행과 근거가 충분할 때만 2열 표를 작성한다', () => {
    expect(source).toContain('표는 서로 대조할 행이 2개 이상 있고 입력 근거가 충분할 때만 최대 2열');
    expect(source).toContain('표가 어색한 글은 억지로 넣지 않는다');
  });

  it('사용자정의 모드도 입력 근거가 충분한 비교표만 허용한다', () => {
    expect(source).toContain('비교 행이 2개 이상이고 입력 근거가 충분할 때만 최대 2열 마크다운 표');
    expect(source).not.toContain('표 1개 필수');
  });
});

// 2026-06-12 라운드2: 표 필수화에도 발행물 표 0 — 원인은 프롬프트 자기모순.
// 최종 강제 조건의 "마크다운/설명 절대 금지"(위반 시 0점)가 표 작성 지시를
// 압도. 금지 범위를 "JSON 밖"으로 한정하고 표 필수를 강제 조건으로 승격.
describe('표 생성 프롬프트 자기모순 해소 (2026-06-12 라운드2)', () => {
  const source = readGenerationPromptSources();

  it('마크다운 전면 금지 조항이 사라지고 JSON 밖 한정으로 바뀐다', () => {
    expect(source).not.toContain('마크다운/설명 절대 금지');
    expect(source).toContain('JSON 문자열 값 안의 마크다운 표·리스트는 허용');
  });

  it('최종 조건에서도 표의 판단 가치와 입력 근거를 요구한다', () => {
    expect(source).toContain('6. 표·체크리스트는 독자 판단을 실제로 더 쉽게 만들고 입력 근거가 충분할 때만 포함');
  });
});

// 2026-06-12 라운드3: 형식 예시 "| 항목 | 정리 |"를 LLM이 보일러플레이트로
// 복사해 표 밖에 단독 출력 — 예시임을 명시하고 단독 출력을 금지한다.
describe('표 형식 예시 보일러플레이트 방지 (2026-06-12 라운드3)', () => {
  it('열 이름 예시 교체 지시와 표 밖 단독 헤더 금지를 명시한다', () => {
    const source = readGenerationPromptSources();
    expect(source).toContain("'항목/정리'는 형식 예시");
    expect(source).toContain('표 밖에');
  });
});
describe('official exposure prompt contract', () => {
  it('loads the official exposure overlay for SEO, homefeed, and mate generation', () => {
    const overlay = read('prompts/shared/official-exposure-rubric.prompt');
    const loader = read('promptLoader.ts');

    expect(overlay).toContain('OFFICIAL NAVER EXPOSURE PRIORITY OVERRIDE');
    expect(overlay).toContain('Intent answer fit');
    expect(overlay).toContain('Evidence and experience density');
    expect(overlay).toContain('Mate mode');
    expect(loader).toContain('official-exposure-rubric.prompt');
    expect(loader).toContain("mode === 'homefeed'");
  });

  it('loads separate 90+ quality overlays for SEO, homefeed, and mate', () => {
    const seoOverlay = read('prompts/shared/seo-90-quality.prompt');
    const homefeedOverlay = read('prompts/shared/homefeed-90-quality.prompt');
    const mateOverlay = read('prompts/shared/mate-90-quality.prompt');
    const loader = read('promptLoader.ts');

    expect(seoOverlay).toContain('SEO 90+ QUALITY CONTRACT');
    expect(seoOverlay).toContain('Search intent is answered');
    expect(homefeedOverlay).toContain('HOMEFEED 90+ QUALITY CONTRACT');
    expect(homefeedOverlay).toContain('내 얘기 같은 첫 화면');
    expect(homefeedOverlay).toContain('저장할 이유');
    expect(homefeedOverlay).toContain('댓글 달 거리');
    expect(mateOverlay).toContain('NAVER MATE 90+ QUALITY CONTRACT');
    expect(mateOverlay).toContain('citeable answer atom');

    expect(loader).toContain('seo-90-quality.prompt');
    expect(loader).toContain('homefeed-90-quality.prompt');
    expect(loader).toContain('mate-90-quality.prompt');
    expect(loader).toContain('quality90OverlayByMode');
  });
});
