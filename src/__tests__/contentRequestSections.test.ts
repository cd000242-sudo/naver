import { describe, expect, it } from 'vitest';
import { buildRequestChecklistBlock, parseRequestSections } from '../contentRequestSections.js';
import { assessCustomPromptAdherence } from '../contentPromptAdherence.js';

/*
 * [2026-10-22] 사장님 실제 요청사항(LEWORD 홈판 카드의 "이렇게 쓰세요" 를 그대로 붙여 넣은 형태).
 * 예전 검사기는 줄 단위로만 읽어 "반드시 들어갈 내용" 머리말에서 '들어갈' 을 필수어로,
 * "넣지 않을 내용" 에서 '넣지' 를 금지어로 뽑았고, 일본판을 섞고 부승권을 뺀 글을 79점 통과시켰다.
 */
const REQUEST = `이렇게 쓰세요
'환자 간에 이니셜' 검색 수요가 확인되니 검색 유입을 메인으로 잡는다. 벤치마크 글들은 이니셜 의미 해석에 몰려 있고 '김지원이 왜 쫓겨나는지'와의 연결고리는 비어 있으니 그 각도로 채운다. 독자는 4화 전개를 놓쳤을 때 핵심 반전을 빠르게 파악하려 들어온다.

노릴 검색어 · 네이버 자동완성 환자 간에 이니셜

반드시 들어갈 내용
닥터X 4화에서 장승조가 환자 간에 새긴 이니셜(ND 등)의 의미 요약
부승권 계약 해지 이야기와 장승조 사건의 연결 여부 정리
김지원 캐릭터가 '쫓겨난다'는 전개의 구체적 맥락
4화 등장인물 관계 정리(장승조·김지원·부승권 등)
넣지 않을 내용
동명의 다른 '닥터X' 시리즈(과거 일본판 등)와 혼동
작성 전 확인 4화 실제 방영 내용과 이니셜 의미(방송사 공식 하이라이트·회차 소개) · 부승권 계약 해지 설정이 실제 대본상 사실인지 원문 기사 재확인`;

const FOLLOWED = [
  '닥터X 4화에서 장승조가 환자 간에 새긴 이니셜 ND 가 무엇을 뜻하는지부터 짚습니다.',
  '환자 간에 이니셜 장면은 김지원이 왜 쫓겨나는지와 이어집니다.',
  '부승권 계약 해지 이야기가 장승조 사건과 연결되는지 정리했습니다.',
  '김지원 캐릭터가 병원에서 쫓겨난다는 전개의 맥락은 이렇습니다.',
  '4화 등장인물 관계: 장승조, 김지원, 부승권.',
].join('\n');

const BROKEN = [
  '닥터X 4화 환자 간에 이니셜 이야기입니다.',
  '일본판 닥터X 시리즈와 비교하면 장승조 사건은 더 극적입니다.',
  '김지원이 왜 쫓겨나는지는 다음 화에서 보겠습니다. 등장인물 연결 관계와 계약 해지 사건도 짧게.',
].join('\n');

