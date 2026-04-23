/**
 * [v1.8.1 LDF Phase 2 — L2 CTR Combat Layer]
 *
 * 홈판 메인 노출 + CTR 전투를 위한 훅·제목·썸네일 공식.
 * 원칙: "본문 최악이어도 썸네일·제목이 5% CTR 찍으면 홈판 감."
 *
 * 레이어 책임:
 *  1. 홈판 특화 훅 라이브러리 (카테고리 × 감정 패턴 매트릭스)
 *  2. 제목 골든존(28~35자) + 감정 강도 + 숫자 + 대비 점수
 *  3. 썸네일 4축 공식 (얼굴/숫자/대비색/감정표정) — 이미지 생성 프롬프트 가이드
 *  4. 카테고리별 CTR 벤치마크 (홈판 피드 경험값)
 *
 * 주의: 본 모듈은 "가이드"를 제공하며, 실제 A/B 결정은 contentGenerator의
 *       evaluateTitleQuality + selectTitleFormula와 결합되어 동작.
 */

export type CTRCategory =
  | 'food'         // 맛집·카페·요리
  | 'parenting'    // 육아·결혼·출산
  | 'beauty'       // 뷰티·패션·미용
  | 'health'       // 건강·다이어트
  | 'travel'       // 여행·국내외
  | 'tech'         // IT·가전·자동차
  | 'lifestyle'    // 일상·인테리어·홈데코
  | 'entertainment' // 영화·드라마·연예
  | 'finance'      // 재테크·경제
  | 'general';     // 기타

/**
 * 홈판 피드에서 실제로 "엄지 멈추는" 훅 패턴.
 * 카테고리 × 감정축(공감/반전/실용/충격) 4종 로테이션.
 * 각 훅은 도입부 1문장으로 쓰거나, 제목 훅으로 변환 가능.
 */
