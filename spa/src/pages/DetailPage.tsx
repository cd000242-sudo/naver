import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

/**
 * Better Life Naver 상세 — payment-page/detail.html (2143줄) 마이그.
 * 6 MEGA 섹션 데이터 객체화로 코드 양 축소.
 */

const C = {
    gold: '#FFD700',
    neonGreen: '#00FF88',
    neonBlue: '#00AAFF',
    bgDark: '#0a0a0f',
    bgCard: '#12121a',
    bgSection: '#0d0d14',
    textPrimary: '#fff',
    textSecondary: '#a0a0b0',
    gradGold: 'linear-gradient(135deg, #FFD700, #FFA500, #FF6B00)',
    gradFire: 'linear-gradient(135deg, #f12711, #f5af19)',
};

const PAINS = [
    { icon: '⏰', title: '매일 3시간씩 글쓰기', desc: '키워드 찾고, 글 쓰고, 이미지 만들고... 하루가 다 가도 1~2편이 한계' },
    { icon: '📉', title: '노출이 안 되는 글', desc: '열심히 썼는데 검색에도 안 걸리고, 홈피드에도 안 뜨는 현실' },
    { icon: '🤖', title: 'AI 글 저품질 걱정', desc: 'ChatGPT로 쓰면 AI 티가 나서 저품질 먹을까 불안...' },
    { icon: '💸', title: '수익화가 안 됨', desc: '애드포스트 수익은 하루 커피값, 제휴마케팅은 링크 넣기조차 번거로움' },
    { icon: '😓', title: '다계정 관리 불가능', desc: '블로그 수익을 키우려면 계정이 여러 개 필요한데... 하나도 힘든 걸 여러 개?' },
];

interface MegaSection {
    no: string;
    accent: string;
    bg?: string;
    label: string;
    title: React.ReactNode;
    desc: string;
    tag: string;
    tagColor: string;
    rowTitle: React.ReactNode;
    rowDesc: string;
    bullets: string[];
    image: string;
    subFeatures?: Array<{ icon: string; title: string; desc: string }>;
}