describe('parseRequestSections', () => {
  it('구간 머리말과 항목을 나눠 읽는다(머리말 낱말은 항목이 아니다)', () => {
    const s = parseRequestSections(REQUEST)!;
    expect(s).not.toBeNull();
    expect(s.targets).toEqual(['환자 간에 이니셜']);
    expect(s.mustInclude).toHaveLength(4);
    expect(s.mustInclude[1]).toBe('부승권 계약 해지 이야기와 장승조 사건의 연결 여부 정리');
    expect(s.mustAvoid).toEqual(["동명의 다른 '닥터X' 시리즈(과거 일본판 등)와 혼동"]);
    expect(s.verify).toHaveLength(2);
    expect(s.direction.join(' ')).toContain('김지원이 왜 쫓겨나는지');
  });

  it('구간 머리말이 없는 평범한 요청은 null — 기존 검사가 그대로 본다', () => {
    expect(parseRequestSections('반드시 FAQ를 넣어주세요.\n광고문구는 쓰지 마세요.')).toBeNull();
  });

  it('앱이 덧붙인 내부 지시([DAILY HOMEFEED EDITORIAL])는 항목으로 읽지 않는다', () => {
    const s = parseRequestSections(`${REQUEST}\n[DAILY HOMEFEED EDITORIAL]\n- 편집 각도는 대조로 잡는다\n{"angle":"x"}`)!;
    expect(s.verify).toHaveLength(2);
    expect(s.verify.join(' ')).not.toContain('편집 각도');
  });

  it('머리말 뒤 같은 줄 내용과 글머리표도 항목으로 읽는다', () => {
    const s = parseRequestSections('반드시 들어갈 내용: 신청 기한\n- 준비 서류\n• 문의처\n넣지 않을 내용: 타 지역 사례')!;
    expect(s.mustInclude).toEqual(['신청 기한', '준비 서류', '문의처']);
    expect(s.mustAvoid).toEqual(['타 지역 사례']);
  });
});

describe('buildRequestChecklistBlock', () => {
  it('항목을 그대로 담은 마지막 점검표를 만든다', () => {
    const block = buildRequestChecklistBlock(REQUEST);
    expect(block).toContain('환자 간에 이니셜');
    expect(block).toContain('부승권 계약 해지 이야기와 장승조 사건의 연결 여부 정리');
    expect(block).toContain("동명의 다른 '닥터X' 시리즈(과거 일본판 등)와 혼동");
    expect(block).toContain('부승권 계약 해지 설정이 실제 대본상 사실인지 원문 기사 재확인');
    // 뒤의 근거 계약이 "확인되지 않았습니다" 류 메타 문구를 금지한다 — 점검표가 그 문구를 시키면 안 된다(실주행에서 발견).
    expect(block).not.toMatch(/확인되지 않았/);
  });

  it('구간이 없는 요청엔 점검표를 만들지 않는다', () => {
    expect(buildRequestChecklistBlock('친근한 말투로 써 주세요')).toBe('');
  });
});

describe('구간형 요청 준수 검사', () => {
  it('요청을 지킨 글은 통과하고, 머리말 낱말(들어갈·넣지)은 검사어가 아니다', () => {
    const r = assessCustomPromptAdherence({ selectedTitle: '닥터X 4화 환자 간에 이니셜 의미', bodyPlain: FOLLOWED }, { customPrompt: REQUEST });
    expect(r.passed).toBe(true);
    expect(r.requiredTerms).not.toContain('들어갈');
    expect(r.forbiddenTerms).not.toContain('넣지');
  });

  it('넣지 않을 내용(일본판)을 넣고 반드시 들어갈 항목(부승권)을 뺀 글은 실패한다', () => {
    const r = assessCustomPromptAdherence({ selectedTitle: '닥터X 4화 환자 간에 이니셜', bodyPlain: BROKEN }, { customPrompt: REQUEST });
    expect(r.passed).toBe(false);
    expect(r.foundForbiddenTerms).toContain('일본판');
    expect(r.missingTerms).toContain('부승권');
    expect(r.retryInstruction).toContain('부승권 계약 해지 이야기와 장승조 사건의 연결 여부 정리');
    expect(r.retryInstruction).toContain('일본판');
  });

  it('노릴 검색어가 글에 없으면 실패한다', () => {
    const r = assessCustomPromptAdherence({ selectedTitle: '닥터X 4화', bodyPlain: FOLLOWED.replace(/환자 간에 이니셜/g, '이니셜') }, { customPrompt: REQUEST });
    expect(r.passed).toBe(false);
    expect(r.missingTerms).toContain('환자 간에 이니셜');
  });

  it('"표로 정리하지 말 것" 같은 금지 구간은 표를 요구하는 것으로 읽지 않는다', () => {
    const r = assessCustomPromptAdherence({ selectedTitle: '신청 안내', bodyPlain: '신청 기한은 이달 말입니다. 준비 서류는 신분증입니다.' }, { customPrompt: '반드시 들어갈 내용\n신청 기한\n준비 서류\n넣지 않을 내용\n비교표로 정리하지 말 것' });
    expect(r.missingFeatures).toEqual([]);
    expect(r.passed).toBe(true);
  });
});