export const HOMEFEED_HOOKS: Record<CTRCategory, {
  empathy: string[];    // 공감형 — "저만 이런가요?"
  reversal: string[];   // 반전형 — "다들 틀렸더라구요"
  utility: string[];    // 실용형 — "3초 만에 끝"
  discovery: string[];  // 발견형 — "이거 진짜 몰랐네요"
}> = {
  food: {
    empathy: [
      '{kw} 좋아하시는 분들 손 들어주세요',
      '{kw} 먹고 싶을 때 이거 딱이에요',
      '주말에 {kw} 뭐 먹을지 고민되시죠?',
    ],
    reversal: [
      '{kw} 이렇게 먹으면 안 됐더라구요',
      '진짜 {kw} 맛집은 여기가 아니더라고요',
      '{kw} 이 방법이 정답이었음',
    ],
    utility: [
      '{kw} 가성비 TOP 3 정리',
      '{kw} 5분 안에 완성하는 법',
      '{kw} 딱 이것만 알면 됩니다',
    ],
    discovery: [
      '{kw} 이 집 진짜 대박이에요',
      '{kw} 이 조합 처음이라 충격',
      '{kw} 다녀왔는데 여기 진짜…',
    ],
  },
  parenting: {
    empathy: [
      '{kw} 고민 많으신 맘들께',
      '{kw} 저도 진짜 힘들었어요',
      '{kw} 시기 지나고 나니까 알겠더라고요',
    ],
    reversal: [
      '{kw} 남들 따라 하지 마세요',
      '{kw} 이게 정답이 아니더라구요',
      '{kw} 오히려 이렇게가 편해요',
    ],
    utility: [
      '{kw} 살림 꿀팁 5가지',
      '{kw} 현실 엄마 루틴 공유',
      '{kw} 이거 하나면 끝',
    ],
    discovery: [
      '{kw} 요즘 이거 유행이에요',
      '{kw} 진짜 이런 게 있을 줄',
      '{kw} 제가 써본 것 중 최고',
    ],
  },
  beauty: {
    empathy: [
      '{kw} 피부 고민 있으시면 꼭 보세요',
      '{kw} 저만의 루틴 공유해요',
      '{kw} 이런 고민 있으신가요?',
    ],
    reversal: [
      '{kw} 비싸다고 좋은 거 아니더라고요',
      '{kw} 이 제품이 반전이었음',
      '{kw} 생각과 달랐어요',
    ],
    utility: [
      '{kw} 5단계 루틴 정리',
      '{kw} 가성비 꿀템 BEST 3',
      '{kw} 한 달 써본 솔직 후기',
    ],
    discovery: [
      '{kw} 이거 진짜 인생템이에요',
      '{kw} 신상 써봤는데 대박',
      '{kw} 드디어 찾은 최애템',
    ],
  },
  health: {
    empathy: [
      '{kw} 저도 같은 고민이었어요',
      '{kw} 시작하기 전에 꼭 읽어주세요',
      '{kw} 이러면 안 된다는 걸 뒤늦게 알았네요',
    ],
    reversal: [
      '{kw} 이게 오히려 역효과라네요',
      '{kw} 진짜 방법은 따로 있었어요',
      '{kw} 3개월 해보고 깨달은 것',
    ],
    utility: [
      '{kw} 하루 10분 루틴',
      '{kw} 현실적으로 지킬 수 있는 5가지',
      '{kw} 초보 가이드 완전 정리',
    ],
    discovery: [
      '{kw} 이 방법이 효과 있을 줄이야',
      '{kw} -5kg 성공한 비결',
      '{kw} 이거 하니까 정말 달라져요',
    ],
  },
  travel: {
    empathy: [
      '{kw} 계획 세우시는 분들 참고하세요',
      '{kw} 가기 전에 알았으면 좋았을 것들',
      '{kw} 준비하면서 저도 막막했어요',
    ],
    reversal: [
      '{kw} 유명한 곳보다 여기가',
      '{kw} 가이드북엔 없는 진짜 코스',
      '{kw} 현지인만 아는 곳',
    ],
    utility: [
      '{kw} 2박3일 완벽 코스',
      '{kw} 체크리스트 총정리',
      '{kw} 꼭 가야 할 5곳',
    ],
    discovery: [
      '{kw} 다녀왔는데 여긴 꼭 가세요',
      '{kw} 인생 여행지 찾았어요',
      '{kw} 이런 곳이 있을 줄',
    ],
  },
  tech: {
    empathy: [
      '{kw} 구매 고민 중이신가요?',
      '{kw} 저도 망설였는데요',
      '{kw} 초보라 걱정이셨다면',
    ],
    reversal: [
      '{kw} 스펙보다 이게 중요하더라고요',
      '{kw} 비싼 모델이 정답은 아니었음',
      '{kw} 실사용은 이게 다르네요',
    ],
    utility: [
      '{kw} 구매 전 체크 5가지',
      '{kw} 한 달 써본 장단점',
      '{kw} 모델별 비교 정리',
    ],
    discovery: [
      '{kw} 신상 써봤는데 진짜',
      '{kw} 이 기능이 게임체인저',
      '{kw} 교체하길 잘했어요',
    ],
  },
  lifestyle: {
    empathy: [
      '{kw} 소소한 일상 공유해요',
      '{kw} 요즘 저는 이렇게 지내요',
      '{kw} 비슷한 고민 있으시죠?',
    ],
    reversal: [
      '{kw} 이렇게 바꾸니 달라지네요',
      '{kw} 남들 안 하는 방식이 정답',
      '{kw} 이게 진짜 답이었음',
    ],
    utility: [
      '{kw} 루틴 정리했어요',
      '{kw} 실전 꿀팁 5가지',
      '{kw} 이렇게 하면 편해요',
    ],
    discovery: [
      '{kw} 이거 써보니 진짜 좋아요',
      '{kw} 새로 시작했는데 만족',
      '{kw} 이런 게 있을 줄',
    ],
  },
  entertainment: {
    empathy: [
      '{kw} 본 분들 공감 백프로',
      '{kw} 저만 이렇게 느꼈나요?',
      '{kw} 팬이라면 꼭 읽어주세요',
    ],
    reversal: [
      '{kw} 다들 이 부분 놓쳤더라고요',
      '{kw} 진짜 반전은 이거',
      '{kw} 예상과 완전 다름',
    ],
    utility: [
      '{kw} 정리 & 해석',
      '{kw} 꼭 봐야 할 5가지',
      '{kw} 모르면 놓치는 포인트',
    ],
    discovery: [
      '{kw} 이거 진짜 명작이에요',
      '{kw} 올해 최고 인생작',
      '{kw} 몰랐는데 대박',
    ],
  },
  finance: {
    empathy: [
      '{kw} 저도 처음엔 막막했어요',
      '{kw} 초보이신 분들 참고하세요',
      '{kw} 고민 많으셨죠?',
    ],
    reversal: [
      '{kw} 이 방법이 오히려 위험',
      '{kw} 남들과 다르게 해야 하는 이유',
      '{kw} 정답은 따로 있었음',
    ],
    utility: [
      '{kw} 기초 가이드 정리',
      '{kw} 실전 체크리스트',
      '{kw} 5분 안에 이해하는 법',
    ],
    discovery: [
      '{kw} 이거 진짜 도움됐어요',
      '{kw} 알고 나니 달라진 것',
      '{kw} 처음 알았네요',
    ],
  },
  general: {
    empathy: ['{kw} 관련해서 고민 많으시죠?', '{kw} 경험 공유해요', '{kw} 같은 생각이신 분들'],
    reversal: ['{kw} 의외로 이게 정답', '{kw} 생각과 달랐어요', '{kw} 다들 틀렸더라고요'],
    utility: ['{kw} 실전 정리', '{kw} 꿀팁 5가지', '{kw} 이것만 알면 됩니다'],
    discovery: ['{kw} 진짜 대박이에요', '{kw} 몰랐던 사실', '{kw} 새로 알게 된 것'],
  },
};

