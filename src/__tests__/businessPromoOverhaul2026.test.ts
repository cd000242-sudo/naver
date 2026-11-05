import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import { buildBusinessInfoBlock } from '../content/businessInfoPromptBlock';
import {
  excludedBusinessAngleIds,
  resolveBusinessIndustry,
} from '../content/businessIndustryDetector';
import { buildEvidenceAndIntentFinalContract } from '../content/evidenceIntegrity';
import { buildSituationTitleContract } from '../content/situationTitleContract';
import { resolveHashtagCountRange } from '../content/hashtagCountPolicy';
import { BUSINESS_PROMO_ANGLES, pickNextBusinessAngle } from '../renderer/modules/businessAngleRotation';
import { buildBusinessAngleDirective } from '../promptLoader';
import { buildModeBasedPrompt } from '../contentGenerator';
import type { ContentSource } from '../contentGenerator';

vi.mock('../naverSearchApi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../naverSearchApi.js')>();
  return {
    ...actual,
    searchBlog: vi.fn(async () => ({ items: [{ title: '다른 업체 블로그', description: '타업체 홍보글', postdate: '20261101' }] })),
    searchNews: vi.fn(async () => ({ items: [] })),
    searchKin: vi.fn(async () => ({ items: [{ title: '고깃집 예약 어떻게 하나요', description: '단체 예약 문의' }] })),
    searchWebDoc: vi.fn(async () => ({ items: [] })),
  };
});

const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8').replace(/\r/g, '');
const PROHIBIT = /금지|않는다|마라|말고|말 것|만들지/g;

describe('base.prompt — [FLOOR] · [NEXT STEP] · [SEARCH]', () => {
  const prompt = read('src', 'prompts', 'business', 'base.prompt');

  it('[FLOOR] 4항목: 직답 질문 3개 · 3단계 진행 · 맞는/다른 선택 · 입력 칸 사용', () => {
    expect(prompt).toContain('[FLOOR]');
    expect(prompt).toContain('고객 질문 3개 이상에 각각 첫 문장에서 직접 답한다');
    expect(prompt).toContain('업체 정보의 \'자주 묻는 것\' → 지식iN 질문 자료 → 서브 키워드');
    expect(prompt).toContain('"무엇에 따라 달라지는지"와 "문의할 때 무엇을 물으면 되는지"');
    expect(prompt).toContain('3단계 이상으로 쓴다');
    expect(prompt).toContain('이 서비스가 맞는 경우 1개와 다른 선택이 나은 경우 1개');
    expect(prompt).toContain("'입력 안 됨'으로 표시된 칸은 마지막 소제목");
    expect(prompt).toContain('접수 → 문진 → 검사 → 설명');
    expect(prompt).toContain('이런 증상이면 다른 진료과를 먼저');
  });

  it('[CTA] 는 [NEXT STEP] 으로, 검색 노출은 [SEARCH] 로 대체됐다', () => {
    expect(prompt).not.toContain('[CTA]');
    expect(prompt).not.toContain('[TITLE]');
    expect(prompt).toContain('[NEXT STEP]');
    expect(prompt).toContain('채널이 둘 이상이면 어떤 경우에 어느 채널이 맞는지');
    expect(prompt).toContain('먼저 말하면 좋은 것 2~3개');
    expect(prompt).toContain('[SEARCH]');
    expect(prompt).toContain('28~42자');
    expect(prompt).toContain('해시태그는 8~12개');
  });

  it('PASTOR 이름은 유지하고 역할을 재정의한다', () => {
    expect(prompt).toContain('PASTOR');
    expect(prompt).toContain('질문 → 답과 갈리는 조건 → 진행 방식 → 맞는/다른 선택 → 다음 행동');
  });

  it('금지·부정 표현 수가 32 를 넘지 않는다 (중복 정리)', () => {
    expect((prompt.match(PROHIBIT) || []).length).toBeLessThanOrEqual(32);
    expect((prompt.match(/총 3~6회/g) || []).length).toBe(1);
  });
});

