#!/usr/bin/env node
/**
 * 지식인 황금질문 수집 — 사장님 설계(2026-08-20):
 *   실시간 Q&A  = 지식인 홈 '많이 본 Q&A' 30건 전부 (제목·요약·조회·답변 인라인 실측)
 *   급상승 Q&A  = 직전 스냅샷 대비 조회수가 붙는 속도 상위 (2회차부터 차오른다)
 *   숨은 Q&A    = 전체 최신 목록에서 조회 많고 답변 적은 것 — 많이 본 목록엔 없는 질문
 *
 * 왜: 질문이 곧 키워드다. 많이 본 질문은 지금 다른 판(카페·SNS·검색)에서도 같은
 * 질문이 터지고 있다는 실측 신호라, 답변+링크로 외부유입을 연쇄시킬 수 있다.
 *
 * 전부 무료 페이지 실측이다. 최신 목록에는 조회수가 없어(실측 확인) 숨은 후보만
 * 질문 페이지를 개별로 열어 조회수·답변수를 잰다. 15분 크론에 얹혀 돈다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'spa', 'public', 'data', 'kin-golden.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
/*
 * 숨은 Q&A 판정 — 최신 질문인데 조회는 붙고 답변은 빈 자리.
 *
 * 조회 하한을 100 -> 50 으로 내린 근거(실측 2026-08-22, 후보 118건 전수):
 *   3일 창 · 답변 2 이하에서  조회 100+ = 1건 · 조회 50+ = 3건
 *   30일까지 넓혀도 조회 100+ = 2건
 * 즉 "답변이 안 달린 최신 질문"과 "조회 100+"는 사실상 양립하지 않는다 —
 * 조회가 쌓이려면 시간이 필요하고, 그동안 답변이 붙기 때문이다.
 * 100 을 그대로 두면 판이 비는 게 정상 동작이 된다(실제로 0건이 발행됐다).
 *
 * 절대 조회수는 결국 '나이'를 재는 셈이라, 줄 세우기는 viewsDelta(15분 사이
 * 조회가 붙는 속도)가 맡는다. 하한은 "아무도 안 보는 질문"만 걷어내는 몫이다.
 */
const HIDDEN_MIN_VIEWS = Number(process.env.KIN_HIDDEN_MIN_VIEWS || 50);
const HIDDEN_MAX_ANSWERS = Number(process.env.KIN_HIDDEN_MAX_ANSWERS || 2);
/** 숨은 질문은 며칠 안 된 것이어야 한다(사장님: "무엇보다 최신이어야"). */
const HIDDEN_FRESH_DAYS = Number(process.env.KIN_HIDDEN_FRESH_DAYS || 3);
/*
 * 숨은 후보 개별 실측 상한 — 크론 한 번의 예의 있는 폭.
 * 80 -> 140: 위 실측대로 통과율이 3% 안팎이라, 80건을 열면 기대 산출이 2~3건이다.
 * 판을 채우려면 여는 폭이 통과율을 이겨야 한다(한 건당 약 0.25초).
 */
const HIDDEN_CANDIDATE_CAP = Number(process.env.KIN_HIDDEN_CANDIDATE_CAP || 140);
/** 급상승 판정 — 이 정도는 붙어야 잰 값이지 노이즈가 아니다. */
const RISING_MIN_DELTA = 20;

/*
 * 숨은 질문 시드 사전 — "일반인이 답변 달 수 있는" 생활 수요 어휘 340여 종
 * (사장님 지시 2026-08-20 "시드를 대폭 늘려, 하루에 어차피 할당량 다 못 써").
 * 전체 최신 목록은 초 단위로 흘러 조회가 쌓일 시간이 없는 풀이었다. 검색은
 * 며칠 된 최신을 날짜·답변수와 함께 주므로 조회수만 개별 실측하면 된다.
 * 시간대별로 24개씩 돌려 15분 크론 하루 96회면 전 시드를 여러 번 훑는다.
 */
