import { GoogleGenerativeAI } from '@google/generative-ai';

// 카테고리별 애드포스트 전략
const ADPOST_STRATEGIES: Record<string, string> = {
  celebrity: `
    ✅ 애드포스트 수익 전략:

    - 글자 수: 2500자 이상 (광고 노출 최대화)

    - 이미지: 7-10개 (체류 시간 증가)

    - 구조: 짧은 문단 + 이미지 반복 (스크롤 유도)

    - 키워드: 연예인 이름, "화제", "근황", "패션", "뷰티" 자연스럽게 포함

    - 감정: 풍부한 감탄문과 이모지 (공감 → 댓글 → 재방문)

  `,

  finance: `
    ✅ 애드포스트 수익 전략 (고단가 광고!):

    - 글자 수: 3000자 이상 (광고 단가 최고 카테고리)

    - 구조: 정보 밀도 높게 (전문성 = 신뢰 = 체류 시간)

    - 리스트: 투자 방법, 절세 팁 등 번호 매겨 정리

    - 키워드: "투자", "수익", "재테크", "ETF", "절세" 필수 포함

    - CTA: 정보 공유 유도 (바이럴 효과)

  `,

  parenting: `
    ✅ 애드포스트 수익 전략:

    - 글자 수: 2800자 이상

    - 이미지: 8-10개 (육아 팁은 시각 자료 필수)

    - 공감: 엄마/아빠 고민 공유 → 댓글 활성화

    - 키워드: "육아", "아이", "교육", "장난감", "유아용품"

    - 질문: 각 섹션마다 독자에게 질문 (참여 유도)

  `,

  travel: `
    ✅ 애드포스트 수익 전략:

    - 글자 수: 2600자 이상

    - 이미지: 10개 이상 (여행은 비주얼!)

    - 구조: 장소별 섹션 나누기

    - 키워드: "여행", "맛집", "호텔", "항공권", 장소 이름

    - 실용 정보: 가격, 영업시간, 교통편 (검색 유입)

  `,

  lifestyle: `
    ✅ 애드포스트 수익 전략:

    - 글자 수: 2400자 이상

    - 이미지: 6-8개

    - 스토리: 일상 속 변화 스토리텔링

    - 키워드: "루틴", "홈카페", "인테리어", 제품명

    - 팁: 실용적인 생활 팁 (저장/공유 유도)

  `,

  default: `
    ✅ 애드포스트 수익 전략:

    - 글자 수: 2500자 이상

    - 이미지: 7-8개

    - 균형: 정보 + 공감

  `,
};

