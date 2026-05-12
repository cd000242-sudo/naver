/**
 * [Phase 3-8/v2.10.146] contentGenerator god file decomposition — title quality scoring data + feedback.
 *
 * 3개 항목 통합 도메인:
 *   - ISSUE_ACTION_MAP: 감점 이유별 구체적 수정 지침
 *   - buildTitleRetryFeedback: 재시도 시 LLM에게 전달할 피드백 문자열 생성
 *   - CATEGORY_BONUSES: 카테고리별 가점 패턴 (evaluateTitleQuality가 사용)
 *
 * 모두 pure (외부 state 의존 0). evaluateTitleQuality는 contentGenerator.ts에 남고
 * 이 파일의 데이터를 import해서 사용.
 */

// ✅ [v3] 감점 이유별 구체적 수정 지침
export const ISSUE_ACTION_MAP: Record<string, string> = {
  '뻔한 템플릿 종결어': '"~했더니", "~인 이유", "~의 비밀" 같은 신선한 종결어를 사용하세요.',
  '키워드와 너무 유사': '키워드를 자연스러운 문장 속에 녹여 쓰세요. 단순 나열 금지.',
  'SEO: 40자 초과': '핵심만 남기고 불필요한 수식어를 제거하세요. 25~35자가 이상적.',
  '50자 초과': '문장을 반으로 줄이세요. 가장 중요한 정보 하나만 남기세요.',
  'SEO: 키워드가 뒤쪽에 배치': '키워드를 제목 앞부분(10자 이내)에 배치하세요.',
  '홈판: 뻔한 AI티 표현': '"충격/경악/눈물바다" 대신 구체적 상황/디테일을 쓰세요.',
  'SEO: 숫자/구체성 없음': '구체적 숫자(기간, 금액, 횟수)를 반드시 포함하세요.',
  '중복 키워드': '같은 단어는 제목에 한 번만 쓰세요. 동의어로 변환하거나 생략.',
  '숫자+단위 반복': '같은 숫자+단위 조합은 한 번만 쓰세요.',
  '두 제목 합치기 패턴': '한 문장으로 된 자연스러운 제목을 만드세요. 두 제목을 합치지 마세요.',
  '어간 변형 중복': '같은 동사/명사의 활용형을 반복하지 마세요.',
  '쉼표 전후 키워드 반복': '쉼표 앞뒤로 같은 단어가 나오면 안 됩니다.',
};

/**
 * 제목 재시도 시 LLM에게 전달할 피드백 문자열 생성.
 *
 * 시도 횟수별 에스컬레이션 (다른 공식 → 다른 관점 → 파격적 표현)과
 * 이전 감점 이유별 구체 action을 결합.
 *
 * @param attempt - 시도 횟수 (0이면 빈 문자열 반환)
 * @param prevTitle - 직전 시도 제목
 * @param prevScore - 직전 시도 점수
 * @param prevIssues - 직전 시도 감점 이유 배열
 * @returns LLM 프롬프트에 append할 피드백 블록
 */
export function buildTitleRetryFeedback(attempt: number, prevTitle: string, prevScore: number, prevIssues: string[]): string {
  if (attempt === 0 || !prevTitle) return '';

  // 시도 횟수별 전략 에스컬레이션
  const escalationLevel = [
    '', // attempt 0: 사용 안 함
    '💡 다른 공식 패턴과 다른 문장 구조로 작성하세요.',
    '🔄 완전히 다른 관점에서 접근하세요. 대상/행동/결과 중 하나를 바꿔보세요.',
    '🚀 가장 대담하고 파격적인 표현을 사용하세요. 기존 틀을 완전히 벗어나세요.',
  ][Math.min(attempt, 3)];

  let feedback = `\n\n⛔ [이전 시도 피드백 - 반드시 다른 방식으로 작성!]\n`;
  feedback += `이전 제목: "${prevTitle}" → ${prevScore}점 (불합격)\n`;

  if (prevIssues.length > 0) {
    feedback += `감점 이유 및 수정 방향:\n`;
    prevIssues.forEach(issue => {
      // 이슈별 구체적 행동 지침 매핑
      const baseIssue = Object.keys(ISSUE_ACTION_MAP).find(k => issue.includes(k));
      const action = baseIssue ? ISSUE_ACTION_MAP[baseIssue] : '이 문제를 회피하세요.';
      feedback += `  ❌ ${issue}\n     → ${action}\n`;
    });
  }
  feedback += `\n${escalationLevel}\n`;
  return feedback;
}

/**
 * 카테고리별 추가 보너스 테이블 — evaluateTitleQuality에서 사용.
 *
 * 각 카테고리마다 RegExp 패턴 매칭 시 가점 부여. 신체 수치/금액/체험 키워드 등
 * 카테고리 고유의 신뢰 요소를 가점으로 인정.
 */