const MEGAS: MegaSection[] = [
    {
        no: '01', accent: C.neonGreen, label: '🧠 MEGA FEATURE 01',
        title: <>10종 AI 엔진이<br /><span style={{ color: C.neonGreen }}>전문가 수준의 글을 대신 써줍니다</span></>,
        desc: 'Gemini 3.1 Flash · GPT-5.4 · Claude 4 Sonnet — 세계 최고 AI를 한 곳에서',
        tag: 'AI POWERED', tagColor: 'rgba(102,126,234,0.2)',
        rowTitle: <>키워드 하나로<br />6,000~10,000자 고품질 글 완성</>,
        rowDesc: '10개 AI 엔진이 네이버 SEO에 최적화된 자연스러운 문체로 글을 생성합니다. AI 탐지를 우회하며, 실시간 SEO 점수까지 표시합니다.',
        bullets: ['키워드 입력 → 10종 AI 엔진 중 최적 선택', '네이버 AI 탐지 우회 자연 문체', 'SEO 점수 · AI 탐지 위험도 실시간 분석', '14개 카테고리별 홈피드 최적화 제목 생성'],
        image: '/images/mega01-hero.jpg',
        subFeatures: [
            { icon: '🎯', title: '4가지 콘텐츠 모드', desc: 'SEO · 홈판 · 쇼핑커넥트 · 사용자정의' },
            { icon: '✍️', title: '11가지 글 톤/스타일', desc: '전문적 · 친근한 · 경험담 등' },
            { icon: '📂', title: '32개 카테고리', desc: '자동 분류 · 최적 키워드 매칭' },
        ],
    },
    {
        no: '02', accent: '#ff6b6b', bg: C.bgDark, label: '🎨 MEGA FEATURE 02',
        title: <>6종 AI 이미지 엔진 +<br /><span style={{ color: '#ff6b6b' }}>Veo 영상 자동 생성</span></>,
        desc: '8가지 스타일 프리셋으로 클릭 한 번이면 블로그 이미지 완성. 저작권 걱정 제로.',
        tag: 'AI IMAGE', tagColor: 'rgba(255,107,107,0.15)',
        rowTitle: <>나노 바나나 프로 · FLUX-2<br />6종 이미지 엔진 탑재</>,
        rowDesc: '글 내용을 분석해 맞춤 이미지를 자동 생성. 한국형 이미지(한국인, 한국 배경) 특화. ImageFX로 무료 1,000장/일 생성 가능.',
        bullets: ['글 내용 분석 → 맞춤 이미지 자동 생성', '8가지 스타일 프리셋 (수채화, 3D, 웹툰 등)', 'Veo AI 영상 자동 변환', '한국형 이미지 (한국인, 한국 배경)'],
        image: '/images/mega02-hero.jpg',
    },
    {
        no: '03', accent: C.neonGreen, label: '🚀 MEGA FEATURE 03',
        title: <>키워드 입력 → AI 글 작성 → 이미지 생성 → 발행<br /><span style={{ color: C.neonGreen }}>전부 자동.</span></>,
        desc: '발행 버튼 한 번이면 끝. 예약 발행, 연속 발행, 다중계정까지.',
        tag: 'FULL AUTO', tagColor: 'rgba(0,255,136,0.15)',
        rowTitle: <>자는 동안에도<br />블로그가 운영됩니다</>,
        rowDesc: '글 작성부터 이미지 삽입, 썸네일 생성, 카테고리 지정, 발행까지 올 자동. 지능형 간격 조절로 봇 탐지도 회피합니다.',
        bullets: ['글 작성 → 이미지 → 발행 완전 자동', '예약 발행 · 연속 발행 · 큐 시스템', '스마트 시간차 발행 (캡차 방지)', '에러 자동 복구 & 재시도'],
        image: '/images/mega03-hero.jpg',
    },
    {
        no: '04', accent: C.neonBlue, bg: C.bgDark, label: '👥 MEGA FEATURE 04',
        title: <>계정 6개를<br /><span style={{ color: C.neonBlue }}>한 화면에서 동시 관리</span></>,
        desc: '계정별 독립 설정, 순차 발행 대기열, 원클릭 일괄 발행. 블로그 팜 운영의 끝판왕.',
        tag: 'MULTI ACCOUNT', tagColor: 'rgba(0,255,136,0.15)',
        rowTitle: <>블로그 수익 스케일<br />무제한 계정 동시 운영</>,
        rowDesc: '한 화면에서 모든 계정을 관리하고, 대기열 시스템으로 순차 자동 발행. 계정별 독립 설정으로 최적화된 운영이 가능합니다.',
        bullets: ['다중 계정 무제한 동시 운영', '계정별 독립 설정 (카테고리, 톤, 스타일)', '순차 발행 대기열 시스템', '한 번에 전체 계정 일괄 발행'],
        image: '/images/mega04-hero.jpg',
    },
    {
        no: '05', accent: C.gold, label: '💰 MEGA FEATURE 05',
        title: <>블로그로 매달 부수입 만드는<br /><span style={{ background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>가장 쉬운 방법</span></>,
        desc: '쿠팡/네이버 제휴링크 자동 삽입 + CTA 배너 자동 생성. 글 쓰면서 돈도 벌기.',
        tag: 'SHOPPING CONNECT', tagColor: 'rgba(255,215,0,0.15)',
        rowTitle: <>제휴 마케팅 자동화<br />CTA 배너까지 원클릭</>,
        rowDesc: '쇼핑 커넥트로 쿠팡/네이버 제휴링크를 자동 삽입하고, 전환율 높은 CTA 배너와 장단점 비교표를 자동 생성합니다.',
        bullets: ['쿠팡 파트너스 · 네이버 제휴링크 자동 삽입', 'CTA 배너 자동 생성 (커스텀 디자인)', '장단점 비교표 자동 삽입', '베스트 상품 수집기 연동'],
        image: '/images/mega05-hero.jpg',
    },
];

const BONUS_CARDS = [
    { img: '/images/thumbnail-generator.png', title: '🎨 썸네일 생성기', desc: '텍스트/배경/스타일 프리셋으로 전문가급 썸네일을 원클릭 생성' },
    { img: '/images/image-editor.png', title: '✂️ 이미지 편집기', desc: '크기 조절, 필터, AI 보정 올인원 편집 도구' },
    { img: '/images/seo-analysis.png', title: '📊 SEO 분석', desc: '실시간 최적화 점수로 검색 1페이지 노출 극대화' },
    { img: '/images/ai-detection.png', title: '🛡️ AI 탐지 검사', desc: '발행 전 AI 글 탐지율 체크로 저품질 방지' },
];

const MODE_SHOWCASES = [
    {
        badge: 'SEO 모드',
        title: '검색 노출을 목표로 글 구조를 자동 설계',
        desc: '키워드, 제목, 소제목, 본문 흐름, 표, 해시태그까지 네이버 검색형 글 구조로 정리합니다.',
        image: '/images/seo-analysis.png',
        points: ['핵심 키워드 중심 제목 생성', '소제목별 본문 흐름 자동 정리', '표·체크리스트 자동 삽입', '이전글 엮기와 해시태그 자동 추가'],
    },
    {
        badge: '홈판 모드',
        title: '홈피드에서 술술 읽히는 대화형 글',
        desc: '딱딱한 설명문이 아니라 공감, 경험, 질문, 짧은 문단 중심으로 읽히는 글을 만듭니다.',
        image: '/images/mega03-hero.jpg',
        points: ['공감형 도입부', '짧은 문단과 자연스러운 줄바꿈', '요체·습니다체 혼합 문체', '모바일 화면 기준 가독성 정리'],
    },
    {
        badge: '네이버 메이트',
        title: '선정 가능성을 높이는 정보형 고품질 구성',
        desc: '근거, 경험, 비교, 요약, Q&A를 조합해 사람이 직접 정리한 듯한 신뢰형 글을 구성합니다.',
        image: '/images/naver-detail/content-format-highlight.png',
        points: ['핵심 문장 하이라이트', '모바일 중심 문단 간격', 'Q&A·한 줄 판정 정리', '표와 체크리스트 기반 설명'],
    },
    {
        badge: '쇼핑커넥트',
        title: '제품 크롤링부터 CTA·수익화 배치까지',
        desc: '상품명, 가격, 대표 이미지, 추가 이미지, 핵심 장단점을 읽고 구매욕구를 만드는 글로 바꿉니다.',
        image: '/images/naver-detail/shopping-result-main.png',
        points: ['대표·추가 이미지 수집', '제품 정보 기반 글 생성', 'CTA 위치 선택', '관련 글·해시태그까지 마무리'],
    },
    {
        badge: '업체홍보·사용자정의',
        title: '홍보글도 티 나지 않게 자연스럽게',
        desc: '업체 정보, 장점, 후기형 흐름을 섞어 광고 느낌은 낮추고 문의 전환은 높이도록 구성합니다.',
        image: '/images/mega05-hero.jpg',
        points: ['업체 장점 자동 정리', '후기형 문체 적용', '전환 CTA 삽입', '사용자 프롬프트 자유 반영'],
    },
];

const RESULT_SHOWCASES = [
    {
        label: '문단·하이라이트',
        image: '/images/naver-detail/content-format-highlight.png',
        title: '문단정리, 하이라이트, 줄바꿈을 한 번에',
        desc: '모바일에서 읽기 쉬운 간격으로 문단을 나누고, 중요한 문장만 자연스럽게 강조합니다.',
    },
    {
        label: '표 자동 삽입',
        image: '/images/naver-detail/auto-table-result.png',
        title: '필요한 글에는 표까지 자동 삽입',
        desc: '비교, 기준, 가격, 체크포인트가 필요한 글은 표로 정리해 독자가 빠르게 이해하게 만듭니다.',
    },
    {
        label: '이전글·해시태그',
        image: '/images/naver-detail/previous-post-hashtags.png',
        title: '이전글 엮기와 해시태그까지 자동 마무리',
        desc: '본문 작성 후 관련 이전글 카드와 해시태그를 붙여 체류 시간과 내부 이동을 함께 챙깁니다.',
    },
];

const SHOPPING_RESULT_IMAGES = [
    { image: '/images/naver-detail/shopping-result-main.png', title: '쇼핑커넥트 본문 결과' },
    { image: '/images/naver-detail/shopping-result-table.png', title: '제품 정보 표 자동 구성' },
    { image: '/images/naver-detail/shopping-result-cta.png', title: 'CTA 배너 배치' },
    { image: '/images/naver-detail/shopping-result-link-card.png', title: '상품 카드 연결' },
    { image: '/images/naver-detail/shopping-result-related-hashtags.png', title: '관련글과 해시태그' },
];

const PROOF_IMAGES = [
    '/images/proof-user/KakaoTalk_20260305_004700252.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_01.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_02.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_03.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_04.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_05.png',
    '/images/proof-user/KakaoTalk_20260305_004700252_06.jpg',
    '/images/proof-user/KakaoTalk_20260305_004700252_07.jpg',
    '/images/proof-user/KakaoTalk_20260309_163736774.jpg',
    '/images/proof-user/KakaoTalk_20260309_164704537.png',
    '/images/proof-user/KakaoTalk_20260310_002438127.png',
];

const AUTOMATION_FEATURES = [
    { title: '반자동 모드', desc: '글은 직접 확인하고, 이미지 삽입과 발행 흐름은 자동화합니다.' },
    { title: '풀오토 모드', desc: '키워드나 URL만 넣으면 글 생성, 이미지 생성, 발행까지 클릭 한 번으로 진행합니다.' },
    { title: '연속발행', desc: '자기 전에 세팅해두면 안전 간격을 두고 여러 글을 순차 발행합니다.' },
    { title: '다중계정 발행', desc: '계정별 설정을 나누고 각 계정에 맞춰 순차 발행할 수 있습니다.' },
];

const IMAGE_WORKFLOW_FEATURES = [
    { title: 'AI 이미지 자동 생성', desc: '소제목과 문맥에 맞는 이미지를 엔진별로 생성하고 미리보기로 확인합니다.' },
    { title: 'AI 이미지 자동 수집', desc: 'URL에서 대표 이미지와 추가 이미지를 수집해 글 흐름에 맞게 사용할 수 있습니다.' },
    { title: '소제목별 원하는 이미지 배치', desc: '특정 소제목에는 사용자가 고른 이미지를 우선 배치해 섞임을 줄입니다.' },
    { title: '썸네일 텍스트 포함', desc: '대표 썸네일에만 제목 텍스트를 넣고 본문 이미지는 깔끔하게 유지합니다.' },
];

const COMPARISON = [
    { feature: 'AI 글 작성', manual: '✕', generic: '일부 지원', ours: '✓ 10종 AI 엔진' },
    { feature: 'AI 이미지 생성', manual: '✕', generic: '✕', ours: '✓ 6종 이미지 엔진' },
    { feature: '완전 자동 발행', manual: '✕', generic: '반자동', ours: '✓ 100% 풀오토' },
    { feature: '다중 계정', manual: '✕', generic: '제한적', ours: '✓ 무제한' },
    { feature: 'AI 탐지 우회', manual: '✕', generic: '✕', ours: '✓ 자동 우회' },
    { feature: '스케줄 발행', manual: '✕', generic: '✓', ours: '✓ 스마트 예약' },
    { feature: '쇼핑 커넥트', manual: '✕', generic: '✕', ours: '✓ 자동 수익화' },
];

const TESTIMONIALS = [
    { avatar: '👩‍💼', name: '김*진', role: '육아맘 블로거 · 6개월차', text: '아이 재우고 새벽에 글 쓰던 게 일상이었는데... 이제 키워드만 넣으면 AI가 다 써줘요. 하루 5편씩 올리니까 방문자가 3배 늘었어요!', result: '📈 월 방문자 3,200 → 12,400' },
    { avatar: '👨‍💻', name: '이*현', role: '직장인 부업 블로거 · 3개월차', text: '퇴근 후 30분이면 다음날 발행할 글 10편을 세팅합니다. 쇼핑 커넥트로 쿠팡 수익도 자동이라 진짜 편해요.', result: '💰 월 부수입 0원 → 87만원' },
    { avatar: '👨‍🔧', name: '박*수', role: '전업 블로거 · 1년차', text: '6개 블로그를 혼자 운영하는 게 가능해졌습니다. 다중계정 기능이 진짜 사기예요. 이전에는 하나도 벅찼는데.', result: '📊 블로그 6개 동시 운영 중' },
];

const PLANS = [
    { name: '스타터', period: '1개월', original: '₩100,000', current: '₩50,000', discount: '8/1 정상가 대비 50% 이벤트', features: ['AI 10종 엔진 풀 액세스', 'AI 이미지 6종 엔진', '풀오토 자동 발행', '다중계정 관리', '쇼핑 커넥트 수익화', '무제한 글 생성'] },
    { name: '프로', period: '3개월 · 월 ₩40,000', original: '₩240,000', current: '₩120,000', discount: '8/1 정상가 대비 50% 이벤트', popular: true, features: ['스타터의 모든 기능', '우선 기술 지원', '신기능 얼리 액세스', '보너스 키워드팩 증정', '카카오 VIP 채널 초대'] },
    { name: '마스터', period: '1년 · 월 ₩33,333', original: '₩800,000', current: '₩400,000', discount: '8/1 정상가 대비 50% 이벤트', features: ['프로의 모든 기능', '전담 매니저 배정', '커스텀 프롬프트 설정', '베타 기능 우선 체험', '블로그 성장 컨설팅'] },
];

const FAQS = [
    { q: '네이버 저품질에 걸리지 않나요?', a: '3단계 안전장치로 저품질을 방지합니다.\n\n① AI 탐지 위험도 실시간 분석 — 발행 전 글의 AI 패턴 점수를 체크하여 위험도가 높으면 자동으로 문체를 재조정합니다.\n② 11가지 문체 스타일 — \'엄마 블로거\', \'직장인 후기\', \'전문가 칼럼\' 등 사람마다 다른 톤으로 작성.\n③ 스마트 시간차 발행 — 글마다 3~15분 랜덤 딜레이 + 일일 발행 쿨다운으로 봇 탐지를 우회.\n\n실제 사용자 2,800명 이상이 6개월 넘게 운영 중이며, 저품질 보고 사례가 없습니다.' },
    { q: 'AI가 작성한 글의 품질은 어떤가요? 직접 수정해야 하나요?', a: '별도 수정 없이 바로 발행 가능한 수준입니다.\n\n· AI 엔진 7종 — GPT-4o, Gemini 2.5 Flash/Pro, Claude 3.5 Sonnet, DeepSeek 등 목적에 맞는 AI 자동 선택\n· 글 분량 — 네이버 SEO 최적 6,000~10,000자\n· 14개 카테고리 전용 프롬프트\n· 자동 구조화 — 서론→본론→마무리 + 소제목 + 이미지 위치까지 자동' },
    { q: '쇼핑 커넥트로 구체적으로 얼마나 벌 수 있나요?', a: '하루 10편 발행 기준, 월 30~100만원이 일반적입니다.\n\n· 수익 구조 — 쿠팡 파트너스(구매액 3~5%) + 네이버 애드포스트 + 스마트스토어 제휴링크 자동 삽입\n· 실제 사례 — 블로그 3개 운영 + 하루 15편 사용자가 월 평균 127만원의 제휴 수익\n\n수익은 블로그 지수, 카테고리, 발행 빈도에 따라 달라질 수 있습니다.' },
    { q: '다계정은 몇 개까지 등록할 수 있나요?', a: '계정 수 제한 없이 무제한 등록 가능합니다.\n\n· 계정별 개별 설정 (카테고리, AI 엔진, 발행 시간대, 문체)\n· 시간대 분산 (A: 오전 9~12시 / B: 오후 2~6시)\n· 통합 대시보드에서 전체 발행 현황 확인' },
    { q: '이미지는 어떻게 생성되나요? 저작권 문제는 없나요?', a: '100% AI 생성 이미지로 저작권 문제가 없습니다.\n\n· 이미지 엔진 6종 — Google Imagen 4, DALL-E 3, ImageFX, Ideogram 등\n· 영상 지원 — Google Veo로 6초 분량 AI 영상\n· 글당 3~8장 자동 삽입\n· 내 PC 이미지 업로드도 가능' },
    { q: '설치 방법이 복잡한가요? 컴퓨터를 잘 못해도 사용할 수 있나요?', a: '설치 파일 1개 다운로드 → 실행 → 끝. 5분이면 시작합니다.\n\n· Windows 전용 데스크톱 앱 — 별도 서버 X, 코딩 지식 X\n· 결제 후 라이선스 키 입력 → 즉시 사용\n· 자동 업데이트 — 매주 1~2회 정기\n· 카카오톡 1:1 지원' },
    { q: '예약 발행(스케줄링)은 어떻게 작동하나요?', a: '캘린더에서 날짜와 시간대만 선택하면 자동으로 발행됩니다.\n\n· 스마트 스케줄러 — 트래픽 높은 시간대(오전 7~9, 오후 12~2, 저녁 8~10) 자동 추천\n· 랜덤 딜레이 — 3~15분\n· 반복 스케줄 — \'매일 오전 9시~오후 6시 사이 5편\' 패턴 저장\n· 실시간 모니터링' },
    { q: '환불 정책은 어떻게 되나요?', a: '구매 후 7일 이내 무조건 전액 환불해 드립니다.\n\n· 환불 방법 — 카카오톡 채널 \'리더스프로\' 1:1 문의\n· 위약금 없음 — 사유 무관\n· 월간 구독 — 다음 달 구독 취소 시 추가 비용 X\n· 연간 구독 — 7일 이후 잔여 금액 환불' },
];

// ─────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    background: C.gradGold, color: '#000', fontSize: 18, fontWeight: 700,
    padding: '18px 40px', borderRadius: 12,
    textDecoration: 'none', transition: 'all 0.3s',
};

function MidCTA({ text, btnLabel = '무료 체험 시작 →' }: { text: string; btnLabel?: string }) {
    return (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,215,0,0.06), rgba(255,107,0,0.04))', borderTop: '1px solid rgba(255,215,0,0.1)', borderBottom: '1px solid rgba(255,215,0,0.1)' }}>
            <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{text}</p>
            <Link to="/pricing" style={btnPrimary}>{btnLabel}</Link>
        </div>
    );
}

