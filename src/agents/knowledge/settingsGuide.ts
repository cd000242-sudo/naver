/**
 * 설정 가이드 지식 데이터
 */

import { KnowledgeItem } from '../types.js';

export const settingsGuideData: KnowledgeItem[] = [
  {
    id: 'settings-overview',
    category: 'settings',
    keywords: ['환경설정', '설정', '세팅', '어디서', '사용법', '처음', '기본설정', '옵션'],
    title: '환경설정 사용법 (처음에 여기부터!)',
    content: `환경설정은 "이 앱이 제대로 동작하게 만드는 기본 세팅"을 하는 곳이에요.

특히 처음 설치한 날에는 API 키 설정이 필수입니다.`,
    steps: [
      '1) 화면에서 "⚙️ 환경설정" 버튼 클릭',
      '2) 가장 먼저 "Gemini API 키" 입력/저장',
      '3) 그 다음에 필요하면 네이버 관련 옵션/로그인 상태를 점검',
      '4) 저장 후에는 AI 채팅/글 생성에서 바로 적용됩니다',
    ],
    tips: [
      '💡 저장했는데도 반영이 안 되는 느낌이면 앱 재시작 1번 해보세요',
    ],
    relatedTopics: ['settings-api-key', 'settings-model', 'settings-image-source'],
    lastUpdated: '2025-12-21'
  },
  {
    id: 'settings-api-key',
    category: 'settings',
    keywords: ['api', 'API', '키', 'key', '제미나이', 'gemini', '설정', '입력', '어디', '넣어', '등록'],
    title: 'API 키 설정하는 법 (필수!)',
    content: `API 키는 이 앱의 "열쇠" 같은 거예요! 이게 있어야 AI가 글을 써줄 수 있어요.

API 키 발급 자체는 무료지만, 사용량/Google 정책/계정 설정에 따라 무료 티어 또는 과금이 적용될 수 있어요.`,
    steps: [
      '📍 API 키 입력하는 곳:',
      '   → 화면 왼쪽에 "⚙️ 환경설정" 버튼 클릭',
      '   → 설정 창이 뜨면 맨 위에 "Gemini API 키" 입력란 보여요',
      '   → 여기에 API 키 붙여넣기',
      '   → 아래 "저장" 버튼 누르면 끝!',
      '',
      '🔑 API 키가 없다면:',
      '   → 아래 "API 키 발급 방법"을 물어보세요!'
    ],
    tips: [
      '💡 API 키는 "AIza"로 시작하는 긴 문자열이에요',
      '💡 무료 티어/할당량은 Google 정책과 계정 설정에 따라 달라질 수 있어요',
      '💡 키 입력 후 저장했는데 안 되면 복붙할 때 앞뒤 공백 확인해보세요'
    ],
    relatedTopics: ['settings-api-guide', 'troubleshooting-api-error'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'settings-api-guide',
    category: 'settings',
    keywords: ['api', '발급', '만들기', '가이드', 'google', '구글', '어디서', '받아', '없어', '어떻게'],
    title: 'API 키 발급받는 법 (1분 컷!)',
    content: `API 키가 없으시군요! 구글에서 API 키를 발급받을 수 있어요.

API 키 발급 자체는 무료지만, 사용량/Google 정책/계정 설정에 따라 무료 티어 또는 과금이 적용될 수 있습니다.`,
    steps: [
      '1️⃣ 구글 AI 스튜디오 접속',
      '   → 브라우저에서 aistudio.google.com 입력',
      '   → (영어로 나와도 당황하지 마세요!)',
      '',
      '2️⃣ 구글 계정으로 로그인',
      '   → 평소 쓰시는 구글 계정으로 로그인',
      '',
      '3️⃣ API 키 만들기',
      '   → 왼쪽 메뉴에서 "Get API key" 클릭',
      '   → "Create API key" 버튼 클릭',
      '   → 키가 생성되면 복사 버튼 눌러서 복사!',
      '',
      '4️⃣ 앱에 붙여넣기',
      '   → 이 앱 환경설정 → Gemini API 키에 붙여넣기',
      '   → 저장하면 완료! 🎉'
    ],
    tips: [
      '💡 구글 계정만 있으면 됩니다 (지메일 쓰시죠?)',
      '💡 한 번 발급받으면 계속 쓸 수 있어요',
      '💡 키를 잃어버려도 언제든 새로 발급 가능!'
    ],
    relatedTopics: ['settings-api-key'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'settings-model',
    category: 'settings',
    keywords: ['모델', 'model', 'gemini', 'pro', 'flash', '변경', '선택', '어떤'],
    title: 'AI 모델 선택',
    content: '사용할 Gemini 모델을 선택할 수 있습니다. 공통 설정에서 AI 엔진을 선택하세요.',
    steps: [
      '1. 글 생성 탭의 "공통 설정" 영역 찾기',
      '2. "AI 엔진" 드롭다운에서 모델 선택:',
      '   • Gemini 1.5 Flash: 정책/계정 설정에 따라 무료 티어 또는 과금, 안정적',
      '   • Gemini 2.5 Flash: 정책/계정 설정에 따라 무료 티어 또는 과금, 빠름 (기본)',
      '   • Gemini 1.5 Pro: 정책/계정 설정에 따라 무료 티어 또는 과금, 고품질',
      '   • Gemini 2.0 Flash Exp: 실험적',
      '   • Gemini 3 Exp: 최신'
    ],
    tips: [
      '💡 일반 글 생성은 Flash 모델 추천 (빠르고 충분한 품질)',
      '💡 긴 글이나 전문 콘텐츠는 Pro 모델 추천',
      '💡 무료 티어/할당량은 Google 정책과 계정 설정에 따라 달라질 수 있어요'
    ],
    relatedTopics: ['settings-api-key', 'manual-content-generation'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'settings-image-source',
    category: 'settings',
    keywords: ['이미지', '소스', 'pexels', 'unsplash', 'imagen', '사진', '출처'],
    title: '이미지 소스 설정',
    content: '글에 삽입할 이미지의 출처를 설정합니다.',
    steps: [
      '1. 글 생성 탭의 "AI 이미지 생성 엔진 선택" 영역 찾기',
      '2. 이미지 소스 선택:',
      '   • 나노 바나나 프로: Gemini AI 이미지 생성',
      '   • Imagen 4: Google 최신 이미지 생성',
      '   • 무료 이미지 검색: Pexels, Unsplash'
    ],
    tips: [
      '💡 AI 이미지 생성은 독창적인 이미지가 필요할 때',
      '💡 무료 이미지는 실제 사진이 필요할 때',
      '💡 두 가지를 섞어서 사용해도 좋습니다'
    ],
    relatedTopics: ['manual-image', 'settings-api-key'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'settings-naver-login',
    category: 'settings',
    keywords: ['네이버', '로그인', '계정', '연동', '블로그', '아이디', '비밀번호'],
    title: '네이버 계정 연동',
    content: '네이버 블로그에 글을 발행하려면 네이버 로그인이 필요합니다.',
    steps: [
      '1. 발행 버튼 클릭 시 네이버 로그인 창 표시',
      '2. 네이버 아이디/비밀번호 입력',
      '3. 로그인 완료 후 발행 진행'
    ],
    tips: [
      '💡 2차 인증 설정된 경우 OTP 입력 필요',
      '💡 로그인 상태는 일정 기간 유지됩니다',
      '💡 자동 로그인 방지가 뜨면 "내가 맞습니다" 선택'
    ],
    relatedTopics: ['manual-publish', 'troubleshooting-login-error'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'settings-category',
    category: 'settings',
    keywords: ['카테고리', '분류', '종류', '분야', '주제'],
    title: '카테고리 설정',
    content: '글의 카테고리를 선택하면 해당 분야에 맞는 톤과 스타일로 글이 생성됩니다.',
    steps: [
      '1. 글 생성 탭에서 "카테고리" 드롭다운 찾기',
      '2. 23개 카테고리 중 선택:',
      '   일반, 뉴스/이슈, 스포츠, 건강, 경제/재테크',
      '   IT 리뷰, 쇼핑 리뷰, 육아/교육, 요리/맛집 등'
    ],
    tips: [
      '💡 카테고리에 맞는 전문 용어와 톤이 적용됩니다',
      '💡 "일반"을 선택하면 범용적인 스타일로 작성',
      '💡 카테고리 선택은 SEO에도 영향을 줍니다'
    ],
    relatedTopics: ['manual-content-generation'],
    lastUpdated: '2024-12-17'
  }
];