const HIDDEN_SEEDS = [
  // 소비·쇼핑
  '환불', '취소', '오류', '교환', '반품', '배송', '배송지연', '품절', '재입고', '영수증',
  'AS', '보증기간', '사은품', '쿠폰', '포인트', '멤버십', '구독취소', '자동결제', '결제오류', '무통장입금',
  '중고거래', '당근', '번개장터', '중고나라', '직거래', '택배거래', '가품', '정품확인', '시세', '감정',
  // 금융
  '대출', '전세대출', '신용대출', '주택담보대출', '중도상환', '이자', '연체', '신용점수', '신용카드', '카드한도',
  '보험금', '실비보험', '보험해지', '보험청구', '자동차보험', '연금', '연금저축', 'IRP', '퇴직연금', '청약',
  '주식', '배당금', '공모주', 'ISA', '적금', '예금', '금리', '환전', '해외송금', '계좌이체',
  '세금', '환급', '연말정산', '종합소득세', '부가세', '원천징수', '현금영수증', '증여세', '상속세', '취득세',
  // 주거·부동산
  '전세', '월세', '보증금', '전세사기', '확정일자', '전입신고', '등기', '중개수수료', '임대차', '계약갱신',
  '이사', '이사비용', '입주청소', '관리비', '누수', '곰팡이', '결로', '층간소음', '도배', '장판',
  '인테리어', '리모델링', '싱크대', '화장실공사', '베란다', '방충망', '도어락', '열쇠', '분리수거', '재활용',
  // 고용·노무
  '퇴사', '이직', '퇴직금', '실업급여', '연차', '주휴수당', '최저시급', '야근수당', '4대보험', '근로계약서',
  '알바', '급여', '월급', '체불', '해고', '권고사직', '수습기간', '경력증명서', '이력서', '자기소개서',
  '면접', '재택근무', '프리랜서', '사업자등록', '부업', '투잡', '공무원', '공기업', '계약직', '파견직',
  // 차량·교통
  '자동차', '중고차', '신차', '리스', '장기렌트', '자동차검사', '엔진오일', '타이어', '배터리방전', '블랙박스',
  '면허', '운전면허', '장롱면허', '벌금', '과태료', '범칙금', '속도위반', '주정차위반', '음주운전', '사고처리',
  '접촉사고', '보험처리', '대물', '대인', '합의금', '견인', '폐차', '이륜차', '전기차', '충전',
  // 법률·분쟁
  '사기', '고소', '고발', '내용증명', '소액재판', '민사', '형사', '합의', '변호사비용', '법률구조공단',
  '상속', '유산', '이혼', '위자료', '양육비', '재산분할', '명예훼손', '모욕죄', '손해배상', '임금체불',
  // 건강·의료(전문가답변 전용은 수집 단계에서 걸러진다)
  '병원비', '진단서', '실비청구', '건강검진', '예방접종', '응급실', '약국', '처방전', '도수치료', '물리치료',
  '치과', '임플란트', '교정', '충치', '스케일링', '안과', '라식', '라섹', '피부과', '흉터',
  '다이어트', '단백질', '영양제', '유산소', '헬스', 'PT', '필라테스', '스트레칭', '불면증', '두통',
  // 디지털·통신
  '휴대폰', '요금제', '알뜰폰', '유심', '공기계', '기기변경', '번호이동', '위약금', '와이파이', '공유기',
  '노트북', '프린터', '모니터', '키보드', '컴퓨터조립', '포맷', '백업', '복구', '해킹', '피싱',
  '계정', '비밀번호', '로그인', '탈퇴', '인증', '이메일', '스팸', '차단', '업데이트', '호환',
  // 행정·민원
  '여권', '여권발급', '주민등록', '등본', '초본', '인감', '전입', '정부24', '민원', '증명서',
  '비자', '영주권', '국적', '병역', '예비군', '민방위', '건강보험', '피부양자', '국민연금', '기초연금',
  // 여행·생활
  '항공권', '수하물', '면세점', '환승', '숙소', '예약취소', '캠핑', '등산', '낚시', '자전거',
  '택배', '분실', '세탁', '얼룩', '수선', '옷수선', '드라이클리닝', '세탁기', '냉장고', '에어컨',
  '보일러', '가스레인지', '전자레인지', '청소기', '제습기', '가습기', '곰팡이제거', '벌레', '바퀴벌레', '개미',
  // 교육·자격
  '수강신청', '편입', '검정고시', '자격증', '토익', '토플', '오픽', '컴활', '한국사능력', '학점은행',
  '대학원', '장학금', '학자금대출', '휴학', '복학', '재수', '수능', '내신', '과외', '학원',
  // 반려·취미
  '강아지', '고양이', '반려동물', '중성화', '사료', '펫보험', '분양', '파양', '훈련', '배변',
  '식물', '화분', '텃밭', '베이킹', '요리', '김치', '장아찌', '캠핑용품', '골프', '테니스',
  // 경조사·관계
  '축의금', '부의금', '결혼식', '상견례', '예단', '예물', '돌잔치', '장례', '제사', '명절',
];
/*
 * 회차당 시드 24 -> 36. 통과율이 낮으니 후보 풀부터 넓혀야 한다.
 * 시드는 시간대별로 돌아가며 뽑히므로 전 사전을 여전히 하루에 여러 번 훑는다.
 */
