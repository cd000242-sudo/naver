/**
 * [v2.3.0 Starter Kit Phase 2 — Ad Placement Strategy]
 *
 * 본문 내 광고 위치 최적화. 애드포스트 자동 광고는 본문 구조에 따라 위치 결정됨.
 * 핵심: 본문 중간 광고(스크롤 50% 지점)가 CTR·CPM 둘 다 최고.
 */

export interface AdSlot {
  position: 'top' | 'middle' | 'middle-deep' | 'bottom';
  scrollDepthPct: number;     // 화면 스크롤 깊이 (%)
  expectedCTR: number;         // 예상 클릭률 (%)
  cpmWeight: number;           // 해당 위치 CPM 가중치 (1.0 = 기준)
  reasoning: string;
}

export const AD_SLOT_PROFILE: AdSlot[] = [
  { position: 'top', scrollDepthPct: 10, expectedCTR: 0.3, cpmWeight: 0.8, reasoning: '첫인상 광고 — 독자 즉시 이탈 위험, CTR 낮음' },
  { position: 'middle', scrollDepthPct: 40, expectedCTR: 0.8, cpmWeight: 1.3, reasoning: '본문 몰입 구간 — CTR·CPM 최고' },
  { position: 'middle-deep', scrollDepthPct: 65, expectedCTR: 0.7, cpmWeight: 1.2, reasoning: '관심 지속 독자 — 전환 의도 높음' },
  { position: 'bottom', scrollDepthPct: 90, expectedCTR: 0.4, cpmWeight: 0.9, reasoning: '완독 독자 — 전환 의도 있으나 규모 작음' },
];

export interface PlacementGuide {
  h2HeadingCount: number;         // 권장 H2 개수
  imageInsertPositions: number[]; // 이미지 삽입 소제목 인덱스 (0-based)
  adGapGuideline: string;         // 광고 간 최소 간격
  structureTemplate: string;
  tips: string[];
}

/**
 * [v2.3.0] 본문 구조 가이드 — 애드포스트 자동 광고 최적 배치를 위한 설계
 */
export function getPlacementGuide(targetLength: number): PlacementGuide {
  // 본문 길이별 권장 구조
  let h2Count: number;
  if (targetLength >= 2500) h2Count = 6;
  else if (targetLength >= 2000) h2Count = 5;
  else if (targetLength >= 1500) h2Count = 4;
  else h2Count = 3;

  // 이미지 삽입 위치 — 소제목 앞에 배치 (애드포스트가 이미지 주변에 광고 삽입 선호)
  const imageInsertPositions: number[] = [];
  for (let i = 0; i < h2Count; i++) {
    if (i === 0 || i === Math.floor(h2Count / 2) || i === h2Count - 1) {
      imageInsertPositions.push(i);
    }
  }

  return {
    h2HeadingCount: h2Count,
    imageInsertPositions,
    adGapGuideline: '광고 간 최소 400자 간격 유지 (너무 가까우면 애드포스트가 1개만 노출)',
    structureTemplate: `도입(200~300자) → H2-1 + 이미지 → H2-2 → H2-${Math.floor(h2Count / 2)} + 이미지 → ... → H2-${h2Count} + 이미지 → 마무리(150~200자)`,
    tips: [
      '본문 중간(40% 지점)에 가장 중요한 소제목 배치 → CPM 최고 광고 슬롯 확보',
      '이미지는 H2 제목 직후 삽입 (광고 자동 삽입 알고리즘이 이미지 다음 구간 선호)',
      '소제목당 3~5문장 유지 (너무 짧으면 광고 삽입 안 됨)',
      '리스트(•, -, 번호)는 광고 간섭 → 꼭 필요한 곳만',
      '본문 중간에 인용구·강조박스 배치 → 체류시간 증가 → CPM 상승',
    ],
  };
}

/**
 * [v2.3.0] 본문 HTML/Markdown에서 예상 광고 슬롯 위치 예측
 */
export function predictAdSlots(content: string): {
  predictedSlots: { depth: number; type: AdSlot['position'] }[];
  density: 'sparse' | 'optimal' | 'dense';
  advice: string;
} {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const totalLength = content.length;
  const predictedSlots: { depth: number; type: AdSlot['position'] }[] = [];

  // 대략적 광고 삽입 지점 예측 (애드포스트는 ~400자 단위로 슬롯 계산)
  let cumulativeLength = 0;
  for (const p of paragraphs) {
    cumulativeLength += p.length + 2; // +2 for \n\n
    const depthPct = (cumulativeLength / totalLength) * 100;
    if (cumulativeLength > 400 && cumulativeLength % 600 < p.length) {
      // 400자 경계에서 광고 슬롯 예상
      let type: AdSlot['position'];
      if (depthPct < 20) type = 'top';
      else if (depthPct < 55) type = 'middle';
      else if (depthPct < 80) type = 'middle-deep';
      else type = 'bottom';
      predictedSlots.push({ depth: Math.round(depthPct), type });
    }
  }

  let density: 'sparse' | 'optimal' | 'dense';
  if (predictedSlots.length < 2) density = 'sparse';
  else if (predictedSlots.length <= 4) density = 'optimal';
  else density = 'dense';

  let advice: string;
  if (density === 'sparse') {
    advice = '광고 슬롯 부족 — 본문 길이 늘리거나 문단 분리 권장';
  } else if (density === 'dense') {
    advice = '광고 과밀 — 문단 통합해서 광고 간격 벌리기 권장';
  } else {
    advice = '광고 밀도 최적 — 현재 구조 유지';
  }

  return { predictedSlots, density, advice };
}