describe('업체 정보 블록', () => {
  const regional = { name: '불꽃고깃집', phone: '051-111-2222', serviceArea: 'regional', region: '부산, 울산', industry: '고깃집' };

  it('고깃집 업종이면 지역 예시에 인테리어가 없고, 빈칸 목록과 홈페이지를 낸다', () => {
    const block = buildBusinessInfoBlock({ ...regional, researchUrl: 'https://bulggot.example/menu' });
    expect(block).toContain('(예: "부산 고깃집")');
    expect(block).not.toContain('인테리어');
    expect(block).toContain('🔗 홈페이지: https://bulggot.example/menu');
    expect(block).toMatch(/📭 입력 안 됨: .*주소.*영업시간.*→ 지어내지 말고 마지막 소제목 '문의 시 확인'으로만/);
    expect(block).not.toMatch(/입력 안 됨: .*홈페이지/);
  });

  it('주인공은 업체다 · 전환 설득 · 믿을 수 있는 판매처 프레임이 없고 질문 중심이다', () => {
    const own = buildBusinessInfoBlock(regional);
    const product = buildBusinessInfoBlock({ ...regional, promoTarget: 'product' });
    for (const block of [own, product]) {
      expect(block).not.toContain('주인공은 업체다');
      expect(block).not.toContain('전환 설득');
      expect(block).not.toContain('믿을 수 있는 판매처');
    }
    expect(own).toContain('글의 중심은 문의를 망설이는 고객의 질문이고, 업체는 그 질문에 입력된 사실로 답하는 쪽이다');
    expect(own).toContain('고객 질문 → 답과 갈리는 조건 → 진행 방식 → 맞는 경우/다른 선택이 나은 경우 → 다음 행동');
  });

  it('업종 칸이 없으면 메인 키워드에서 지역을 뺀 말을 예시로 쓴다', () => {
    const block = buildBusinessInfoBlock({ ...regional, industry: undefined }, { primaryKeyword: '부산 이사업체' });
    expect(block).toContain('(예: "부산 이사업체")');
  });

  it('블로그 주인과 업종에 따라 글 시점 줄이 갈린다', () => {
    expect(buildBusinessInfoBlock({ ...regional, blogOwner: 'agency' })).toMatch(/대행 블로그 — 운영자 시점\("저희", "제가"\) 금지/);
    expect(buildBusinessInfoBlock({ ...regional, blogOwner: 'owner' })).toContain('운영자 시점 허용');
    expect(buildBusinessInfoBlock({ ...regional, industry: '치과' })).toContain('정보 안내형 고정');
  });

  it('자주 묻는 것 · 진행 방식은 그대로 실린다', () => {
    const block = buildBusinessInfoBlock({ ...regional, faq: '예약 없이 가도 되나요? 평일 가능\n주차 2시간' });
    expect(block).toContain('❓ 손님이 자주 묻는 것 · 실제 진행 방식');
    expect(block).toContain('   주차 2시간');
  });

  it('전국구는 지역명을 다시 쓰라는 줄 없이 업종 + 세부 서비스를 앞에 둔다', () => {
    const block = buildBusinessInfoBlock({ name: '한국앱', serviceArea: 'nationwide', industry: '프로그램' });
    expect(block).toContain('특정 지역명 강제 삽입 금지');
    expect(block).not.toContain('제목 맨 앞에 위 지역명');
    expect(block).toContain("제목은 '업종 + 세부 서비스'를 앞에 둔다");
  });

  it('buildModeBasedPrompt 가 새 블록을 실제로 싣는다', () => {
    const source = {
      sourceType: 'custom_text', rawText: '부산 고깃집 예약과 주차 안내', title: '부산 고깃집', contentMode: 'business',
      toneStyle: 'professional', metadata: { keywords: ['부산 고깃집'] } as any,
      businessInfo: { ...regional, serviceArea: 'regional' as const },
    } as ContentSource;
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('📭 입력 안 됨');
    expect(prompt).toContain('🏷️ 업종: 고깃집');
  });
});