describe('프롬프트 배선', () => {
  it('구간형 요청이면 점검표가 프롬프트 끝쪽(원본 본문 뒤)에 들어간다', async () => {
    const { buildModeBasedPrompt } = await import('../contentGenerator');
    const rawText = '원본 기사 본문입니다. '.repeat(40);
    const prompt = buildModeBasedPrompt({ sourceType: 'custom_text', rawText, title: '닥터X 4화', contentMode: 'seo', customPrompt: REQUEST } as any, 'seo', undefined, 1800);
    const at = prompt.lastIndexOf('[사용자 요청사항 최종 점검');
    expect(at).toBeGreaterThan(prompt.lastIndexOf('원본 기사 본문입니다.'));
    expect(prompt.slice(at)).toContain('부승권 계약 해지 이야기와 장승조 사건의 연결 여부 정리');
  });
});

describe('mergeCustomPrompt', () => {
  it('개인 프롬프트와 요청사항을 둘 다 싣는다(예전엔 요청사항이 버려졌다)', async () => {
    const { mergeCustomPrompt } = await import('../contentRequestSections.js');
    const merged = mergeCustomPrompt('친근한 말투로', REQUEST);
    expect(merged.startsWith('친근한 말투로')).toBe(true);
    expect(merged).toContain(REQUEST);
    expect(parseRequestSections(merged)!.mustInclude).toHaveLength(4);
  });
  it('한쪽만 있으면 그쪽, 이미 합쳐진 값엔 다시 붙이지 않는다', async () => {
    const { mergeCustomPrompt } = await import('../contentRequestSections.js');
    expect(mergeCustomPrompt('', ' 요청 ')).toBe('요청');
    expect(mergeCustomPrompt('개인', '')).toBe('개인');
    const once = mergeCustomPrompt('개인', '요청');
    expect(mergeCustomPrompt(once, '요청')).toBe(once);
  });
});

describe('요청사항 경로 배선(끊겨도 예외가 안 나 소스로 잠근다)', () => {
  const read = async (rel: string) => (await import('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8');
  it('연속발행 · 다중계정 · 풀오토 폴백이 큐/생성 때 요청사항을 합친다', async () => {
    for (const rel of ['../renderer/modules/continuousPublishing.ts', '../renderer/modules/multiAccountManager.ts', '../renderer/modules/fullAutoFlow.ts']) {
      const src = await read(rel);
      expect(src, rel).toMatch(/import \{ mergeCustomPrompt \} from '\.\.\/\.\.\/contentRequestSections\.js'/);
      expect(src, rel).toMatch(/mergeCustomPrompt\([^;]*unified-extra-request|unified-extra-request[\s\S]{0,400}mergeCustomPrompt/);
    }
  });
  it('단일 생성 화면은 개인 프롬프트가 있어도 요청사항을 합친다', async () => {
    const gen = await read('../renderer/modules/contentGeneration.ts');
    const reader = gen.slice(gen.indexOf('function readCustomPromptFromUi'), gen.indexOf('export function clearExtraRequestAfterGeneration'));
    expect(reader).toMatch(/if \(unified\) return mergeCustomPrompt\(unified, extraRequest\)/);
  });
  it('요청사항 칸이 URL 탭에서도 보이게 열린 탭으로 옮겨 단다', async () => {
    const html = await read('../../public/index.html');
    expect(html).toMatch(/id="extra-request-block"/);
    expect(html).toMatch(/id="extra-request-home"/);
    const ui = await read('../renderer/modules/tailUIUtils.ts');
    expect(ui).toMatch(/placeExtraRequestBlock\(tab\)/);
    expect(ui).toMatch(/getElementById\('generate-from-url-btn'\)/);
  });
});