const STAGE1_SCHEMA = `
Output ONLY valid JSON. NO markdown, NO explanations.

⛔⛔⛔ [최우선 규칙 - 반드시 입력된 콘텐츠 기반으로 생성] ⛔⛔⛔
1. 제목(title)은 반드시 아래 "다음 내용"에서 핵심 주제와 고유명사(인물/제품/기관 등)를 추출하여 작성하라.
2. 입력된 콘텐츠에 없는 인물/이벤트/제품을 제목에 사용하면 안 된다.
3. 입력된 콘텐츠의 핵심 갈등, 발언, 수치를 참고하여 제목을 작성하라.
4. 예시의 패턴이나 고유명사를 절대 복사하지 말고, 오직 입력 콘텐츠의 '사실'만 사용하라.
5. ⛔⛔⛔ [인물명], [브랜드명], [제품명] 같은 플레이스홀더(대괄호) 절대 금지! 본문에서 직접 이름을 찾아 써라!
   - 잘못된 예: "[인물명]이 남긴 마지막 말" ← 0점!
   - 올바른 예: 본문에 "철수가 ~했다"고 나오면 "철수가 남긴 마지막 말" ← 100점!

⛔⛔⛔ [제목에서 반드시 제외해야 할 요소] ⛔⛔⛔
1. 기자 크레딧: [OSEN=기자], [스포츠조선=기자], [뉴시스=기자] 등 언론사 및 기자 표기 절대 금지!
2. 출처 정보: (사진=연합뉴스), 제공=, 촬영= 등 출처 표기 절대 금지!
3. 괄호 안의 메타정보: [속보], [단독], [긴급], [Photo], [영상] 등 뉴스 태그 절대 금지!
4. 제목은 오직 순수한 제목 텍스트만 포함해야 한다. 기자명, 언론사명, 출처는 본문에만 자연스럽게 포함하라.

🔥 [강력한 후킹 + 100% 사실 기반 제목] 🔥
제목은 반드시 아래 조건을 모두 만족해야 합니다:

<1. 팩트 기반 필수 (환각 금지)>
- 본문에 없는 내용으로 낚시하지 마세요! (예: 본문에 없는데 "마지막 3글자", "충격 증언", "눈물 펑펑" 등 사용 금지)
- 오직 입력된 콘텐츠에 있는 **놀라운 사실, 수치, 발언, 사건**을 핵심 키워드로 사용하세요.

<2. 강력한 후킹 기법>
- 단순히 요약하지 말고, 독자가 클릭하지 않고는 못 배길 **궁금증**을 본문의 사실과 연결하세요.
- **구체적인 데이터나 발언**을 후킹으로 사용하세요.
  - (Bad): 특정 선수 조기 복귀 소식 전달 (밋밋함)
  - (Good): "공식 보도 확인" 본문 속 인물의 조기 복귀 급물살, 결정적 장면 뒤에 숨겨진 한마디
  - (Good): 런던행 비행기 타나? 본문에 나온 기류와 직접 밝힌 '조기 복귀'의 진짜 이유

<3. 고유명사 강조>
- 주어(인물/제품)를 명확히 밝히고, 그 주체가 처한 **긴박한 상황이나 반전 요소**를 제목에 녹이세요.
- ⛔ 플레이스홀더 절대 금지! 오직 본문의 실제 명칭만 사용하세요.


⚠️ [형식 규칙 - 잘림 방지 최우선]
1. ⛔⛔⛔ 제목과 소제목은 반드시 완전한 문장으로 끝맺음하라. 중간에 잘리면 탈락!
2. 소제목(heading)은 반드시 완결된 문장이어야 한다. 글자 수 제한 없음! 동사/형용사로 끝나야 함!
3. 잘린 소제목 예시 (금지): "인물이 보여준 장면, 특정" ← 뒤에 뭐가 오는지 알 수 없음 = 0점
4. 올바른 소제목 예시: "인물이 보여준 결정적 장면, 주변에서 난리가 난 진짜 이유" ← 완결됨 = 100점
5. "내용 불충분" 응답은 절대 금지. 반드시 제목과 개요를 생성하라.
6. 글자 수 제한은 전혀 없음. 50자, 70자, 80자도 괜찮음. 오직 문장이 완결되었는지만 중요!

{
  "title": "string (SEO 제목, 25~40자, 사실 기반 후킹, 입력 콘텐츠의 핵심 스토리 반영)",
  "outline": [
    {"heading": "string (완결된 문장, 동사/형용사로 끝남, 글자 수 제한 없음, 절대 잘리면 안됨)", "keyPoints": ["string"]}
  ],
  "mainIdea": "string (핵심 메시지, 100자, 입력 콘텐츠 기반)"
}
`;