export const CATEGORY_BONUSES: Record<string, { pattern: RegExp; points: number; reason: string }[]> = {
  '건강': [
    // [v1.4.46] 기간 가점 축소 (+5→+2), kg/cm만 유지 → 기간 반복 방지
    { pattern: /\d+(kg|cm)/, points: 5, reason: '건강: 신체 수치' },
    { pattern: /\d+(개월|주|일)/, points: 2, reason: '건강: 기간(약한 가점)' },
    { pattern: /(효과|증상|원인|치료|예방)/, points: 3, reason: '건강: 의료 키워드' },
    { pattern: /(실제|직접|경험)/, points: 3, reason: '건강: 체험 신뢰' },
  ],
  '재테크': [
    { pattern: /\d+(만원|억|%|원)/, points: 5, reason: '재테크: 금액/수익률' },
    { pattern: /(수익|절약|환급|세금|이자)/, points: 3, reason: '재테크: 금융 키워드' },
    { pattern: /(비교|차이|vs)/, points: 3, reason: '재테크: 비교 분석' },
  ],
  '여행': [
    { pattern: /(후기|다녀와|가봤|방문)/, points: 5, reason: '여행: 체험 키워드' },
    { pattern: /\d+(박|일|시간|km)/, points: 3, reason: '여행: 구체적 일정' },
    { pattern: /(숨은|비밀|현지인)/, points: 3, reason: '여행: 발견 요소' },
  ],
  '연예': [
    { pattern: /(반응|댓글|팬|여론)/, points: 5, reason: '연예: 사회적 반응' },
    { pattern: /(확인|공개|최초)/, points: 3, reason: '연예: 독점성' },
  ],
  '스포츠': [
    { pattern: /\d+(골|점|승|패|위)/, points: 5, reason: '스포츠: 경기 수치' },
    { pattern: /(기록|역대|최초|데뷔)/, points: 3, reason: '스포츠: 기록 키워드' },
  ],
  '맛집': [
    { pattern: /(후기|먹어봤|다녀온|방문)/, points: 5, reason: '맛집: 체험 키워드' },
    { pattern: /(웨이팅|줄서|예약)/, points: 3, reason: '맛집: 인기 증거' },
  ],
  '음식': [
    { pattern: /(레시피|만들기|재료|방법)/, points: 5, reason: '음식: 실용 키워드' },
    { pattern: /\d+(분|인분|kcal)/, points: 3, reason: '음식: 구체적 수치' },
  ],
  '육아': [
    { pattern: /(아이|아기|엄마|아빠)/, points: 3, reason: '육아: 타깃 키워드' },
    // [v1.4.47] 연령 가점은 살/세만 유지 (개월은 기간 반복 원인이므로 제거)
    { pattern: /\d+(살|세)/, points: 5, reason: '육아: 연령 구체성' },
    { pattern: /(솔직|고민|공감)/, points: 3, reason: '육아: 감정 공감' },
  ],
  'IT': [
    { pattern: /(성능|스펙|벤치|출시)/, points: 3, reason: 'IT: 기술 키워드' },
    { pattern: /(vs|비교|차이)/, points: 5, reason: 'IT: 비교 분석' },
    { pattern: /\d+(GB|TB|원|만원)/, points: 3, reason: 'IT: 스펙/가격 수치' },
  ],
  '쇼핑': [
    { pattern: /(후기|써봤|사용|구매)/, points: 5, reason: '쇼핑: 구매 체험' },
    { pattern: /(가성비|할인|최저가)/, points: 3, reason: '쇼핑: 가격 매력' },
  ],
  '패션': [
    { pattern: /(코디|스타일|룩북|착용)/, points: 5, reason: '패션: 스타일 키워드' },
    { pattern: /(트렌드|유행|신상)/, points: 3, reason: '패션: 트렌드 키워드' },
  ],
  // [v1.4.48 Stage A.5] 누락 카테고리 5개 추가 — 카테고리 평가 공정성 확보
  '사회': [
    { pattern: /(달라진|바뀌|개정|시행)/, points: 5, reason: '사회: 변화 키워드' },
    { pattern: /(정책|법|제도|조건|기준)/, points: 3, reason: '사회: 제도 키워드' },
    { pattern: /(놓치|확인|챙기|혜택)/, points: 3, reason: '사회: 손실회피' },
  ],
  '리빙': [
    { pattern: /(인테리어|꾸미|배치|정리)/, points: 5, reason: '리빙: 공간 키워드' },
    { pattern: /\d+(평|원|만원)/, points: 3, reason: '리빙: 평수/가격' },
    { pattern: /(전후|바꾸|달라진|꾸민)/, points: 3, reason: '리빙: 변화 비교' },
  ],
  '생활': [
    { pattern: /(꿀팁|방법|노하우|쉽게)/, points: 3, reason: '생활: 실용 키워드' },
    { pattern: /\d+(가지|개|단계|분)/, points: 5, reason: '생활: 구체 수치' },
    { pattern: /(주의|놓치|확인|체크)/, points: 3, reason: '생활: 주의사항' },
  ],
  '반려동물': [
    { pattern: /(강아지|고양이|반려|품종)/, points: 3, reason: '반려동물: 타깃 키워드' },
    { pattern: /\d+(살|개월|kg)/, points: 3, reason: '반려동물: 나이/체중' },
    { pattern: /(행동|증상|건강|훈련)/, points: 5, reason: '반려동물: 핵심 토픽' },
  ],
  '라이프': [
    { pattern: /(일상|루틴|습관|하루)/, points: 3, reason: '라이프: 일상 키워드' },
    { pattern: /(공감|솔직|진심|마음)/, points: 3, reason: '라이프: 공감 키워드' },
  ],
};