/**
 * 카테고리 힌트 → CTRCategory 매핑
 */
export function resolveCTRCategory(hint?: string): CTRCategory {
  if (!hint) return 'general';
  const c = hint.toLowerCase();
  if (/맛집|카페|음식|요리|레시피|디저트|브런치/.test(c)) return 'food';
  if (/육아|결혼|출산|임신|아이|유아|엄마|맘|웨딩|신혼/.test(c)) return 'parenting';
  if (/뷰티|패션|미용|화장품|옷|스타일|메이크업|스킨케어/.test(c)) return 'beauty';
  if (/건강|다이어트|의학|운동|헬스|영양/.test(c)) return 'health';
  if (/여행|국내|해외|제주|부산|유럽|일본|동남아|강원/.test(c)) return 'travel';
  if (/IT|컴퓨터|노트북|스마트폰|테크|자동차|가전|디지털/.test(c)) return 'tech';
  if (/일상|인테리어|리빙|홈|DIY|가구|인스타|홈데코/.test(c)) return 'lifestyle';
  if (/영화|드라마|연예|스타|음악|웹툰|예능|방송/.test(c)) return 'entertainment';
  if (/재테크|경제|투자|주식|부동산|금융|창업/.test(c)) return 'finance';
  return 'general';
}

/**
 * [v1.8.1] 홈판 훅 프롬프트 블록 생성
 * - buildFullPrompt에서 homefeed 모드일 때 주입
 * - 카테고리별 4종 훅 × 3개씩 = 12개 예시 노출
 * - LLM이 직접 복사 금지, "이런 결의 훅을 만들라" 참조용
 */