const STAGE2_SCHEMA = `
Output ONLY valid JSON.

{
  "body": "string (HTML, 소제목 포함, 목표 글자 수 충족)",
  "hashtags": ["string (15개, 고단가 키워드 포함)"],
  "images": [
    {"heading": "string", "prompt": "string", "alt": "string"}
  ],
  "metadata": {
    "category": "string",
    "seoScore": 85,
    "readTime": "string"
  }
}

⚠️ 애드포스트 수익 최적화 필수 사항:

1. 글자 수 충족 (광고 노출 공간 확보)
   - 연예/스타: 2500자 이상
   - 재테크: 3000자 이상 (고단가!)
   - 육아: 2800자 이상
   - 여행: 2600자 이상
   - 라이프: 2400자 이상

2. 문단 구조 (3-4문장씩, 광고 삽입 최적화)
   - 최소 8-10개 문단
   - 문단마다 소제목 (H2 태그)
   - 짧은 문단 = 가독성 UP = 체류 시간 UP

3. 이미지 배치 (체류 시간 증가)
   - 각 소제목마다 이미지 1개
   - 이미지 설명(alt) 키워드 포함

4. 키워드 전략 (SEO + 광고 단가)
   - 제목에 핵심 키워드 포함
   - 본문에 자연스럽게 3-5회 반복
   - 해시태그 15개 (고단가 키워드 우선)

5. 참여 유도 (재방문 = 지속 수익)
   - 글 중간중간 질문 던지기
   - 마지막에 CTA (댓글 유도)
   - 공감 표현으로 친근감

✅ 글쓰기 스타일은 친근하되, 반복 금지:
- "정말 ~" 최대 5-7회
- "도움이 되었으면..." 최대 1-2회
- 각 문단 다른 마무리 표현
`;

export class TwoStageGenerator {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateFromUrl(
    urlContent: string,
    category: string,
    onStage1?: (stage1: any) => void,
    onStage2?: (stage2: any) => void
  ): Promise<any> {
    console.log('🚀 2단계 생성 시작');
    const totalStart = Date.now();

    console.log('📌 1단계: 개요 생성');
    const stage1Start = Date.now();

    const model1 = this.client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048, // ✅ 1024 → 2048로 증가 (소제목 잘림 완전 방지)
      },
    });

    const prompt1 = `
${STAGE1_SCHEMA}

=== [입력 콘텐츠 - 아래 내용에서 반드시 제목과 주제를 추출하라] ===

${urlContent.slice(0, 3000)}

=== [입력 콘텐츠 끝] ===

카테고리: ${category}

⛔ 위 "입력 콘텐츠"에 나오는 인물, 이벤트, 제품만 제목에 사용하라.
⛔ 입력 콘텐츠에 없는 내용은 절대 제목에 포함하지 마라.

JSON:

`.trim();

    const result1 = await model1.generateContent(prompt1);
    const stage1Text = result1.response.text().replace(/```json|```/g, '').trim();
    const stage1Data = JSON.parse(stage1Text);

    const stage1Elapsed = Date.now() - stage1Start;
    console.log(`✅ 1단계 완료: ${stage1Elapsed}ms`);

    if (onStage1) {
      onStage1(stage1Data);
    }

    console.log('📌 2단계: 본문 생성');
    const stage2Start = Date.now();

    const model2 = this.client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192, // ✅ 4096 → 8192로 증가 (본문 잘림 완전 방지)
      },
    });

    const prompt2 = `
${STAGE2_SCHEMA}

${ADPOST_STRATEGIES[category] || ADPOST_STRATEGIES.default}

개요:

${JSON.stringify(stage1Data, null, 2)}

원본 내용:

${urlContent.slice(0, 4000)}

카테고리: ${category}

위 개요와 애드포스트 전략을 바탕으로 수익 최적화된 본문을 작성하세요.

JSON:

`.trim();

    const result2 = await model2.generateContent(prompt2);
    const stage2Text = result2.response.text().replace(/```json|```/g, '').trim();
    const stage2Data = JSON.parse(stage2Text);

    const stage2Elapsed = Date.now() - stage2Start;
    console.log(`✅ 2단계 완료: ${stage2Elapsed}ms`);

    if (onStage2) {
      onStage2(stage2Data);
    }

    const merged = {
      ...stage1Data,
      ...stage2Data,
      generationTime: {
        stage1: stage1Elapsed,
        stage2: stage2Elapsed,
        total: Date.now() - totalStart,
      },
    };

    const totalElapsed = Date.now() - totalStart;
    console.log(`✅ 전체 완료: ${totalElapsed}ms`);

    return merged;
  }
}

