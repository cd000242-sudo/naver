/**
 * [Phase 3-7/v2.10.145] contentGenerator god file decomposition — title formula patterns.
 *
 * Pure data tables (no runtime state). External consumers: ctrCombat.ts (comment only),
 * contentGenerator.ts internal selectTitleFormula function.
 */

// ✅ [2026-02-09 v3] 제목 공식 패턴 로테이션 시스템 — 카테고리 인식 + 확장
export interface TitleFormula {
  id: string;
  name: string;
  instruction: string;
  example: string;
}

export const SEO_TITLE_FORMULAS: TitleFormula[] = [
  {
    id: 'question', name: '질문형',
    instruction: '독자에게 직접 질문하며 궁금증을 유발. 답을 알고 싶게 만들 것.',
    example: '전세보증금 반환보증, 가입 안 하면 어떻게 되는지 알고 있나요?'
  },
  {
    id: 'first_person', name: '1인칭 경험형',
    instruction: '직접 경험한 것처럼 솔직하게 작성. "~해봤더니", "~써보니" 활용.',
    example: '청년도약계좌 6개월 넣어보니, 솔직히 이건 꼭 해야 합니다'
  },
  {
    id: 'concrete_result', name: '구체적 결과형',
    instruction: '숫자와 기간으로 구체적 결과를 먼저 제시. 신뢰감 있게.',
    example: '부업 시작 3개월, 월 50만원 추가 수입 만든 현실적 방법'
  },
  {
    id: 'comparison', name: '비교·발견형',
    instruction: '의외의 차이점 또는 몰랐던 사실을 부각. "몰랐다", "차이" 활용.',
    example: '적금 vs 예금, 같은 5%인데 이자가 이렇게 다를 줄 몰랐다'
  },
  {
    id: 'loss_aversion', name: '손실회피형',
    instruction: '독자가 놓치면 아쉽다고 느끼게 작성. 구체적 금액/기회를 명시. 단, "손해"라는 단어 직접 사용 자제.',
    example: '자동차세 연납, 1월 안에 안 하면 4.57% 할인 사라진다'
  },
  // ✅ [v3] 신규 3개 추가
  {
    id: 'warning', name: '경고·주의형',
    instruction: '하지 말아야 할 행동/실수를 경고. "절대 하지 마세요", "이것만은 피하세요" 활용.',
    example: '전세사기 피하려면, 계약 전 이 3가지 절대 하지 마세요'
  },
  {
    id: 'timeline', name: '타임라인형',
    instruction: '시간 순서/기한이 있는 정보를 강조. 긴급성 부여.',
    example: '2026년 3월까지 신청해야 받는 정부지원금 5가지'
  },
  {
    id: 'checklist', name: '체크리스트형',
    instruction: '독자가 바로 확인할 수 있는 목록 형태. 숫자와 조건 제시.',
    example: '이사 전 반드시 확인해야 할 7가지 체크리스트'
  },
];