export function buildHomefeedHookGuide(categoryHint?: string, primaryKeyword?: string): string {
  const cat = resolveCTRCategory(categoryHint);
  const hooks = HOMEFEED_HOOKS[cat];
  const kw = primaryKeyword || '{주제}';

  const renderPack = (label: string, list: string[]) =>
    `  ${label}: ${list.map(h => `"${h.replace(/\{kw\}/g, kw)}"`).join(' / ')}`;

  return `
═══════════════════════════════════════════════════════════
[HOMEFEED HOOK LIBRARY — ${cat.toUpperCase()}]
홈판 피드에서 "엄지 멈추는" 훅 4종 (참조용, 직접 복사 금지).
도입부 1문장 또는 제목 훅으로 변주해서 사용.
───────────────────────────────────────────────────────────
${renderPack('🫂 공감형', hooks.empathy)}
${renderPack('🔄 반전형', hooks.reversal)}
${renderPack('🛠️ 실용형', hooks.utility)}
${renderPack('💡 발견형', hooks.discovery)}

■ 선택 가이드:
  - 도입부는 공감형 또는 발견형으로 시작 (피드에서 즉시 감정 유발)
  - 제목은 공감+실용 또는 반전+발견 조합이 CTR 높음
  - 같은 결 훅을 3글 연속 쓰지 말 것 (피드 중복 감지)

■ 제목 골든존 규칙 (홈판 메인 노출 조건):
  - 28~35자 (피드에서 잘리지 않는 한계)
  - 숫자 1개 이상 포함 ("3가지", "5분", "TOP 10")
  - 감정어 1개 이상 ("진짜", "대박 아닌 표현으로 놀라움", "드디어")
  - 뻔한 AI 훅 금지 (충격/경악/소름/폭로)
═══════════════════════════════════════════════════════════
`;
}

/**
 * [v1.8.1] 썸네일 4축 공식 — 이미지 생성 프롬프트 보강용
 * 1. 얼굴 (사람/캐릭터 얼굴 존재 여부) 40점
 * 2. 숫자 (큰 숫자 텍스트) 30점
 * 3. 대비색 (고채도 대비) 15점
 * 4. 감정 표정 (놀람/기쁨/당황) 15점
 *
 * 총점 70 이상을 목표로 프롬프트 구성
 */
export function buildThumbnailFormula(categoryHint?: string): string {
  const cat = resolveCTRCategory(categoryHint);

  const categoryHint2: Record<CTRCategory, string> = {
    food: '음식 클로즈업 + 손 또는 사람 일부 등장',
    parenting: '엄마와 아이 또는 생활감 있는 장면',
    beauty: '얼굴 클로즈업 또는 제품+피부 대비',
    health: '운동하는 사람 실루엣 또는 비포/애프터',
    travel: '풍경 + 인물 뒷모습 (여행 감정 전달)',
    tech: '제품 + 손 또는 사용 장면',
    lifestyle: '일상 공간 + 사람의 손 또는 일부',
    entertainment: '주요 인물 얼굴 감정 표정',
    finance: '손 + 서류/노트북 클로즈업 또는 통계 그래프',
    general: '감정 있는 사람 얼굴 또는 상징 객체',
  };

  return `
[THUMBNAIL FORMULA — CTR 4축 목표 70점+]
  ① 얼굴(40점): ${categoryHint2[cat]}
  ② 숫자(30점): 큰 숫자 텍스트 오버레이 가능 영역 확보 (예: "3", "5분", "₩0")
  ③ 대비색(15점): 배경과 주요 객체 채도 대비 강하게 (보색/원색)
  ④ 감정 표정(15점): 놀람·기쁨·당황·감탄 중 하나 드러나게
  ⛔ 금지: 텍스트 과다 삽입 (네이버 홈판은 텍스트 많은 썸네일 필터링), 흑백 일관, 심심한 프레임
`;
}

/**
 * [v1.8.1] 카테고리별 홈판 CTR 벤치마크 (경험값, 단위 %)
 * 피드 노출 대비 클릭률 평균 — 자가 측정 비교용
 */
export const CTR_BENCHMARKS: Record<CTRCategory, { avg: number; top10: number }> = {
  food: { avg: 3.8, top10: 7.5 },
  parenting: { avg: 4.2, top10: 8.1 },
  beauty: { avg: 4.0, top10: 7.8 },
  health: { avg: 3.5, top10: 7.0 },
  travel: { avg: 3.3, top10: 6.5 },
  tech: { avg: 2.9, top10: 5.8 },
  lifestyle: { avg: 3.2, top10: 6.2 },
  entertainment: { avg: 4.5, top10: 8.5 },
  finance: { avg: 2.5, top10: 5.0 },
  general: { avg: 3.0, top10: 6.0 },
};

/**
 * [v1.8.1] 제목 CTR 예측 점수 (홈판 특화, 0-100)
 * 내부 휴리스틱 — 외부 API 호출 없이 즉시 채점
 */