describe('업종 · 각도 필터', () => {
  it('업종 칸이 우선이고 음식점 · 시술명 단어가 보강됐다', () => {
    expect(resolveBusinessIndustry('고깃집')).toBe('local');
    expect(resolveBusinessIndustry('베이커리')).toBe('local');
    expect(resolveBusinessIndustry('임플란트')).toBe('medical');
    expect(resolveBusinessIndustry('고깃집', '○○인테리어 시공 사례')).toBe('local');
    expect(resolveBusinessIndustry('', '○○인테리어 시공 사례')).toBe('construction');
    expect(resolveBusinessIndustry('', '')).toBeNull();
  });

  it('의료 = 사례 · 혜택 · 가격 · A/S 제외, 자격사 = 사례 · 혜택 제외, 매장 = A/S 제외', () => {
    expect([...excludedBusinessAngleIds('medical')].sort()).toEqual(['benefit', 'case', 'price', 'warranty']);
    expect([...excludedBusinessAngleIds('professional')].sort()).toEqual(['benefit', 'case']);
    expect([...excludedBusinessAngleIds('local')]).toEqual(['warranty']);
    for (const industry of ['medical', 'professional', 'local'] as const) {
      const excluded = excludedBusinessAngleIds(industry);
      const history: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        const id = pickNextBusinessAngle(history, excluded).id;
        expect(excluded).not.toContain(id);
        history.push(id);
      }
    }
  });

  it('모든 각도 지시문이 "입력에 있을 때만" 게이트를 가진다', () => {
    for (const angle of BUSINESS_PROMO_ANGLES) expect(angle.directive).toContain('입력에 있을 때만');
  });

  it('랜덤 각도도 의료에서는 가격 · 사례 · A/S · 혜택 프레임을 쓰지 않는다', () => {
    for (let i = 0; i < 80; i += 1) {
      const directive = buildBusinessAngleDirective('medical');
      for (const banned of ['가격 투명성', '사례 근거', 'A/S 안내', '상담 장벽 낮추기']) {
        expect(directive).not.toContain(`■ 강조 사인: ${banned}`);
      }
    }
  });
});

describe('최종 계약 · 제목 · 해시태그', () => {
  it('evidenceIntegrity 업체 분기: 전환보다 정확성 → 정보와 문의 안내는 충돌하지 않는다', () => {
    const base = buildEvidenceAndIntentFinalContract({}, 'business');
    expect(base).not.toContain('전환 문구보다 정보 정확성');
    expect(base).toContain('정확한 정보와 문의 안내는 충돌하지 않는다');
    expect(base).not.toContain('운영자 시점');
    const owner = buildEvidenceAndIntentFinalContract({}, 'business', { operatorVoice: true });
    expect(owner).toContain('운영자 시점');
    expect(owner).toContain('손님 체험·후기는 만들지 않는다');
  });

  it('제목 계약: 전국구는 지역명 요구가 없고 길이는 28~42 로 통일', () => {
    const nationwide = buildSituationTitleContract('business', { businessInfo: { serviceArea: 'nationwide' } });
    const regional = buildSituationTitleContract('business', { businessInfo: { serviceArea: 'regional' } });
    expect(nationwide).not.toContain('입력된 지역명과 업종');
    expect(nationwide).toContain('업종·세부 서비스 축');
    expect(regional).toContain('지역·업종 축');
    expect(regional).toContain('28~42자');
    expect(regional).not.toContain('25~45자');
  });

  it('업체 해시태그는 8~12개', () => {
    expect(resolveHashtagCountRange('business')).toMatchObject({ min: 8, max: 12 });
    expect(read('src', 'prompts', 'shared', 'hashtag-strategy.prompt')).toContain('업체 홍보: 8~12개');
  });

  it('죽은 업체 제목 프롬프트에서 날조 유도 예시가 빠졌다', () => {
    const title = read('src', 'prompts', 'title', 'business', 'base.prompt');
    for (const risky of ['재방문율 85%', '시공 1,200건', '20년차 전문가', '평점("4.9점")']) expect(title).not.toContain(risky);
  });
});