export const HOMEFEED_TITLE_FORMULAS: TitleFormula[] = [
  // ────── 체험 계열 (온도 1~2단계) ──────
  {
    id: 'hf_duration_exp', name: '①체험형',
    instruction: '장기 사용 체험을 기반으로 신뢰도 높이기. 기간 수치(N주/N개월)를 절대 명시하지 말고 "오래 써보니", "꾸준히 써본 결과" 같은 표현 사용. 서브키워드 필수. 28~55자.',
    example: '무선 청소기 다이슨 꾸준히 써보니 생각이 바뀌었어요'
  },
  {
    id: 'hf_direct_exp', name: '②직접해봄형',
    instruction: '"직접 해봤더니" 구조로 1인칭 체험 결과 전달. 서브키워드 포함 필수. 28~55자.',
    example: '전기세 절약 이 방법 해봤더니 월 3만원 줄었어요'
  },
  {
    id: 'hf_before_after', name: '③전후비교형',
    instruction: '"바꿨더니" 구조로 변화 전후를 극적 대비. 서브키워드로 토픽 분류 보장. 28~55자.',
    example: '거실 조명 바꿨더니 분위기가 완전 달라졌어요'
  },
  {
    id: 'hf_accumulated', name: '④누적후기형',
    instruction: '누적된 사용 후기 + 솔직 평가. 기간 수치(N주/N개월)를 절대 명시하지 말고 "써본 후기", "오래 써본 결과" 같은 표현 사용. 서브키워드 필수. 28~55자.',
    example: '공기청정기 위닉스 써본 후기, 비염에 진짜 효과 있음?'
  },
  // ────── 반응 계열 (온도 2~3단계) ──────
  {
    id: 'hf_others_reaction', name: '⑤타인반응형',
    instruction: '타인의 놀라운/의외 반응을 활용하여 CTR 극대화. 서브키워드 앞에 배치. 28~55자.',
    example: '원룸 인테리어 바꿨더니 친구가 이사했냐고 물어봄'
  },
  {
    id: 'hf_unexpected', name: '⑥의외발견형',
    instruction: '예상과 다른 결과/의외의 사실 강조. 서브키워드로 토픽 매칭 보장. 28~55자.',
    example: '다이어트 식단만 바꿨는데 운동보다 효과 있었어요'
  },
  {
    id: 'hf_comments', name: '⑦댓글반응형',
    instruction: '댓글/SNS/팬 반응을 활용한 사회적 증거 제목. 연예/스포츠에 최적. 28~55자.',
    example: '뉴진스 컴백 무대 직캠 올렸더니 해외 팬 반응 뜨거워'
  },
  {
    id: 'hf_spread', name: '⑧주변전파형',
    instruction: '정보를 알려줬을 때 주변의 반응을 강조. 서브키워드 필수 포함. 28~55자.',
    example: '연말정산 환급 방법 알려줬더니 직장 동료들 난리'
  },
  // ────── 정보 계열 (온도 1단계) ──────
  {
    id: 'hf_simple_summary', name: '⑨간단정리형',
    instruction: '"달라진 점, 간단히 정리" 구조. 사회/경제/정책 카테고리에 최적. 서브키워드 필수. 28~55자.',
    example: '2025 최저임금 달라진 점, 알바생 입장에서 정리했어요'
  },
  {
    id: 'hf_miss_loss', name: '⑩놓치면손해형',
    instruction: '"확인했는데 놓치기 쉬운 점" 구조로 손실회피 심리 자극. 서브키워드 필수. 28~55자.',
    example: '청년지원금 신청 자격 확인했는데 90%가 놓치는 조건 하나'
  },
  {
    id: 'hf_applicability', name: '⑪해당확인형',
    instruction: '"이런 분 해당, 확인해보세요" 구조. 타깃 독자 특정. 서브키워드 필수. 28~55자.',
    example: '국민연금 조기수령 이런 분 해당, 금액 차이 확인해보세요'
  },
  {
    id: 'hf_comparison', name: '⑫비교분석형',
    instruction: '두 대상을 직접 비교한 결과 제시. 서브키워드 2개 포함 권장. 28~55자.',
    example: '아이폰16 카메라 갤럭시25 비교, 직접 찍어보고 정리'
  },
  // ────── 공감 계열 (온도 2단계) ──────
  {
    id: 'hf_me_too', name: '⑬나도그랬어형',
    instruction: '"저도 그랬는데" 구조로 독자 동질감 형성. 해결책 암시. 서브키워드 필수. 28~55자.',
    example: '전세사기 불안했는데 저도 그랬어요, 이것만 확인하세요'
  },
  {
    id: 'hf_confession', name: '⑭솔직고백형',
    instruction: '"솔직히 후회한/아쉬운" 구조로 진솔한 감정 전달. 기간 수치 명시 금지. 서브키워드 필수. 28~55자.',
    example: '테슬라 모델3 타보니 솔직히 후회한 점 하나'
  },
  {
    id: 'hf_common_worry', name: '⑮모두의고민형',
    instruction: '"다들 고민하시죠, 해결법" 구조. 보편적 걱정 → 해결 흐름. 서브키워드 필수. 28~55자.',
    example: '적금 금리 떨어질 때 다들 고민하시죠, 대안 정리해봤어요'
  },
  // ────── 호기심 계열 (온도 2단계) ──────
  {
    id: 'hf_reason_tracking', name: '⑯이유추적형',
    instruction: '"왜 이런지 찾아봤더니" 구조. 호기심 자극 후 정보 약속. 서브키워드 필수. 28~55자.',
    example: '삼성전자 주가 왜 이렇게 빠졌는지 찾아봤더니'
  },
  {
    id: 'hf_hidden_truth', name: '⑰숨겨진진실형',
    instruction: '"알고 보니 반전" 구조. 기존 상식 뒤집기. 서브키워드 필수. 28~55자.',
    example: '에어컨 전기세 알고 보니 설정 온도보다 중요한 게 있었음'
  },
  {
    id: 'hf_after_story', name: '⑱그후이야기형',
    instruction: '"그 후 결과" 구조. 사건/행동 이후 변화 추적. 서브키워드 필수. 28~55자.',
    example: '손흥민 부상 복귀 그 후 경기력 변화, 동료 반응까지'
  },
  // ────── 결과 계열 (온도 1~2단계) ──────
  {
    id: 'hf_numeric_proof', name: '⑲수치증명형',
    instruction: '구체적 숫자(금액/비율/수량/횟수)로 결과 증명. 기간(N주/N개월) 대신 금액/비율/개수 우선 사용. 서브키워드 필수. 28~55자.',
    example: '블로그 수익 애드센스로 월 50만원 찍은 방법'
  },
  {
    id: 'hf_final_choice', name: '⑳최종선택형',
    instruction: '"고민 끝에 선택한 이유" 구조. 비교 후 결론 제시. 서브키워드 2개 권장. 28~55자.',
    example: '노트북 맥북 레노버 고민 끝에 선택한 이유'
  },
  // ────── [v2.10.87] 사건성·갈등성 계열 (Manus 분석 기반 — 홈판 노출 40% 비중) ──────
  {
    id: 'hf_conflict_against', name: '㉑반대·갈등형',
    instruction: '"반대에도 + 선택/결과 + 의외 결말" 구조. 가족·이웃·전문가 반대를 전면화. 후킹 요소: 갈등(필수) + 결과 반전. 28~55자.',
    example: '주변 반대 무릅쓰고 산 구축 아파트, 1년 뒤 가격 갈렸다'
  },
  {
    id: 'hf_named_event', name: '㉒실명·사건형',
    instruction: '실명/지역명/제도명 + 사건/논란/근황 + 의문 결합. Manus 분석상 홈판 메인의 50%가 실명 후킹. 28~55자. 단 입력 자료에 명시된 실명만 사용 (날조 금지).',
    example: '분당 재건축 기대감 큰데 매수자가 망설이는 이유'
  },
  {
    id: 'hf_loss_warning', name: '㉓손실경고형',
    instruction: '"믿었는데 + 못 받았다 / 놓쳤다 / 손해 봤다" 구조. 손실회피 심리 + 실제 사건. 후킹: 갈등 + 손실. 28~55자.',
    example: '전세보증보험 믿었는데 못 받은 세입자, 어디서 갈렸나'
  },
  {
    id: 'hf_current_buzz', name: '㉔현재성·이벤트형',
    instruction: '"요즘/이번 주/오늘 + 화제/난리/반응" 구조. 최신성 + 집단 반응. Manus 분석상 55%가 현재성 후킹. 28~55자.',
    example: '요즘 실수요자들이 다시 보는 구축 아파트, 이유는'
  },
  {
    id: 'hf_event_question', name: '㉕사건의문형',
    instruction: '"왜 + 사건/결과 + 진짜 이유는?" 구조. 의문형 + 구체 사건. 단순 의문보다 사건 결합이 강함. 28~55자.',
    example: '왜 같은 단지인데 한 동만 더 비쌀까, 이유는 따로 있었다'
  },
];

