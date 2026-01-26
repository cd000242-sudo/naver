/**
 * 트러블슈팅 지식 데이터
 */

import { KnowledgeItem } from '../types.js';

export const troubleshootingData: KnowledgeItem[] = [
  {
    id: 'troubleshooting-api-error',
    category: 'troubleshooting',
    keywords: ['api', '에러', '오류', '안돼', '실패', '키', '인증'],
    question: 'API 에러가 발생해요',
    title: 'API 오류 해결',
    content: 'API 관련 오류가 발생했을 때 해결 방법입니다.',
    steps: [
      '1. API 키가 올바르게 입력되었는지 확인',
      '2. API 키 앞뒤 공백 제거',
      '3. 일일 사용량 한도/할당량 확인 (Google 정책/계정 설정에 따라 다름)',
      '4. Google AI Studio에서 키 상태 확인',
      '5. 새 API 키 발급 후 재시도'
    ],
    tips: [
      '💡 에러 코드 400: API 키 형식 오류',
      '💡 에러 코드 401: API 키 인증 실패',
      '💡 에러 코드 429: 사용량 한도 초과',
      '💡 에러 코드 503: Gemini 서버 오류 (잠시 후 재시도)'
    ],
    relatedTopics: ['settings-api-key', 'settings-api-guide'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'troubleshooting-generation-fail',
    category: 'troubleshooting',
    keywords: ['생성', '실패', '안돼', '에러', '글', '만들기'],
    question: '글이 생성되지 않아요',
    title: '글 생성 실패 해결',
    content: '글 생성이 실패하는 경우 체크리스트입니다.',
    steps: [
      '1. API 키 설정 확인',
      '2. 인터넷 연결 상태 확인',
      '3. 입력 내용이 너무 짧지 않은지 확인 (최소 10자)',
      '4. 앱 재시작 후 재시도',
      '5. 다른 모델로 변경 후 재시도'
    ],
    tips: [
      '💡 콘텐츠 정책에 위반되는 주제는 생성 불가',
      '💡 너무 긴 입력도 실패할 수 있음 (10,000자 이하 권장)',
      '💡 새벽 시간대(미국 낮)에는 서버가 불안정할 수 있음'
    ],
    relatedTopics: ['troubleshooting-api-error', 'manual-content-generation'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'troubleshooting-login-error',
    category: 'troubleshooting',
    keywords: ['로그인', '실패', '네이버', '계정', '안돼', '비밀번호'],
    question: '네이버 로그인이 안돼요',
    title: '네이버 로그인 오류 해결',
    content: '네이버 로그인 관련 문제 해결 방법입니다.',
    steps: [
      '1. 네이버 아이디/비밀번호 정확히 입력',
      '2. 2차 인증 설정 확인 (OTP 필요)',
      '3. 해외 로그인 차단 해제 (네이버 설정에서)',
      '4. 네이버 앱에서 먼저 로그인 시도',
      '5. 쿠키/캐시 삭제 후 재시도'
    ],
    tips: [
      '💡 자동 로그인 방지가 뜨면 "내가 맞습니다" 선택',
      '💡 VPN 사용 시 로그인 제한될 수 있음',
      '💡 계정 보안 알림이 오면 승인 필요'
    ],
    relatedTopics: ['settings-naver-login', 'manual-publish'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'troubleshooting-publish-fail',
    category: 'troubleshooting',
    keywords: ['발행', '실패', '게시', '안돼', '오류', '업로드'],
    question: '글 발행이 안돼요',
    title: '블로그 발행 실패 해결',
    content: '블로그 발행 오류 해결 방법입니다.',
    steps: [
      '1. 네이버 로그인 상태 확인',
      '2. 글 내용이 있는지 확인',
      '3. 이미지 용량 확인 (개당 10MB 이하)',
      '4. 네이버 블로그 서비스 상태 확인',
      '5. 브라우저 재시작 후 재시도'
    ],
    tips: [
      '💡 네이버 점검 시간: 새벽 4-5시경',
      '💡 이미지가 너무 많으면 실패할 수 있음 (20개 이하 권장)',
      '💡 특수문자나 이모지가 많으면 오류 발생 가능'
    ],
    relatedTopics: ['manual-publish', 'troubleshooting-login-error'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'troubleshooting-slow',
    category: 'troubleshooting',
    keywords: ['느려', '느림', '속도', '오래', '로딩', '시간'],
    question: '앱이 느려요 / 응답이 늦어요',
    title: '속도 문제 해결',
    content: '앱 속도가 느린 경우 해결 방법입니다.',
    steps: [
      '1. 인터넷 연결 속도 확인',
      '2. 다른 프로그램 정리',
      '3. Gemini Flash 모델로 변경 (Pro보다 빠름)',
      '4. 앱 재시작',
      '5. 피크 시간대 피하기 (오후 2-6시)'
    ],
    tips: [
      '💡 글 생성은 보통 15-30초 소요',
      '💡 이미지 생성은 10-20초 소요',
      '💡 한국 아침 시간(미국 저녁)이 가장 안정적'
    ],
    relatedTopics: ['settings-model'],
    lastUpdated: '2024-12-17'
  },
  {
    id: 'troubleshooting-image-fail',
    category: 'troubleshooting',
    keywords: ['이미지', '사진', '실패', '안돼', '생성', '오류'],
    question: '이미지가 생성되지 않아요',
    title: '이미지 생성 실패 해결',
    content: '이미지 생성이 실패하는 경우 해결 방법입니다.',
    steps: [
      '1. API 키가 올바른지 확인',
      '2. 이미지 생성 엔진 변경 (나노 바나나 → Imagen 4)',
      '3. 무료 이미지 검색으로 변경',
      '4. 프롬프트가 정책에 위반되지 않는지 확인',
      '5. 잠시 후 재시도'
    ],
    tips: [
      '💡 사람 얼굴, 유명인은 생성 제한됨',
      '💡 폭력적/선정적 이미지 생성 불가',
      '💡 무료 이미지 검색은 실패 확률 낮음'
    ],
    relatedTopics: ['manual-image', 'settings-image-source'],
    lastUpdated: '2024-12-17'
  }
];
