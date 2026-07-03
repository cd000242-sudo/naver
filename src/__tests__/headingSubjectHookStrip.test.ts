/**
 * headingSubjectHookStrip.test.ts
 *
 * 소제목 앞에 붙는 "{화제 인물}까지 " 매달린 낚시 훅 제거 검증.
 * 원인: homefeed "모든 H2에 실명 강제" 프롬프트가 단일 인물 글에서 모델을 이름 훅 남발로 유도.
 * 실측 버그(박지성 K-축구 글)를 잠그고, 통합형 "까지"(맛집 "김치찌개까지 맛있는") 오탐을 .not으로 방지.
 */
import { describe, it, expect } from 'vitest';
import { stripLeadingSubjectHookFromHeadings } from '../contentTitlePrefixHelpers';

function run(headings: string[], selectedTitle: string, personCentric: boolean): string[] {
  const content: any = { selectedTitle, headings: headings.map((t) => ({ title: t, content: '' })) };
  stripLeadingSubjectHookFromHeadings(content, personCentric);
  return content.headings.map((h: any) => h.title);
}

describe('소제목 "{화제 인물}까지 " 매달린 훅 제거', () => {
  it('(a) 즉시 반복("박지성까지 박지성...")은 컨텍스트 무관하게 제거한다', () => {
    expect(run(['박지성까지 박지성 공동위원장, 한국 축구 변화에 던진 첫 메시지는?'], '박지성이 K-축구 혁신위 공동위원장', false))
      .toEqual(['박지성 공동위원장, 한국 축구 변화에 던진 첫 메시지는?']);
  });

  it('(b) 제목 주어 매달림 훅은 인물 중심 글(personCentric)에서 제거한다', () => {
    expect(run(['박지성까지 팬들이 꼽은 한국 축구 고질병, 이번엔 정말 해결될 수 있을까요?'], '박지성 K-축구 혁신위', true))
      .toEqual(['팬들이 꼽은 한국 축구 고질병, 이번엔 정말 해결될 수 있을까요?']);
  });

  it('(b) 비인물 글(personCentric=false)에서는 통합형 "{대상}까지"를 보존한다 (오탐 방지)', () => {
    expect(run(['김치찌개까지 맛있는 강남 맛집'], '김치찌개 강남 맛집 후기', false))
      .toEqual(['김치찌개까지 맛있는 강남 맛집']);
  });

  it('까지 접두 없는 정상 소제목은 불변', () => {
    expect(run(['박지성 혁신위, 기대만큼 우려도 큰 이유 3가지'], '박지성 혁신위', true))
      .toEqual(['박지성 혁신위, 기대만큼 우려도 큰 이유 3가지']);
  });

  it('통합형/말미 까지는 보존한다 (환불 직전까지 / 반응까지)', () => {
    expect(run(
      ['환불 직전까지 갔던 한 줄', '손흥민 부상 복귀 그 후 경기력 변화, 동료 반응까지'],
      '환불 후기', true,
    )).toEqual(['환불 직전까지 갔던 한 줄', '손흥민 부상 복귀 그 후 경기력 변화, 동료 반응까지']);
  });
});