export function scoreTitleForHomefeed(title: string, categoryHint?: string): {
  score: number;
  breakdown: Record<string, number>;
  suggestions: string[];
} {
  const t = title.trim();
  const breakdown: Record<string, number> = {};
  const suggestions: string[] = [];

  // 1. 길이 골든존 (28~35자)
  const len = t.length;
  if (len >= 28 && len <= 35) {
    breakdown['길이 골든존'] = 25;
  } else if (len >= 24 && len <= 40) {
    breakdown['길이 근접'] = 15;
  } else if (len < 24) {
    breakdown['길이 부족'] = 5;
    suggestions.push(`제목이 ${len}자로 짧음 — 28~35자 권장 (홈판 피드에서 눈길 덜 끌림)`);
  } else {
    breakdown['길이 초과'] = 3;
    suggestions.push(`제목이 ${len}자로 길음 — 잘릴 위험`);
  }

  // 2. 숫자 포함
  if (/\d/.test(t)) {
    breakdown['숫자 포함'] = 15;
  } else {
    suggestions.push('숫자 1개 포함 권장 ("3가지", "5분", "TOP 10")');
  }

  // 3. 감정어 강도 (과장 금지)
  const emotionalWords = ['진짜', '드디어', '솔직히', '의외로', '생각보다', '처음', '인생', '최고'];
  const emoMatches = emotionalWords.filter(w => t.includes(w));
  if (emoMatches.length >= 1 && emoMatches.length <= 2) {
    breakdown['감정어 적정'] = 15;
  } else if (emoMatches.length > 2) {
    breakdown['감정어 과잉'] = 5;
    suggestions.push('감정어 2개 이하 권장 (과잉은 AI티)');
  } else {
    suggestions.push('감정어 1개 추가 권장');
  }

  // 4. AI 뻔한 표현 감지 (강력 감점)
  const aiCliche = ['충격', '경악', '소름', '폭로', '반전 주의', '실화', '대박', '난리', '공개', '이럴 수가'];
  const cliHits = aiCliche.filter(w => t.includes(w));
  if (cliHits.length === 0) {
    breakdown['AI 클리셰 없음'] = 20;
  } else {
    breakdown['AI 클리셰 감점'] = -10 * cliHits.length;
    suggestions.push(`AI 뻔한 표현 감지: ${cliHits.join(', ')} — 제거 필수`);
  }

  // 5. 호기심·의문 (괄호·? 또는 암시)
  if (/[?]|이유|비밀|방법|차이|어떻게|왜/.test(t)) {
    breakdown['호기심 유발'] = 10;
  }

  // 6. 카테고리 키워드 포함 (CTR 앵커)
  const cat = resolveCTRCategory(categoryHint);
  const catKeywords: Record<CTRCategory, string[]> = {
    food: ['맛집', '후기', '메뉴', '추천'],
    parenting: ['육아', '살림', '꿀팁', '노하우'],
    beauty: ['후기', '루틴', '추천', '꿀템'],
    health: ['효과', '후기', '루틴', '가이드'],
    travel: ['여행', '코스', '후기', '추천'],
    tech: ['후기', '비교', '리뷰', '추천'],
    lifestyle: ['일상', '루틴', '공유', '꿀팁'],
    entertainment: ['후기', '정리', '분석', '감상'],
    finance: ['정리', '가이드', '방법', '초보'],
    general: ['후기', '공유', '정리'],
  };
  const catHits = catKeywords[cat].filter(k => t.includes(k));
  if (catHits.length >= 1) {
    breakdown['카테고리 앵커'] = 10;
  } else {
    suggestions.push(`카테고리 앵커 키워드 포함 권장: ${catKeywords[cat].slice(0, 3).join(', ')}`);
  }

  // 7. 구체성 (고유명사·지명·브랜드)
  if (/\d{4}년|[가-힣]{2,4}(동|구|시|역|점)|[A-Z][a-zA-Z]+/.test(t)) {
    breakdown['구체성'] = 5;
  }

  const total = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  return { score: total, breakdown, suggestions };
}