describe('화면 · 경로 · 재료 배선', () => {
  it('업체 정보 창: 새 칸 3개, "8~12회" 문구 제거, 특징 예시 일반화', () => {
    const html = read('public', 'index.html');
    for (const id of ['bgm-industry', 'bgm-faq', 'bgm-blog-owner-owner', 'bgm-blog-owner-agency']) expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain('8~12회');
    expect(html).toContain('예: 대표 메뉴 · 가격, 예약 방법, 주차, 휴무일, 경력 (적은 것만 글에 씁니다)');
    const renderer = read('src', 'renderer', 'renderer.ts');
    expect(renderer).toMatch(/industry: get\('bgm-industry'\)/);
    expect(renderer).toMatch(/faq: get\('bgm-faq'\)/);
    expect(renderer).toContain("blogOwner: (document.getElementById('bgm-blog-owner-agency')");
    expect(renderer).toContain("getElementById('bgm-industry')");
  });

  it('풀오토: 경험 메모 · 업종 필터 로테이션 · 대행이면 공정위 기본 켬', () => {
    const src = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    expect(src).toContain("window.rotateBusinessAngle(businessInfo.name || '', businessInfo, cleanedKeywords)");
    expect(src).toMatch(/personalExperience: formData\.contentMode === 'business'/);
    expect(src).toContain("window._businessInfo?.blogOwner === 'agency'");
    expect(src).toContain('mode-default-agency-business');
  });

  it('반자동 · 연속 · 다계정: 로테이션 + 리서치 URL', () => {
    const gen = read('src', 'renderer', 'modules', 'contentGeneration.ts');
    expect((gen.match(/withBusinessAngle\(collectBusinessInfo\(contentMode\), keywordList\)/g) || []).length).toBe(2);
    expect(gen).toContain("rssUrl: contentMode === 'business'");
    const multi = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    expect(multi).toContain('window.rotateBusinessAngle?.(_maBizInfo.name');
    expect(multi).toContain('contentPayload.assembly.rssUrl = [_maResearchUrl]');
    expect(multi).toContain("queueItem.businessInfo?.blogOwner === 'agency'");
  });

  it('각도 로테이션이 업종 판정 파일을 번들에 등록한다', () => {
    expect(read('scripts', 'copy-static.mjs')).toContain("label: 'content/businessIndustryDetector.js'");
  });

  it('재료: 업체 모드는 상위 블로그 본문을 수집하지 않는다 (4홉 전달)', async () => {
    const assembler = read('src', 'sourceAssembler.ts');
    expect((assembler.match(/const .*\? EMPTY_FULL_TEXTS : await collectTopArticleFullTexts\(/g) || []).length).toBe(3);
    expect(assembler).toContain("(input as any).contentMode === 'business'");
    expect(assembler).toContain('options.skipBlogBodies === true');
    expect(read('src', 'renderer', 'modules', 'contentGeneration.ts')).toContain("crawlOptions.skipBlogBodies = true");
    expect(read('src', 'main', 'ipc', 'miscHandlers.ts')).toContain('skipBlogBodies: options?.skipBlogBodies === true');
    expect(read('src', 'content', 'generationSourceBuilder.ts')).toContain('skipBlogBodies: options.skipBlogBodies === true');
    expect(read('src', 'main.ts')).toContain("skipBlogs: (payload.assembly as any).contentMode === 'business'");

    const api = await import('../naverSearchApi.js');
    const { validateFactCheckSource } = await import('../naverFactCheckRAG');
    vi.mocked(api.searchBlog).mockClear();
    vi.mocked(api.searchKin).mockClear();
    const skipped = await validateFactCheckSource('부산 고깃집', { skipBlogs: true });
    expect(api.searchBlog).not.toHaveBeenCalled();
    expect(api.searchKin).toHaveBeenCalled();
    expect(skipped.reason).not.toContain('키워드 비어있음');
  });
});
