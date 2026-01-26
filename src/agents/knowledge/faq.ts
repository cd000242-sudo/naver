/**
 * FAQ 지식 데이터
 */

import { KnowledgeItem } from '../types.js';

export const faqData: KnowledgeItem[] = [
  {
    id: 'faq-free',
    category: 'faq',
    keywords: ['무료', '비용', '돈', '유료', '가격', '요금'],
    question: '이 앱은 무료인가요?',
    title: '앱 이용 요금',
    content: '앱 자체는 라이선스가 필요합니다. Gemini API는 Google 정책/계정 설정에 따라 무료 티어 또는 과금이 적용될 수 있습니다.',
    tips: [
      '💡 무료 티어/할당량은 Google 정책과 계정 설정에 따라 달라질 수 있어요',
      '💡 무료 이미지 검색은 완전 무료',
      '💡 유료 API는 더 안정적이고 빠릅니다'
    ],
    relatedTopics: ['settings-api-key'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-safe',
    category: 'faq',
    keywords: ['안전', '보안', '비밀번호', '해킹', '걱정', '개인정보'],
    question: '내 계정 정보가 안전한가요?',
    title: '보안 및 개인정보',
    content: '네이버 로그인은 앱 내 브라우저에서 직접 진행되며, 비밀번호는 저장되지 않습니다.',
    tips: [
      '💡 네이버 비밀번호는 저장되지 않음 (세션만 유지)',
      '💡 API 키는 로컬에 저장',
      '💡 서버로 개인정보가 전송되지 않음'
    ],
    relatedTopics: ['settings-naver-login'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-ai-detection',
    category: 'faq',
    keywords: ['AI', '탐지', '감지', '티', '자연스러운', '봇'],
    question: 'AI가 쓴 글인지 티가 나지 않나요?',
    title: 'AI 탐지 회피',
    content: '다양한 기법을 사용해 자연스러운 글을 생성합니다.',
    tips: [
      '💡 문단 길이 다양화 (1줄~8줄 랜덤)',
      '💡 독자 참여 질문 자동 삽입',
      '💡 감정 표현 및 경험담 포함',
      '💡 발행 후 일부 수정 추천 (더 자연스러움)'
    ],
    relatedTopics: ['manual-content-generation', 'manual-seo-mode'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-category',
    category: 'faq',
    keywords: ['카테고리', '종류', '분야', '주제', '어떤'],
    question: '어떤 주제의 글을 쓸 수 있나요?',
    title: '지원 카테고리',
    content: '23개 카테고리를 지원합니다. 각 카테고리에 최적화된 프롬프트가 적용됩니다.',
    steps: [
      '일반, 뉴스/이슈, 스포츠, 건강',
      '경제/재테크, IT 리뷰, 쇼핑 리뷰, 육아/교육',
      '요리/맛집, 여행, 인테리어/DIY, 반려동물',
      '패션/뷰티, 취미, 부동산, 자동차',
      '책/영화 리뷰, 자기계발, 학습, 게임',
      '사진/영상, 예술/공예, 음악'
    ],
    relatedTopics: ['manual-content-generation', 'settings-category'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-multiple-blogs',
    category: 'faq',
    keywords: ['여러', '다수', '블로그', '계정', '다중'],
    question: '여러 블로그에 발행할 수 있나요?',
    title: '다중 블로그 발행',
    content: '여러 네이버 계정을 등록하고 순환 발행할 수 있습니다.',
    tips: [
      '💡 계정 관리에서 여러 계정 등록 가능',
      '💡 자동 순환 발행 기능 지원',
      '💡 계정별 발행 횟수 관리'
    ],
    relatedTopics: ['settings-naver-login', 'manual-publish'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-how-long',
    category: 'faq',
    keywords: ['시간', '얼마나', '오래', '걸려', '소요'],
    question: '글 생성에 얼마나 걸리나요?',
    title: '글 생성 소요 시간',
    content: '글 생성은 보통 15-30초, 이미지 포함 시 1-2분 정도 소요됩니다.',
    tips: [
      '💡 Flash 모델이 Pro보다 빠름',
      '💡 이미지 개수에 따라 시간 증가',
      '💡 서버 상태에 따라 달라질 수 있음'
    ],
    relatedTopics: ['troubleshooting-slow'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-quality',
    category: 'faq',
    keywords: ['품질', '퀄리티', '좋아', '괜찮아', '수준'],
    question: '글 품질이 괜찮나요?',
    title: '글 품질',
    content: 'Gemini AI를 사용해 고품질 글을 생성합니다. SEO 최적화와 가독성을 고려합니다.',
    tips: [
      '💡 Pro 모델이 더 높은 품질',
      '💡 카테고리 선택으로 전문성 향상',
      '💡 반자동 모드로 수정 후 발행 추천'
    ],
    relatedTopics: ['settings-model', 'manual-content-generation'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'faq-limit',
    category: 'faq',
    keywords: ['제한', '한도', '몇개', '몇번', '횟수'],
    question: '하루에 몇 개까지 발행할 수 있나요?',
    title: '발행 횟수 제한',
    content: 'API 무료 티어 기준 하루 약 50개 글 생성 가능합니다. 네이버 블로그 자체 제한은 별도입니다.',
    tips: [
      '💡 무료 API: 1,500회/일 (글당 약 30회 호출)',
      '💡 네이버는 하루 과도한 발행 시 제한 가능',
      '💡 하루 3-5개 발행 권장 (자연스러운 패턴)'
    ],
    relatedTopics: ['settings-api-key'],
    lastUpdated: '2024-12-17'
  }
];