// ✅ [2026-03-13] 쇼핑커넥트 전용 제목 공식 8개 — 제품 후기 최적화
export const AFFILIATE_TITLE_FORMULAS: TitleFormula[] = [
  {
    id: 'af_comma_link', name: '①쉼표연결형',
    instruction: '"상품명, 상황/체험 후기표현" 구조. 쉼표로 상품명과 후기를 자연스럽게 연결. 기간 수치 대신 "써본", "직접 써본" 같은 표현 사용. 25~45자.',
    example: '린백 LB221HA, 직접 써본 사무용의자 솔직 후기'
  },
  {
    id: 'af_question', name: '②질문형',
    instruction: '"가격대 상품명 의문표현" 구조. 독자 호기심 자극. 25~45자.',
    example: '9만원대 린백 LB221HA 허리 아픈 직장인 추천할까?'
  },
  {
    id: 'af_duration', name: '③체험형',
    instruction: '사용 체험 + 솔직후기. 기간 수치(N주/N개월)는 절대 사용하지 말고 "직접 써본", "꾸준히 쓴", "오래 써본" 같은 표현 사용. 25~45자.',
    example: '린백 LB221HA 가성비 의자 직접 써본 솔직 후기'
  },
  {
    id: 'af_switch', name: '④갈아탄형',
    instruction: '이전 제품에서 교체한 경험 강조. "바꿨더니", "갈아탄" 활용. 25~45자.',
    example: '사무용의자 린백 LB221HA 갈아탄 후 달라진 점'
  },
  {
    id: 'af_price', name: '⑤가격강조형',
    instruction: '가격대를 앞에 배치하여 가성비 의문 제기. 25~45자.',
    example: '9만원대 사무용의자 린백 LB221HA 진짜 가성비인가'
  },
  {
    id: 'af_gift', name: '⑥선물추천형',
    instruction: '선물/추천 상황 + 타인 반응. "선물", "사줬더니" 활용. 25~45자.',
    example: '린백 LB221HA 부모님 선물로 사드렸더니 반응'
  },
  {
    id: 'af_proscons', name: '⑦장단점형',
    instruction: '사용 기간 + 좋은 점/아쉬운 점 솔직 고백. 25~45자.',
    example: '린백 LB221HA 3개월, 좋은 점 아쉬운 점 솔직히'
  },
  {
    id: 'af_target', name: '⑧상황추천형',
    instruction: '특정 대상/상황에 추천하는 구조. "이런 분께", "용으로" 활용. 25~45자.',
    example: '재택근무용 의자 린백 LB221HA 이런 분께 추천'
  },
];