const SEEDS_PER_RUN = Number(process.env.KIN_SEEDS_PER_RUN || 36);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const num = (s) => Number(String(s).replace(/,/g, ''));
const docIdOf = (link) => (String(link).match(/docId=(\d+)/) || [])[1] || String(link);

/** 홈 '많이 본 Q&A' 30건 — 한 페이지에 전부 인라인으로 실려 있다(실측 확인). */
async function fetchRealtime() {
  const html = await fetchText('https://kin.naver.com/');
  const items = [];
  const blocks = html.split(/class="ranking_item /).slice(1);
  for (const block of blocks) {
    const link = (block.match(/href="(\/qna\/detail\.naver[^"]+)"/) || [])[1];
    const title = (block.match(/class="ranking_title">([^<]+)</) || [])[1];
    const summary = (block.match(/class="text">([^<]*)</) || [])[1] || '';
    const views = (block.match(/조회수\s*([\d,]+)/) || [])[1];
    const answers = (block.match(/답변수\s*([\d,]+)/) || [])[1];
    if (!link || !title || views === undefined) continue;
    items.push({
      rank: items.length + 1,
      title: title.trim(),
      link: `https://kin.naver.com${link.replace(/&amp;/g, '&')}`,
      // 요약은 잘라 쓰지 않는다 — 화면이 줄바꿈으로 다 보여준다(사장님 지시).
      summary: summary.trim().slice(0, 300),
      views: num(views),
      answers: answers === undefined ? null : num(answers),
    });
  }
  return items;
}

/**
 * 지식인 검색(sort=date) — 결과 행에 날짜·답변수·전문가답변 배지가 인라인으로
 * 실린다(실측 확인: txt_inline 날짜 · class="hit">답변수 N · ico_pro alt).
 * 그래서 "최신 3일 안 + 답변 ≤2 + 전문가 전용 아님"을 조회수 실측 **전에**
 * 거를 수 있다 — 페이지 개별 실측 예산이 전부 진짜 후보에 쓰인다.
 */
async function fetchSearchCandidates() {
  const startIdx = Math.floor(Date.now() / 3_600_000) % HIDDEN_SEEDS.length;
  const seeds = Array.from({ length: SEEDS_PER_RUN }, (_v, i) => HIDDEN_SEEDS[(startIdx + i) % HIDDEN_SEEDS.length]);
  const freshFloor = Date.now() - HIDDEN_FRESH_DAYS * 24 * 3_600_000;
  const seen = new Set();
  const rows = [];
  for (const seed of seeds) {
    /*
     * 시드 범위의 sort=date 에서는 페이지가 곧 시간축이다 — 1페이지는 몇 분 전,
     * 2~6페이지가 몇 시간~이틀 전(조회가 쌓일 시간이 있었던 최신). 정확도순은
     * 4~14일 전 위주라 3일 필터에 전멸했다(실측: 후보 14건). 날짜·답변수가
     * 행에 실려 있으니 필터는 페이지 실측 전에 끝난다.
     */
    for (let page = 2; page <= 6; page += 1) {
    try {
      const html = await fetchText(`https://kin.naver.com/search/list.naver?query=${encodeURIComponent(seed)}&period=1&sort=date&page=${page}`);
      const items = html.split('<ul class="basic1"')[1] || '';
      for (const block of items.split(/<li>/).slice(1)) {
        const link = (block.match(/href="(https:\/\/kin\.naver\.com\/qna\/detail\.naver[^"]+)"/) || [])[1];
        // 검색어 하이라이트(<b>) 가 제목 중간에 끼므로 태그 너머까지 받아 걷어낸다.
        const title = ((block.match(/_searchListTitleAnchor">([\s\S]*?)<\/a>/) || [])[1] || '').replace(/<[^>]*>/g, '');
        /*
         * 이 날짜는 **질문 작성일이 아니라 답변이 달린 날**이다(사장님 지적
         * 2026-08-22: 목록엔 08.19 인데 들어가 보면 07.21 질문이었다).
         * 그래서 후보를 좁히는 데만 쓰고, 화면에 실을 작성일은 질문 페이지에서
         * 따로 실측해 덮어쓴다(fetchStats.askedAt).
         */
        const date = (block.match(/class="txt_inline">(\d{4})\.(\d{2})\.(\d{2})\./) || []);
        const answers = (block.match(/class="hit">답변수\s*([\d,]+)/) || [])[1];
        // 전문가(변호사·의사…) 답변이 이미 붙은 질문은 뺀다 — 일반인이 답 달 자리가 아니다.
        if (/ico_pro/.test(block)) continue;
        if (!link || !title || !date[1] || answers === undefined) continue;
        if (num(answers) > HIDDEN_MAX_ANSWERS) continue;
        if (Date.parse(`${date[1]}-${date[2]}-${date[3]}`) < freshFloor) continue;
        const cleanLink = link.replace(/&amp;/g, '&');
        const docId = docIdOf(cleanLink);
        if (seen.has(docId)) continue;
        seen.add(docId);
        /*
         * 검색 결과의 설명 조각을 요약으로 싣는다 — 질문 페이지 파싱이 실패해도
         * 답변 작업대가 빈손이 되지 않게 하는 안전망이다(2026-08-20 실사고).
         */
        const summary = ((block.match(/<dd>([\s\S]*?)<\/dd>/g) || [])
          .map((dd) => dd.replace(/<[^>]*>/g, '').trim())
          .find((text) => text.length > 20 && !/^\d{4}\./.test(text)) || '').slice(0, 300);
        rows.push({
          title: title.replace(/<[^>]*>/g, '').trim(),
          link: cleanLink,
          docId,
          /** 답변일(목록값) — 후보 정렬용. 작성일은 질문 페이지 실측으로 덮인다. */
          answeredAt: `${date[1]}.${date[2]}.${date[3]}`,
          answers: num(answers),
          summary,
        });
      }
    } catch (error) {
      console.log(`  !! 검색 "${seed}" ${page}p 실패(건너뜀): ${String(error.message || error).slice(0, 60)}`);
    }
    await sleep(200);
    }
  }
  return rows;
}

/** 한국 날짜 문자열(YYYY.MM.DD) — 수집기는 UTC 러너에서 도는데 화면은 한국 시각이다. */
function kstDateString(ms) {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, '.');
}

/**
 * 질문 작성일 실측.
 *
 * 두 가지 형태로 온다(실측 2026-08-22):
 *   하루 지난 질문 → <span class="blind">작성일</span>2026.07.21
 *   하루 안 질문   → <span class="blind">작성일</span>12시간 전
 * 상대시간 쪽을 못 읽어 후보의 절반이 버려지고 있었는데, 하필 그쪽이
 * 이 레인이 찾는 **가장 최신** 질문들이었다.
 *
 * 값이 붙어 있는 칸만 본다 — 넓게 훑으면 아래 답변의 날짜를 물어 온다.
 */
function parseAskedAt(html) {
  const cell = html.match(/작성일<\/span>\s*([^<]{1,24})/);
  const raw = cell ? cell[1].trim() : '';
  const absolute = raw.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (absolute) return `${absolute[1]}.${absolute[2]}.${absolute[3]}`;
  const relative = raw.match(/(\d+)\s*(초|분|시간|일)\s*전/);
  if (relative) {
    const count = Number(relative[1]);
    const unit = { 초: 1_000, 분: 60_000, 시간: 3_600_000, 일: 86_400_000 }[relative[2]];
    return kstDateString(Date.now() - count * unit);
  }
  if (/방금/.test(raw)) return kstDateString(Date.now());
  return null;
}

/** 질문 페이지에서 조회수·답변수·작성일 실측 — enrich 의 검증된 마크업 패턴 그대로. */
async function fetchStats(link) {
  try {
    const html = await fetchText(link);
    const views = (html.match(/조회수\s*([\d,]+)/) || [])[1];
    const answers = (html.match(/answerCount"\s*>\s*([\d,]+)\s*</) || [])[1];
    return {
      views: views === undefined ? null : num(views),
      answers: answers === undefined ? null : num(answers),
      askedAt: parseAskedAt(html),
    };
  } catch {
    return { views: null, answers: null, askedAt: null };
  }
}

async function main() {
  /** 직전 스냅샷 — 급상승은 두 실측의 차이지, 한 번 보고 지어낼 수 있는 값이 아니다. */
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(DEST, 'utf8')); } catch { /* 첫 회차 */ }

  const realtime = await fetchRealtime();
  // 실시간에도 작성일을 붙인다 — 어제 질문이 순위권이면 그 자체가 신호다.
  for (const item of realtime) {
    const stats = await fetchStats(item.link);
    if (stats.askedAt) item.askedAt = stats.askedAt;
    if (typeof stats.answers === 'number') item.answers = stats.answers;
    await sleep(100);
  }
  console.log(`많이 본 Q&A ${realtime.length}건 (작성일 ${realtime.filter((q) => q.askedAt).length}건 실측)`);

  const realtimeIds = new Set(realtime.map((q) => docIdOf(q.link)));

  // 숨은 후보: 수요 어휘 검색(답변일 3일 안 · 답변 ≤2 · 전문가 제외 선필터)에서 온다.
  const candidates = (await fetchSearchCandidates())
    .filter((q) => !realtimeIds.has(q.docId))
    // 창 안에서는 오래된 것부터 — 조회가 쌓였을 확률이 커 실측 예산이 아깝지 않다.
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
    .slice(0, HIDDEN_CANDIDATE_CAP);
  const hiddenPool = [];
  for (const q of candidates) {
    const stats = await fetchStats(q.link);
    if (stats.views !== null) {
      /*
       * 작성일은 **질문 페이지 실측값**을 쓴다(사장님 지적 2026-08-22).
       * 목록의 날짜는 답변이 달린 날이라, 7월 질문에 8월 답변이 붙으면
       * "8월 질문"으로 둔갑했다 — 조회 많고 답변 없는 최신 자리를 찾는
       * 이 레인의 약속이 그 한 줄로 깨져 있었다.
       * 못 잰 질문은 날짜를 지어내지 않고 버린다.
       */
      if (!stats.askedAt) continue;
      // 답변수는 페이지 실측이 더 최신이다 — 검색 스냅샷 이후 붙었을 수 있다.
      hiddenPool.push({ ...q, askedAt: stats.askedAt, askedAtVerified: true, views: stats.views, answers: stats.answers ?? q.answers });
    }
    await sleep(120);
  }
  /** 실측 작성일 기준 최신 창 — 목록 날짜로 통과한 묵은 질문을 여기서 떨군다. */
  const askedFloorMs = Date.now() - HIDDEN_FRESH_DAYS * 24 * 3_600_000;
  const staleAsked = hiddenPool.filter((q) => Date.parse(q.askedAt.replace(/\./g, '-')) < askedFloorMs).length;
  const freshHidden = hiddenPool
    .filter((q) => Date.parse(q.askedAt.replace(/\./g, '-')) >= askedFloorMs)
    .filter((q) => q.views >= HIDDEN_MIN_VIEWS && typeof q.answers === 'number' && q.answers <= HIDDEN_MAX_ANSWERS)
    .map(({ docId: _docId, answeredAt: _answeredAt, ...rest }) => rest);
  if (staleAsked > 0) console.log(`  작성일 실측으로 걸러낸 묵은 질문 ${staleAsked}건 (목록 날짜는 답변일이었다)`);
  /*
   * 누적 병합 + 생기 실측(사장님 지적 2026-08-20 "조회수가 4만이어도 지금 보는
   * 사람이 없으면 뭔 의미냐"). 조회수 스냅샷을 회차마다 비교해:
   *   viewsDelta = 직전 수집 대비 증가(두 실측의 차이 — 첫 관측은 null)
   *   staleRuns  = 증가 0 이 이어진 회차 수 → 12회(약 3시간) 정체면 탈락
   * "지금 상호작용이 있는" 질문이 앞에 서고, 죽은 질문은 창에서 빠진다.
   */
  const freshFloorMs = Date.now() - HIDDEN_FRESH_DAYS * 24 * 3_600_000;
  const STALE_RUNS_DROP = 12;
  const prevHiddenMap = new Map((prev && Array.isArray(prev.hidden) ? prev.hidden : [])
    .map((q) => [docIdOf(q.link), q]));
  const currentIds = new Set(freshHidden.map((q) => docIdOf(q.link)));
  const withLife = (q) => {
    const before = prevHiddenMap.get(docIdOf(q.link));
    if (!before || typeof before.views !== 'number' || typeof q.views !== 'number') {
      return { ...q, viewsDelta: null, staleRuns: 0 };
    }
    const delta = q.views - before.views;
    return { ...q, viewsDelta: delta, staleRuns: delta > 0 ? 0 : (before.staleRuns || 0) + 1 };
  };
  const carried = (prev && Array.isArray(prev.hidden) ? prev.hidden : [])
    /*
     * 이월도 **작성일이 실측된 것**만 받는다(2026-08-22).
     * 직전 스냅샷에는 답변일이 작성일 자리에 들어간 항목이 섞여 있다 —
     * 표식이 없는 항목은 그 시절 값이므로 한 회차에 걸러 낸다.
     */
    .filter((q) => q.askedAtVerified)
    .filter((q) => q.askedAt && Date.parse(q.askedAt.replace(/\./g, '-')) >= freshFloorMs)
    .filter((q) => !currentIds.has(docIdOf(q.link)));
  const hidden = [...freshHidden.map(withLife), ...carried]
    .filter((q) => (q.staleRuns || 0) < STALE_RUNS_DROP)
    .sort((a, b) => {
      // 지금 조회가 붙는 질문 먼저, 그다음 새 관측(아직 못 잰 것), 정체는 뒤로.
      const ga = typeof a.viewsDelta === 'number' && a.viewsDelta > 0 ? a.viewsDelta : -1;
      const gb = typeof b.viewsDelta === 'number' && b.viewsDelta > 0 ? b.viewsDelta : -1;
      if (ga !== gb) return gb - ga;
      return (b.views ?? 0) - (a.views ?? 0);
    })
    .slice(0, 60);
  console.log(`숨은 후보 ${candidates.length}건 실측 → 신규 ${freshHidden.length} + 이월 ${carried.length} → ${hidden.length}건 (증가 실측 ${hidden.filter((q) => typeof q.viewsDelta === 'number' && q.viewsDelta > 0).length}건)`);

  /*
   * 급상승 — 직전 스냅샷의 같은 질문과 조회수를 비교해 시간당 증가로 환산한다.
   * 직전 값이 없는 질문(새 진입)은 증가율을 잴 수 없으므로 싣지 않는다 —
   * 안 잰 것을 근거로 쓰지 않는 것이 이 보드의 규칙이다.
   */
  const prevMap = new Map();
  if (prev && prev.fetchedAt) {
    for (const list of [prev.realtime, prev.hidden, prev.rising]) {
      for (const q of Array.isArray(list) ? list : []) {
        if (typeof q.views === 'number') prevMap.set(docIdOf(q.link), q.views);
      }
    }
  }
  const minutes = prev && prev.fetchedAt ? Math.max(1, (Date.now() - Date.parse(prev.fetchedAt)) / 60_000) : 0;
  const rising = minutes === 0 ? [] : [...realtime, ...hidden]
    .map((q) => {
      const before = prevMap.get(docIdOf(q.link));
      if (typeof before !== 'number' || typeof q.views !== 'number') return null;
      const delta = q.views - before;
      if (delta < RISING_MIN_DELTA) return null;
      return { title: q.title, link: q.link, views: q.views, answers: q.answers ?? null, viewsDelta: delta, perHour: Math.round((delta * 60) / minutes) };
    })
    .filter(Boolean)
    .sort((a, b) => b.perHour - a.perHour)
    .slice(0, 15);
  console.log(`급상승 ${rising.length}건 (직전 스냅샷 ${prev && prev.fetchedAt ? `${Math.round(minutes)}분 전` : '없음 — 다음 회차부터'})`);

  const out = {
    fetchedAt: new Date().toISOString(),
    prevFetchedAt: (prev && prev.fetchedAt) || null,
    criteria: {
      hidden: `${HIDDEN_FRESH_DAYS}일 안 최신 · 조회 ${HIDDEN_MIN_VIEWS}+ · 답변 ${HIDDEN_MAX_ANSWERS}개 이하 · 전문가답변 제외 · 지금 조회가 붙는 순(15분 스냅샷 비교, 3시간 정체 시 탈락)`,
      rising: `직전 스냅샷 대비 조회 +${RISING_MIN_DELTA} 이상, 시간당 증가 순`,
    },
    realtime,
    rising,
    hidden,
  };
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, JSON.stringify(out, null, 2), 'utf8');
  console.log(`저장: ${DEST}`);
}

main().catch((error) => { console.error('지식인 황금질문 수집 실패:', error); process.exit(1); });