function MegaSectionView({ data }: { data: MegaSection }) {
    return (
        <section style={{ padding: '100px 20px', background: data.bg || C.bgSection, position: 'relative', zIndex: 1 }} id={data.no === '01' ? 'features' : undefined}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ color: data.accent, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' }}>{data.label}</div>
                <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, marginBottom: 20, lineHeight: 1.3, textAlign: 'center' }}>{data.title}</h2>
                <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 60px', textAlign: 'center' }}>{data.desc}</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 60, alignItems: 'center', marginBottom: 60 }}>
                    <div>
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1, background: data.tagColor, color: data.accent }}>{data.tag}</span>
                        <h3 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900, marginBottom: 16, lineHeight: 1.3 }}>{data.rowTitle}</h3>
                        <p style={{ color: C.textSecondary, fontSize: 16, marginBottom: 24 }}>{data.rowDesc}</p>
                        <ul style={{ listStyle: 'none' }}>
                            {data.bullets.map((b, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', fontSize: 15, color: C.textSecondary }}>
                                    <span style={{ color: C.neonGreen, fontWeight: 700, flexShrink: 0 }}>✓</span>{b}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <img src={data.image} alt={typeof data.rowTitle === 'string' ? data.rowTitle : 'feature'} loading="lazy" style={{ width: '100%', display: 'block' }} />
                        </div>
                    </div>
                </div>

                {data.subFeatures && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
                        {data.subFeatures.map((sf, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                                <div style={{ fontSize: 28, marginBottom: 8 }}>{sf.icon}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{sf.title}</div>
                                <div style={{ fontSize: 12, color: C.textSecondary }}>{sf.desc}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

const sectionBase = (background: string): React.CSSProperties => ({
    padding: '100px 20px',
    background,
    position: 'relative',
    zIndex: 1,
});

function SectionHeading({ label, title, desc }: { label: string; title: React.ReactNode; desc?: string }) {
    return (
        <div style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 54px' }}>
            <div style={{ color: C.gold, fontWeight: 800, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>{label}</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, lineHeight: 1.25, marginBottom: desc ? 18 : 0 }}>{title}</h2>
            {desc && <p style={{ color: C.textSecondary, fontSize: 18, lineHeight: 1.8 }}>{desc}</p>}
        </div>
    );
}

function ModeShowcaseSection() {
    return (
        <section style={sectionBase(C.bgDark)} id="features">
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <SectionHeading
                    label="MODE BY MODE"
                    title={<>앱 모드별로 결과가 다르게 나옵니다</>}
                    desc="SEO, 홈판, 네이버 메이트, 쇼핑커넥트, 업체홍보까지 목적에 맞는 글 구조와 이미지 흐름을 자동으로 맞춥니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
                    {MODE_SHOWCASES.map((mode, i) => (
                        <article key={mode.badge} style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.22)' }}>
                            <div style={{ height: 190, background: '#08080c', overflow: 'hidden' }}>
                                <img src={mode.image} alt={`${mode.badge} 결과 예시`} loading={i < 2 ? 'eager' : 'lazy'} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                            </div>
                            <div style={{ padding: 24 }}>
                                <span style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 999, background: 'rgba(255,215,0,0.12)', color: C.gold, fontSize: 12, fontWeight: 900, marginBottom: 14 }}>{mode.badge}</span>
                                <h3 style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.35, marginBottom: 10 }}>{mode.title}</h3>
                                <p style={{ color: C.textSecondary, fontSize: 14, lineHeight: 1.75, marginBottom: 16 }}>{mode.desc}</p>
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                                    {mode.points.map(point => (
                                        <li key={point} style={{ display: 'flex', gap: 9, color: '#d8d8e8', fontSize: 13, lineHeight: 1.55 }}>
                                            <span style={{ color: C.neonGreen, fontWeight: 900, flexShrink: 0 }}>✓</span>
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function ResultShowcaseSection() {
    return (
        <section style={sectionBase(C.bgSection)}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
                <SectionHeading
                    label="REAL WRITING RESULT"
                    title={<>글 결과물은 이렇게 정리됩니다</>}
                    desc="문단정리, 핵심문장 하이라이트, 표, 이전글 엮기, 해시태그가 발행 흐름 안에서 같이 들어가도록 구성합니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
                    {RESULT_SHOWCASES.map((result, i) => (
                        <article key={result.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, overflow: 'hidden' }}>
                            <div style={{ height: i === 0 ? 300 : 260, overflow: 'hidden', background: '#f5f5f5' }}>
                                <img src={result.image} alt={result.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                            </div>
                            <div style={{ padding: 24 }}>
                                <div style={{ color: C.neonGreen, fontSize: 12, fontWeight: 900, letterSpacing: 2, marginBottom: 10 }}>{result.label}</div>
                                <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>{result.title}</h3>
                                <p style={{ color: C.textSecondary, lineHeight: 1.75, fontSize: 14 }}>{result.desc}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function AutomationSection() {
    return (
        <section style={sectionBase(C.bgDark)}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
                <SectionHeading
                    label="PUBLISHING FLOW"
                    title={<>클릭 한 번부터 자기 전 세팅까지</>}
                    desc="반자동, 풀오토, 연속발행, 다중계정 발행까지 사용자의 운영 방식에 맞춰 글과 이미지를 끝까지 처리합니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                    {AUTOMATION_FEATURES.map((feature, i) => (
                        <article key={feature.title} style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.08), rgba(255,255,255,0.04))', border: '1px solid rgba(255,215,0,0.18)', borderRadius: 18, padding: 26 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.gradGold, color: '#111', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{i + 1}</div>
                            <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 9 }}>{feature.title}</h3>
                            <p style={{ color: C.textSecondary, fontSize: 14, lineHeight: 1.75 }}>{feature.desc}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function ImageWorkflowSection() {
    return (
        <section style={sectionBase(C.bgSection)}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
                <SectionHeading
                    label="IMAGE MANAGEMENT"
                    title={<>이미지도 글 흐름에 맞게 자동 관리합니다</>}
                    desc="이미지 생성, 이미지 수집, 소제목별 이미지 배치, 썸네일 텍스트 포함까지 한 화면에서 관리할 수 있습니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 26, alignItems: 'stretch' }} className="detail-image-workflow-grid">
                    <div style={{ borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#060609' }}>
                        <img src="/images/mega02-hero.jpg" alt="AI 이미지 생성과 이미지 관리 탭" loading="lazy" style={{ width: '100%', height: '100%', minHeight: 360, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                    </div>
                    <div style={{ display: 'grid', gap: 16 }}>
                        {IMAGE_WORKFLOW_FEATURES.map(feature => (
                            <article key={feature.title} style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: 24 }}>
                                <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 9 }}>{feature.title}</h3>
                                <p style={{ color: C.textSecondary, fontSize: 14, lineHeight: 1.75 }}>{feature.desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ShoppingConnectResultSection() {
    return (
        <section style={sectionBase(C.bgDark)}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
                <SectionHeading
                    label="SHOPPING CONNECT RESULT"
                    title={<>쇼핑커넥트 글은 판매 흐름까지 챙깁니다</>}
                    desc="제품 이미지, 제품 정보 표, CTA, 상품 카드, 관련글과 해시태그까지 구매 전환에 필요한 구성을 자동으로 붙입니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                    {SHOPPING_RESULT_IMAGES.map(item => (
                        <article key={item.title} style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, overflow: 'hidden' }}>
                            <img src={item.image} alt={item.title} loading="lazy" style={{ width: '100%', height: 260, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                            <div style={{ padding: '16px 18px', fontWeight: 800 }}>{item.title}</div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function ProofSection() {
    return (
        <section style={sectionBase(C.bgSection)}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
                <SectionHeading
                    label="USER PROOF"
                    title={<>사용자들이 실제로 결과를 만들고 있습니다</>}
                    desc="조회수와 수익 인증 이미지를 그대로 모아, 단순 기능 소개가 아니라 실제 운영 결과를 함께 보여줍니다."
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                    {PROOF_IMAGES.map((image, i) => (
                        <div key={image} style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', minHeight: 180 }}>
                            <img src={image} alt={`구매자 수익 인증 ${i + 1}`} loading="lazy" style={{ width: '100%', height: 220, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                        </div>
                    ))}
                </div>
                <p style={{ color: C.textSecondary, textAlign: 'center', marginTop: 24, fontSize: 14 }}>매일 업데이트되는 로직과 네이버 화면 변경 모니터링으로, 사용자가 막히는 지점을 계속 개선합니다.</p>
            </div>
        </section>
    );
}

function DetailPage() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = 'Better Life Naver — AI 글인데 사람이 쓴 것처럼';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const img = target?.closest?.('.detail-page-root img') as HTMLImageElement | null;
            if (!img || img.closest('nav') || img.dataset.zoomDisabled === 'true') return;
            setLightboxImage({
                src: img.currentSrc || img.src,
                alt: img.alt || '이미지 크게 보기',
            });
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setLightboxImage(null);
        };
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    return (
        <div className="detail-page-root" style={{ background: C.bgDark, color: C.textPrimary }}>
            <ParticlesCanvas />

            {/* HERO */}
            <section style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 20px 60px', position: 'relative', overflow: 'hidden', zIndex: 1 }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.15, filter: 'blur(2px)', zIndex: 0 }}>
                    <video autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
                        <source src="/images/hero-demo.mp4" type="video/mp4" />
                    </video>
                </div>
                <div style={{ maxWidth: 900, position: 'relative', zIndex: 2 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', padding: '8px 20px', borderRadius: 50, fontSize: 14, color: C.gold, marginBottom: 30 }}>
                        <span>🏆</span><span>네이버가 못 잡는 AI 글, Leaders Pro로</span>
                    </div>
                    <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.2, marginBottom: 20 }}>
                        AI 글인데<br />
                        <span style={{ background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>사람이 쓴 것처럼.</span>
                    </h1>
                    <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', color: C.textSecondary, marginBottom: 40 }}>
                        AuthGR 방어 · 이미지 일관성 검증 · 저품질 회피 알고리즘<br />
                        — 자동인데 노출에 강한 네이버 블로그 자동화 도구.
                    </p>
                    <Link to="/pricing" style={btnPrimary}>지금 시작하기 →</Link>
                    <div style={{ marginTop: 40, fontSize: 14, color: C.textSecondary, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span><strong style={{ color: '#fff' }}>2,847명</strong> 사용 중</span>
                        <span>·</span>
                        <span><strong style={{ color: '#fff' }}>158,430편</strong> 발행</span>
                        <span>·</span>
                        <span><strong style={{ color: '#fff' }}>4.9★</strong> 만족도</span>
                    </div>
                </div>
            </section>

            {/* PAIN */}
            <section style={{ padding: '100px 20px', background: C.bgSection, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>😰 이런 고민, 있으시죠?</div>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, marginBottom: 20 }}>블로그 운영, <span style={{ color: '#ff6b6b' }}>이렇게 힘들어야 하나요?</span></h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 50 }}>
                        {PAINS.map((p, i) => (
                            <div key={i} style={{ background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 16, padding: 32, textAlign: 'left' }}>
                                <div style={{ fontSize: 40, marginBottom: 16 }}>{p.icon}</div>
                                <h3 style={{ fontSize: 20, marginBottom: 10, color: '#ff6b6b' }}>{p.title}</h3>
                                <p style={{ color: C.textSecondary, fontSize: 15 }}>{p.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 12, padding: 24, marginTop: 40 }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#ff8888' }}>하루 3시간 × 30일 = <span style={{ fontSize: 32, color: '#ff6b6b' }}>90시간</span></p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#ff8888' }}>시급 1만원이면 매달 <span style={{ fontSize: 32, color: '#ff6b6b' }}>90만원</span>을 블로그에 버리는 셈입니다</p>
                    </div>
                </div>
            </section>

            <ModeShowcaseSection />
            <ResultShowcaseSection />
            <MidCTA text="문단정리, 하이라이트, 표, 이전글 엮기까지 한 번에 끝냅니다" />
            <AutomationSection />
            <ImageWorkflowSection />
            <ShoppingConnectResultSection />
            <MidCTA text="쇼핑커넥트 글도 클릭 한 번으로 수익화 흐름까지 배치합니다" btnLabel="요금제 확인 →" />
            <ProofSection />

            {/* COMPARISON */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <div style={{ color: C.neonBlue, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>📊 비교</div>
                        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900 }}>왜 Better Life Naver인가?</h2>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', maxWidth: 900, margin: '0 auto' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,215,0,0.12)' }}>
                                    <th style={{ padding: '18px 24px', textAlign: 'left' }}>기능</th>
                                    <th style={{ padding: '18px 24px' }}>수동 블로깅</th>
                                    <th style={{ padding: '18px 24px' }}>타사 자동화</th>
                                    <th style={{ padding: '18px 24px', color: C.gold }}>Better Life Naver</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON.map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 500 }}>{row.feature}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: row.manual.startsWith('✕') ? '#ff4444' : '#ffaa00' }}>{row.manual}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: row.generic.startsWith('✕') ? '#ff4444' : '#ffaa00' }}>{row.generic}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,215,0,0.10)', color: C.neonGreen }}>{row.ours}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* AUTHORITY BAR */}
            <div style={{ textAlign: 'center', padding: '30px 20px', background: 'rgba(255,215,0,0.10)', borderTop: '1px solid rgba(255,215,0,0.25)', position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 16, color: C.textSecondary, fontWeight: 500 }}><strong style={{ color: C.gold }}>대한민국 블로그 자동화 1위</strong> — 2,847명이 선택한 이유가 있습니다</p>
            </div>

            {/* TESTIMONIALS */}
            <section style={{ padding: '100px 20px', background: C.bgSection, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <div style={{ color: C.gold, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>💬 실제 사용 후기</div>
                        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900 }}>사용자들의 <span style={{ background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>리얼 후기</span></h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                        {TESTIMONIALS.map((t, i) => (
                            <div key={i} style={{ background: C.bgCard, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 32 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{t.avatar}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                                        <div style={{ fontSize: 13, color: C.textSecondary }}>{t.role}</div>
                                    </div>
                                </div>
                                <div style={{ color: C.gold, fontSize: 18, marginBottom: 12 }}>★★★★★</div>
                                <p style={{ fontSize: 15, color: C.textSecondary, lineHeight: 1.8, marginBottom: 16 }}>"{t.text}"</p>
                                <div style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.gold, fontWeight: 600 }}>{t.result}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <MidCTA text="🚀 지금 시작하면 내일부터 블로그가 자동으로 돌아갑니다" btnLabel="요금제 보기 →" />

            {/* PRICING */}
            <section style={{ padding: '100px 20px', background: C.bgDark, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ color: C.gold, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>💎 PRICING</div>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, marginBottom: 20 }}>블로그 외주 1편 가격으로<br /><span style={{ background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>한 달을 자동화하세요</span></h2>
                    <p style={{ color: C.textSecondary, fontSize: 16, maxWidth: 600, margin: '0 auto 20px' }}>매달 블로그 외주비 90만원 vs Better Life Naver 월 5만원</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', padding: '8px 20px', borderRadius: 50, fontSize: 14, color: C.neonGreen, marginBottom: 48 }}>💡 하루 커피 한잔 값으로 블로그 완전 자동화</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0, maxWidth: 1100, margin: '0 auto' }}>
                        {PLANS.map((p, i) => (
                            <div key={i} style={{
                                background: p.popular ? 'linear-gradient(180deg, rgba(255,215,0,0.06), rgba(18,18,26,0.9))' : 'rgba(18,18,26,0.7)',
                                backdropFilter: 'blur(20px)',
                                border: p.popular ? `2px solid ${C.gold}55` : '1px solid rgba(255,255,255,0.06)',
                                padding: '40px 28px 36px', position: 'relative',
                                transform: p.popular ? 'scale(1.06)' : 'none',
                                zIndex: p.popular ? 3 : 1,
                                borderRadius: i === 0 ? '24px 0 0 24px' : i === PLANS.length - 1 ? '0 24px 24px 0' : 0,
                            }}>
                                {p.popular && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: C.gradFire, padding: '6px 28px', borderRadius: 50, fontSize: 13, fontWeight: 800, color: '#fff' }}>🔥 가장 인기</div>}
                                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{p.name}</h3>
                                <div style={{ fontSize: 16, color: C.textSecondary, textDecoration: 'line-through', opacity: 0.6 }}>{p.original}</div>
                                <div style={{ fontSize: 44, fontWeight: 900, background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>{p.current}</div>
                                <div style={{ fontSize: 14, color: C.neonGreen, fontWeight: 600, marginTop: 4 }}>{p.period}</div>
                                <div style={{ display: 'inline-block', background: 'rgba(255,107,0,0.15)', color: '#ff8c00', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, marginTop: 8 }}>{p.discount}</div>
                                <ul style={{ listStyle: 'none', textAlign: 'left', margin: '20px 0 28px', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {p.features.map((f, j) => (
                                        <li key={j} style={{ padding: '7px 0', fontSize: 14, color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ color: C.neonGreen, fontWeight: 700 }}>✓</span>{f}
                                        </li>
                                    ))}
                                </ul>
                                <Link to="/pricing" style={{
                                    display: 'block', width: '100%', padding: 16, borderRadius: 14,
                                    background: p.popular ? C.gradGold : 'rgba(255,255,255,0.06)',
                                    color: p.popular ? '#000' : '#fff',
                                    fontWeight: 700, fontSize: p.popular ? 17 : 16,
                                    textAlign: 'center', textDecoration: 'none',
                                    border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.12)',
                                }}>{p.popular ? '가장 인기 있는 플랜 →' : '시작하기 →'}</Link>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 36, textAlign: 'center' }}>
                        <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg, rgba(45,27,105,0.6), rgba(26,26,46,0.8))', backdropFilter: 'blur(12px)', border: `1px solid ${C.gold}`, borderRadius: 16, padding: '18px 48px', fontSize: 16, fontWeight: 700, color: C.gold, textDecoration: 'none' }}>🏆 올인원 1년 ₩400,000 — 8/1 정상가 800,000원 전 이벤트가</Link>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginTop: 40, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        {[
                            ['🔒', '안전한 결제'], ['🔄', '7일 전액 환불'], ['💬', '카카오 즉시 지원'], ['🔑', '즉시 활성화'],
                        ].map(([icon, txt], i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSecondary, fontSize: 14 }}>
                                <span style={{ fontSize: 18 }}>{icon}</span>{txt}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* GUARANTEE */}
            <section style={{ padding: '80px 20px', background: C.bgSection, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 700, margin: '0 auto', background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 20, padding: 40 }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🛡️</div>
                    <h3 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>100% 만족 보장</h3>
                    <p style={{ color: C.textSecondary, fontSize: 16 }}>
                        사용 후 만족하지 않으면 7일 이내 전액 환불.<br />
                        질문이나 어려움이 있으면 카카오톡 1:1 문의로 즉시 도움을 드립니다.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <div style={{ color: C.neonBlue, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>❓ 자주 묻는 질문</div>
                        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900 }}>궁금한 점이 있으신가요?</h2>
                    </div>
                    {FAQS.map((f, i) => (
                        <div key={i} style={{ background: C.bgCard, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                            <button
                                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                style={{ width: '100%', padding: '20px 28px', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: C.textPrimary, fontWeight: 700, fontSize: 16, textAlign: 'left' }}
                            >
                                <span>{f.q}</span>
                                <span style={{ fontSize: 22, color: C.gold, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s' }}>+</span>
                            </button>
                            <div style={{ maxHeight: openFaq === i ? 800 : 0, overflow: 'hidden', padding: openFaq === i ? '0 28px 24px' : '0 28px', transition: 'all 0.4s ease', color: C.textSecondary }}>
                                <p style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{f.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* FINAL CTA */}
            <section style={{ padding: '120px 20px', background: C.bgDark, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, marginBottom: 20, lineHeight: 1.3 }}>지금 시작하면<br /><span style={{ background: C.gradGold, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>내일부터 블로그가 자동으로 돌아갑니다</span></h2>
                    <p style={{ fontSize: 18, color: C.textSecondary, marginBottom: 40, maxWidth: 600, margin: '0 auto 40px' }}>
                        더 이상 글쓰기에 시간 낭비하지 마세요.<br />
                        Better Life Naver가 당신의 블로그 수익을 바꿔드립니다.
                    </p>
                    <Link to="/pricing" style={{ ...btnPrimary, fontSize: 20, padding: '20px 48px' }}>지금 시작하기 →</Link>
                    <p style={{ marginTop: 16, color: '#888', fontSize: 14 }}>🔒 안전한 결제 · 7일 환불 보장 · 카카오톡 즉시 지원</p>
                </div>
            </section>

            {lightboxImage && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={lightboxImage.alt}
                    onClick={() => setLightboxImage(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2147483000,
                        background: 'rgba(0,0,0,0.88)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '72px 22px 28px',
                        cursor: 'zoom-out',
                    }}
                >
                    <button
                        type="button"
                        aria-label="큰 이미지 닫기"
                        data-lightbox-close="true"
                        onClick={(event) => {
                            event.stopPropagation();
                            setLightboxImage(null);
                        }}
                        style={{
                            position: 'fixed',
                            top: 22,
                            right: 24,
                            width: 46,
                            height: 46,
                            borderRadius: '50%',
                            border: '1px solid rgba(255,255,255,0.26)',
                            background: 'rgba(20,20,28,0.78)',
                            color: '#fff',
                            fontSize: 30,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2147483001,
                        }}
                    >
                        ×
                    </button>
                    <img
                        src={lightboxImage.src}
                        alt={lightboxImage.alt}
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            maxWidth: '92vw',
                            maxHeight: '88vh',
                            objectFit: 'contain',
                            borderRadius: 14,
                            boxShadow: '0 22px 90px rgba(0,0,0,0.58)',
                            background: '#111',
                            cursor: 'default',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

export default DetailPage;