// ✅ [v1.4.57] 쇼핑커넥트 전문리뷰 전용 제목 공식 풀
// 버그 수정: shopping_expert_review가 AFFILIATE_TITLE_FORMULAS(전부 후기/체험형)를 쓰던 문제
// → 전문리뷰는 "솔직후기/내돈내산/직접 써본" 같은 체험 표현 금지, 스펙/가이드/분석 관점 강제
export const SHOPPING_EXPERT_TITLE_FORMULAS: TitleFormula[] = [
  {
    id: 'sxp_spec_analysis', name: '①스펙 분석형',
    instruction: '제품명 + 스펙/기능 분석 관점. "스펙 비교", "스펙 해부", "스펙 파헤치기", "스펙 총정리" 활용. ⛔ 후기 표현(솔직/직접/써본/찐/내돈내산/실사용) 절대 금지. 25~45자.',
    example: '린백 LB221HA 스펙 비교, 10만원대 사무용의자 기준은?'
  },
  {
    id: 'sxp_buy_guide', name: '②구매 가이드형',
    instruction: '"구매 전 체크할 N가지", "구매 가이드", "선택 기준", "구매 포인트" 활용. 구매 가이드 문서 관점, 후기 아님. 25~45자.',
    example: '사무용의자 린백 LB221HA 구매 전 체크할 7가지 포인트'
  },
  {
    id: 'sxp_price_value', name: '③가격 합리성 분석형',
    instruction: '"이 가격대에서 이만한", "가성비 분석", "가격 합리적일까", "이 가격에 이 스펙" 활용. 객관적 가격 비교 관점. ⛔ 체험 표현 금지. 25~45자.',
    example: '린백 LB221HA, 9만원대에 이 스펙이면 합리적일까?'
  },
  {
    id: 'sxp_target_recommend', name: '④타겟 추천형',
    instruction: '"이런 분께 적합", "N에게 추천되는 이유", "적합한 타겟 분석" 활용. 전문가의 타겟 분석 관점. 25~45자.',
    example: '린백 LB221HA, 재택근무 직장인에게 딱 맞는 이유'
  },
  {
    id: 'sxp_pros_cons_analysis', name: '⑤장단점 분석형',
    instruction: '"장단점 분석", "강점과 약점", "총평", "N개 장점과 M개 단점" 활용. 균형 있는 전문 분석 관점. ⛔ 체험형 표현 금지. 25~45자.',
    example: '린백 LB221HA 장단점 분석: 7개 강점과 3개 약점'
  },
  {
    id: 'sxp_vs_comparison', name: '⑥경쟁 비교형',
    instruction: '"VS 경쟁제품", "A vs B 승자는?", "비교 분석" 활용. 다른 제품과의 비교 관점. 25~45자.',
    example: '린백 LB221HA VS 시디즈, 10만원대 의자 진짜 승자는?'
  },
  {
    id: 'sxp_total_summary', name: '⑦핵심 총정리형',
    instruction: '"핵심 총정리", "N분 요약", "한눈에 정리", "핵심만 정리" 활용. 전문가 요약 문서 느낌. ⛔ 체험 표현 금지. 25~45자.',
    example: '린백 LB221HA 핵심 3분 총정리, 이것만 알면 끝'
  },
  {
    id: 'sxp_numbers', name: '⑧수치 분석형',
    instruction: '숫자로 보는 스펙. 구체 수치(cm/kg/도/Hz/mAh) 활용. "숫자로 보는", "스펙 숫자", "데이터로 본" 활용. ⛔ 체험 표현 금지. 25~45자.',
    example: '린백 LB221HA 숫자로 보는 스펙: 48cm 깊이 3단 조절'
  },
];

// ✅ [v3 → v4] 카테고리별 우선 공식 매핑 — 20개 아키타입 기반 감정 온도별 최적화
// ✅ [v1.4.47] 기간체험형 완전 제거 — 카테고리별 우선순위에서 아예 빠짐
// 기간체험형은 이제 일반 pool에서만 선택 가능하며, 최근 이력 2개 이상 시 스킵됨
export const CATEGORY_FORMULA_PRIORITY: Record<string, string[]> = {
  // 🧊 쿨-정보형 카테고리
  '사회': ['hf_simple_summary', 'hf_miss_loss', 'hf_applicability', 'hf_numeric_proof', 'hf_common_worry'],
  // ✅ [v1.4.48 Stage A.1] 'loss_aversion' 제거 — 어떤 풀에도 존재하지 않는 유령 ID였음
  '재테크': ['hf_numeric_proof', 'hf_miss_loss', 'hf_comparison', 'hf_simple_summary', 'hf_applicability'],
  // 🔥 워밍-공감형 카테고리
  '건강': ['hf_direct_exp', 'hf_unexpected', 'hf_confession', 'hf_me_too', 'hf_before_after'],
  'IT': ['hf_comparison', 'hf_before_after', 'hf_final_choice', 'hf_numeric_proof', 'hf_unexpected'],
  '여행': ['hf_others_reaction', 'hf_before_after', 'hf_hidden_truth', 'hf_me_too', 'hf_unexpected'],
  '음식': ['hf_direct_exp', 'hf_others_reaction', 'hf_hidden_truth', 'hf_confession', 'hf_unexpected'],
  '맛집': ['hf_direct_exp', 'hf_others_reaction', 'hf_hidden_truth', 'hf_confession', 'hf_unexpected'],
  '리빙': ['hf_before_after', 'hf_others_reaction', 'hf_comparison', 'hf_direct_exp', 'hf_unexpected'],
  '육아': ['hf_me_too', 'hf_confession', 'hf_common_worry', 'hf_direct_exp', 'hf_unexpected'],
  '패션': ['hf_before_after', 'hf_others_reaction', 'hf_comparison', 'hf_final_choice', 'hf_unexpected'],
  '반려동물': ['hf_me_too', 'hf_confession', 'hf_before_after', 'hf_others_reaction', 'hf_unexpected'],
  '쇼핑': ['hf_numeric_proof', 'hf_comparison', 'hf_confession', 'hf_final_choice', 'hf_unexpected'],
  // 🔥🔥 핫-반응형 카테고리
  '연예': ['hf_comments', 'hf_others_reaction', 'hf_after_story', 'hf_reason_tracking', 'hf_spread'],
  '스포츠': ['hf_comments', 'hf_others_reaction', 'hf_after_story', 'hf_numeric_proof', 'hf_reason_tracking'],
  // 🔥+🔥🔥 혼합 카테고리
  '생활': ['hf_direct_exp', 'hf_unexpected', 'hf_spread', 'hf_numeric_proof', 'hf_hidden_truth'],
};

