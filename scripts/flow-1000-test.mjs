// Flow 1000회 마라톤 테스트 러너
// 목적: Flow(나노바나나2) 엔진의 1000장 연속 생성 안정성 / 속도 / 품질 실측
//
// 사용법:
//   1) 파일럿 모드 (16장 = 2개 글):
//      node scripts/flow-1000-test.mjs --pilot
//
//   2) 풀 마라톤 (1000장 = 125개 글, 약 3~4시간):
//      node scripts/flow-1000-test.mjs
//
//   3) 중단 후 재개:
//      node scripts/flow-1000-test.mjs --resume
//
// 출력:
//   flow-test-output/
//     post-001-청년월세지원금/
//       img-1.png ... img-8.png
//     post-002-...
//     progress.json   (체크포인트, 통계)
//     summary.json    (완료 시 최종 보고서)
//     run.log         (사람이 읽을 수 있는 로그)

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync, appendFileSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── 설정 ───────────────────────────────
const PROFILE_DIR = path.join(process.env.APPDATA || os.homedir(), 'Better Life Naver', 'flow-chromium-profile');
const OUTPUT_DIR = path.resolve('flow-test-output');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json');
const SUMMARY_FILE = path.join(OUTPUT_DIR, 'summary.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'run.log');
const FLOW_URL = 'https://labs.google/fx/tools/flow';
const FLOW_PROJECT_IMAGE_LIMIT = 9;

const args = process.argv.slice(2);
const IS_PILOT = args.includes('--pilot');
const IS_RESUME = args.includes('--resume');
const TOTAL_POSTS = IS_PILOT ? 2 : 125;
const IMAGES_PER_POST = 8;
const TARGET_TOTAL = TOTAL_POSTS * IMAGES_PER_POST;

// ─── 지원금 관련 125개 글 + 8개 이미지 프롬프트 생성 ───
const SUBSIDY_CATEGORIES = [
  { ko: '청년 월세 지원금', en: 'youth monthly rent subsidy' },
  { ko: '청년 도약 계좌', en: 'youth jump savings account' },
  { ko: '청년 내일 채움 공제', en: 'youth tomorrow fill exemption' },
  { ko: '구직 활동 지원금', en: 'job seeking activity subsidy' },
  { ko: '실업 급여', en: 'unemployment benefits' },
  { ko: '국민 취업 지원 제도', en: 'national employment support system' },
  { ko: '소상공인 정책 자금', en: 'small business policy funding' },
  { ko: '소상공인 손실 보상금', en: 'small business loss compensation' },
  { ko: '자영업자 고용 보험', en: 'self-employed unemployment insurance' },
  { ko: '출산 장려금', en: 'childbirth incentive' },
  { ko: '첫 만남 이용권', en: 'first encounter voucher' },
  { ko: '아동 수당', en: 'child allowance' },
  { ko: '부모 급여', en: 'parental benefit' },
  { ko: '양육 수당', en: 'childcare allowance' },
  { ko: '신혼부부 전세 자금 대출', en: 'newlywed housing loan' },
  { ko: '디딤돌 대출', en: 'didimdol housing loan' },
  { ko: '버팀목 전세 대출', en: 'beotimmok rental loan' },
  { ko: '주택 청약 종합 저축', en: 'housing subscription savings' },
  { ko: '주거 급여', en: 'housing benefit' },
  { ko: '에너지 바우처', en: 'energy voucher' },
  { ko: '문화 누리 카드', en: 'culture nuri card' },
  { ko: '평생 교육 바우처', en: 'lifelong education voucher' },
  { ko: '국가 장학금', en: 'national scholarship' },
  { ko: '학자금 대출', en: 'student loan' },
  { ko: '근로 장학금', en: 'work study scholarship' },
  { ko: '농업 직불금', en: 'agricultural direct payment' },
  { ko: '청년 농업인 영농 정착 지원금', en: 'young farmer settlement subsidy' },
  { ko: '귀농 귀촌 지원금', en: 'return to farm subsidy' },
  { ko: '어업인 직불금', en: 'fisherman direct payment' },
  { ko: '기초 생활 수급비', en: 'basic livelihood security' },
  { ko: '의료 급여', en: 'medical benefit' },
  { ko: '본인 부담 상한제', en: 'medical co-payment cap' },
  { ko: '재난 적정성 의료비 지원', en: 'disaster medical cost support' },
  { ko: '난임 시술비 지원', en: 'infertility treatment subsidy' },
  { ko: '산모 신생아 건강 관리 지원', en: 'maternal newborn care support' },
  { ko: '노인 기초 연금', en: 'senior basic pension' },
  { ko: '노인 일자리 사업', en: 'senior employment program' },
  { ko: '장기 요양 보험', en: 'long-term care insurance' },
  { ko: '치매 가족 휴가제', en: 'dementia family leave' },
  { ko: '장애인 활동 지원', en: 'disabled activity support' },
  { ko: '장애 수당', en: 'disability allowance' },
  { ko: '한부모 가족 지원금', en: 'single parent family subsidy' },
  { ko: '미혼모 양육비 지원', en: 'unmarried mother childcare support' },
  { ko: '북한 이탈 주민 정착 지원', en: 'north korean defector settlement' },
  { ko: '다문화 가족 지원', en: 'multicultural family support' },
  { ko: '예비 창업자 지원금', en: 'aspiring entrepreneur subsidy' },
  { ko: '창업 도약 패키지', en: 'startup leap package' },
  { ko: '청년 창업 사관학교', en: 'youth startup academy' },
  { ko: '경력 단절 여성 재취업 지원', en: 'career-break women reemployment' },
  { ko: '직업 훈련 생계비 대부', en: 'vocational training living expense loan' },
  { ko: '내일 배움 카드', en: 'tomorrow learning card' },
  { ko: '국민 내일 배움 카드', en: 'national tomorrow learning card' },
  { ko: '근로 장려금', en: 'earned income tax credit' },
  { ko: '자녀 장려금', en: 'child tax credit' },
  { ko: '에너지 효율 가전 환급', en: 'energy efficient appliance rebate' },
  { ko: '전기차 구매 보조금', en: 'electric vehicle purchase subsidy' },
  { ko: '수소차 보조금', en: 'hydrogen vehicle subsidy' },
  { ko: '태양광 설치 보조금', en: 'solar panel installation subsidy' },
  { ko: '저소득층 통신비 감면', en: 'low income telecom fee reduction' },
  { ko: '난방비 지원', en: 'heating cost support' },
  { ko: '냉방비 지원', en: 'cooling cost support' },
  { ko: '코로나 손실 보상금', en: 'covid loss compensation' },
  { ko: '소상공인 새출발 기금', en: 'small business fresh start fund' },
  { ko: '햇살론 유스', en: 'sunshine youth loan' },
  { ko: '햇살론 15', en: 'sunshine 15 loan' },
  { ko: '미소 금융', en: 'microfinance' },
  { ko: '서민 금융 통합 지원 센터', en: 'inclusive finance center' },
  { ko: '신용 회복 지원', en: 'credit recovery support' },
  { ko: '개인 회생 비용 지원', en: 'personal rehabilitation cost support' },
  { ko: '청년 우대형 청약 통장', en: 'youth preferred subscription account' },
  { ko: '청년 전용 보증부 월세 대출', en: 'youth-only guaranteed monthly rent loan' },
  { ko: '청년 임차 보증금 대출', en: 'youth rental deposit loan' },
  { ko: '주거 안정 자금', en: 'housing stability fund' },
  { ko: '에너지 캐시백', en: 'energy cashback' },
  { ko: '농지 연금', en: 'farmland pension' },
  { ko: '주택 연금', en: 'housing pension' },
  { ko: '국민 연금 임의 가입', en: 'national pension voluntary enrollment' },
  { ko: '퇴직 연금 IRP', en: 'retirement pension IRP' },
  { ko: '일하는 여성의 집 입주', en: 'working womens house residence' },
  { ko: '청소년 한부모 자립 지원', en: 'teenage single parent self-reliance' },
  { ko: '아이 돌봄 서비스', en: 'child care service' },
  { ko: '시간제 보육 지원', en: 'part-time childcare support' },
  { ko: '직장 어린이집 설치 지원', en: 'workplace daycare establishment support' },
  { ko: '청년 마음 건강 바우처', en: 'youth mental health voucher' },
  { ko: '저소득층 안경 지원', en: 'low income eyeglasses support' },
  { ko: '치과 임플란트 건강 보험 적용', en: 'dental implant insurance coverage' },
  { ko: '난청 보청기 지원', en: 'hearing aid support' },
  { ko: '재난 피해 주민 생계비', en: 'disaster victim living expense' },
  { ko: '풍수해 보험 가입 지원', en: 'flood insurance enrollment support' },
  { ko: '귀농인 농업 창업 자금', en: 'returning farmer agricultural startup fund' },
  { ko: '청년 농촌 정착 지원금', en: 'youth rural settlement subsidy' },
  { ko: '농업인 안전 보험', en: 'farmer safety insurance' },
  { ko: '소득 보전 직불제', en: 'income preservation direct payment' },
  { ko: '쌀 변동 직불금', en: 'rice variable direct payment' },
  { ko: '경관 보전 직불제', en: 'landscape conservation direct payment' },
  { ko: '친환경 농업 직불금', en: 'eco-friendly agriculture direct payment' },
  { ko: '저소득층 김장 김치 지원', en: 'low income kimjang kimchi support' },
  { ko: '독거 노인 우유 급식', en: 'elderly milk feeding program' },
  { ko: '저소득층 도시락 배달', en: 'low income lunchbox delivery' },
  { ko: '난방 연료 지원', en: 'heating fuel support' },
  { ko: '전기료 할인', en: 'electricity bill discount' },
  { ko: '도시 가스 요금 경감', en: 'city gas fee reduction' },
  { ko: '저소득층 정수기 지원', en: 'low income water purifier support' },
  { ko: '취약 계층 PC 지원', en: 'vulnerable group PC support' },
  { ko: '저소득층 인터넷 요금 할인', en: 'low income internet fee discount' },
  { ko: '대중 교통 정기권 지원', en: 'public transit pass support' },
  { ko: '저소득층 학원비 지원', en: 'low income academy fee support' },
  { ko: '아동 발달 지원 바우처', en: 'child development support voucher' },
  { ko: '발달 재활 서비스', en: 'developmental rehabilitation service' },
  { ko: '청소년 방과후 아카데미', en: 'youth after school academy' },
  { ko: '드림 스타트', en: 'dream start program' },
  { ko: '아동 통합 서비스 지원', en: 'integrated child service support' },
  { ko: '저소득층 분유 기저귀 지원', en: 'low income formula diaper support' },
  { ko: '국민 행복 카드', en: 'national happiness card' },
  { ko: '바우처 택시', en: 'voucher taxi' },
  { ko: '장애인 콜택시', en: 'disabled call taxi' },
  { ko: '노인 무임 승차', en: 'senior free transit' },
  { ko: '경로 우대 카드', en: 'senior preferred card' },
  { ko: '국가 유공자 보상', en: 'national merit compensation' },
  { ko: '독립 유공자 후손 지원', en: 'independence merit descendant support' },
  { ko: '참전 명예 수당', en: 'veteran honor allowance' },
  { ko: '6.25 전몰 군경 유족 지원', en: 'korean war veteran family support' },
  { ko: '재해 위로금', en: 'disaster condolence money' },
  { ko: '농어촌 마을 안전 보험', en: 'rural village safety insurance' },
  { ko: '저소득층 자녀 대학 등록금', en: 'low income child university tuition' },
  { ko: '특기자 장학금', en: 'talent scholarship' },
  { ko: '예술 영재 지원', en: 'arts gifted support' },
  { ko: '체육 영재 장학금', en: 'sports gifted scholarship' },
  { ko: '학부모 학습 지원', en: 'parent learning support' },
];

const SCENE_TEMPLATES = [
  (cat) => `Hero shot: a hopeful Korean person learning about ${cat.en}, modern office desk with laptop showing application form, warm lighting, professional photography, no text overlay`,
  (cat) => `Wide angle: Korean family at home reviewing eligibility for ${cat.en}, cozy living room, natural daylight from window, candid moment, no text`,
  (cat) => `Close-up: hands holding a smartphone showing the ${cat.en} mobile application screen, blurred background, shallow depth of field, no readable text`,
  (cat) => `Documents and forms scene related to ${cat.en} on a wooden desk, fountain pen, calculator, clean composition, top-down view, no text`,
  (cat) => `Government building exterior representing ${cat.en} support office, blue sky, korean architectural elements, clean professional photography, no text`,
  (cat) => `Happy outcome: Korean couple smiling after receiving approval notification for ${cat.en}, warm bright bedroom or kitchen, lifestyle photography, no text`,
  (cat) => `Computer screen workspace showing the online application portal for ${cat.en}, clean desk setup, plant in corner, modern minimalist office, no text`,
  (cat) => `Conceptual illustration: a friendly support consultant helping a Korean person with ${cat.en} paperwork at a counter, soft lighting, helpful atmosphere, no text`,
];

function generatePosts() {
  const posts = [];
  const safeName = (s) => s.replace(/[<>:"/\\|?*]/g, '_').slice(0, 40);
  for (let i = 0; i < TOTAL_POSTS; i++) {
    const cat = SUBSIDY_CATEGORIES[i % SUBSIDY_CATEGORIES.length];
    const id = String(i + 1).padStart(3, '0');
    const folder = `post-${id}-${safeName(cat.ko)}`;
    const prompts = SCENE_TEMPLATES.map((t, idx) => ({
      idx: idx + 1,
      heading: `${cat.ko} - 장면 ${idx + 1}`,
      prompt: t(cat),
    }));
    posts.push({ id, folder, category: cat, prompts });
  }
  return posts;
}

// ─── 로깅 헬퍼 ──────────────────────────
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function log(line) {
  const stamp = new Date().toISOString();
  const out = `[${stamp}] ${line}`;
  console.log(out);
  try { appendFileSync(LOG_FILE, out + '\n'); } catch {}
}

// ─── 체크포인트 ────────────────────────
async function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) {
    return { completedPosts: [], stats: { totalImages: 0, totalMs: 0, failures: 0, duplicates: 0, similar: 0, tinyBuffers: 0 }, sha256Set: [], aHashSet: [] };
  }
  const raw = await fs.readFile(PROGRESS_FILE, 'utf-8');
  return JSON.parse(raw);
}
async function saveProgress(p) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Flow 자동화 ───────────────────────
let cachedPage = null;
let cachedContext = null;

async function ensureFlowPage() {
  if (cachedPage && cachedContext) {
    try { await cachedPage.title(); return cachedPage; } catch {}
  }
  log('🌐 Flow 브라우저 컨텍스트 시작 (프로필: ' + PROFILE_DIR + ')');
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=-10000,-10000',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 60000,
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  // 1차: API 세션 체크 (정확)
  let session = null;
  try {
    session = await page.evaluate(async () => {
      try {
        const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    });
  } catch {}

  if (session?.user) {
    log('✅ Flow 로그인 확인됨 (API): ' + (session.user.email || session.user.name || 'unknown'));
  } else {
    // 2차: Google OAuth 쿠키 폴백 — Flow 랜딩 페이지에서도 동작
    const cookies = await ctx.cookies();
    const hasGoogleSession = cookies.some(
      (c) => /^(SID|HSID|SSID|SAPISID|__Secure-1PSID|__Secure-3PSID)$/.test(c.name)
    );
    if (!hasGoogleSession) {
      log('❌ Google 쿠키 없음. node scripts/flow-login-once.mjs 먼저 실행 후 재시도.');
      process.exit(2);
    }
    log('⚠️ Flow API 세션 미감지지만 Google OAuth 쿠키 존재 — 시도 진행');
    // Flow 랜딩 페이지에서 "Create with Flow" 버튼 자동 클릭 시도
    try {
      const createBtn = page.locator('button, a').filter({ hasText: /create with flow|get started|시작하기|create/i }).first();
      if (await createBtn.count() > 0 && await createBtn.isVisible().catch(() => false)) {
        await createBtn.click({ timeout: 5000 });
        log('🔘 "Create with Flow" 버튼 자동 클릭');
        await page.waitForTimeout(3000);
      }
    } catch (e) {
      log(`⚠️ 자동 클릭 실패 (무시): ${e.message?.substring(0, 80)}`);
    }
  }
  cachedContext = ctx;
  cachedPage = page;
  return page;
}

// 새 프로젝트 강제 (9장 한도 도달 시)
async function startNewProject(page) {
  log('🆕 새 프로젝트 생성');
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  // Flow UI에서 새 프로젝트 버튼 클릭 (실제 셀렉터는 Flow 내부 구조에 따름)
  // 안전책: 페이지 전체 새로고침으로 새 세션 시작
}

async function countImages(page) {
  return await page.evaluate(() => {
    return document.querySelectorAll('img[src*="flowMedia"], img[src*="media.getMediaUrlRedirect"]').length;
  }).catch(() => 0);
}

async function submitPrompt(page, prompt) {
  // Flow의 프롬프트 입력창 찾기
  const inputSel = 'textarea, [contenteditable="true"]';
  const inputs = await page.locator(inputSel).all();
  let target = null;
  for (const inp of inputs) {
    const visible = await inp.isVisible().catch(() => false);
    if (visible) { target = inp; break; }
  }
  if (!target) throw new Error('PROMPT_INPUT_NOT_FOUND');
  await target.click();
  await page.waitForTimeout(200);
  // Clear + type
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await target.type(prompt, { delay: 5 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
}

async function waitForNewImage(page, prevCount, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cur = await countImages(page);
    if (cur > prevCount) {
      const url = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img[src*="flowMedia"], img[src*="media.getMediaUrlRedirect"]'));
        const last = imgs[imgs.length - 1];
        return last?.src || null;
      });
      if (url) return url;
    }
    await page.waitForTimeout(800);
  }
  throw new Error('IMAGE_GENERATION_TIMEOUT');
}

async function downloadImage(page, url) {
  const buf = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ab = await r.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  }, url);
  return Buffer.from(buf);
}

async function computeSha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// ─── 메인 ───────────────────────────────
async function main() {
  ensureDir(OUTPUT_DIR);
  log(`🚀 Flow 마라톤 시작 — TOTAL_POSTS=${TOTAL_POSTS}, IMAGES_PER_POST=${IMAGES_PER_POST}, TARGET=${TARGET_TOTAL}장`);
  log(`MODE: ${IS_PILOT ? '🧪 파일럿' : IS_RESUME ? '↩️ 재개' : '🏁 풀 마라톤'}`);

  const progress = await loadProgress();
  const completedSet = new Set(progress.completedPosts);
  const sha256Set = new Set(progress.sha256Set || []);
  log(`📊 기존 진행: ${completedSet.size}/${TOTAL_POSTS} 글 완료, ${progress.stats.totalImages}장 누적`);

  const posts = generatePosts();
  const page = await ensureFlowPage();

  const startedAt = Date.now();
  let projectImageCount = await countImages(page);
  log(`📂 현재 프로젝트 이미지 ${projectImageCount}장`);

  for (const post of posts) {
    if (completedSet.has(post.id)) {
      log(`⏭️  글 ${post.id} 건너뜀 (이미 완료)`);
      continue;
    }
    const postDir = path.join(OUTPUT_DIR, post.folder);
    ensureDir(postDir);
    log(`\n━━━ 글 ${post.id} (${post.category.ko}) 시작 ━━━`);

    const postStart = Date.now();
    let postSuccess = 0;
    let postFail = 0;

    for (const p of post.prompts) {
      if (projectImageCount >= FLOW_PROJECT_IMAGE_LIMIT - 1) {
        await startNewProject(page);
        projectImageCount = 0;
      }
      const imgStart = Date.now();
      try {
        const prevCount = await countImages(page);
        await submitPrompt(page, p.prompt);
        const url = await waitForNewImage(page, prevCount, 90_000);
        const buf = await downloadImage(page, url);
        const elapsed = Date.now() - imgStart;
        const sha = await computeSha256(buf);
        const isDup = sha256Set.has(sha);
        sha256Set.add(sha);

        if (buf.length < 1024) progress.stats.tinyBuffers++;
        if (isDup) progress.stats.duplicates++;

        const filePath = path.join(postDir, `img-${p.idx}.png`);
        await fs.writeFile(filePath, buf);
        progress.stats.totalImages++;
        progress.stats.totalMs += elapsed;
        projectImageCount++;
        postSuccess++;
        log(`  ✅ ${p.idx}/8 ${(elapsed / 1000).toFixed(1)}s ${(buf.length / 1024).toFixed(0)}KB${isDup ? ' [DUP]' : ''}`);
      } catch (err) {
        progress.stats.failures++;
        postFail++;
        log(`  ❌ ${p.idx}/8 실패: ${err.message?.substring(0, 100)}`);
      }
    }

    if (postSuccess === IMAGES_PER_POST) completedSet.add(post.id);
    progress.completedPosts = Array.from(completedSet);
    progress.sha256Set = Array.from(sha256Set);
    await saveProgress(progress);

    const postElapsed = ((Date.now() - postStart) / 1000).toFixed(1);
    log(`📊 글 ${post.id} 완료: ${postSuccess}/8 성공, ${postFail} 실패, ${postElapsed}s`);

    // 50장마다 세션 재확인
    if (progress.stats.totalImages % 50 === 0) {
      const ok = await page.evaluate(async () => {
        try {
          const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
          return res.ok;
        } catch { return false; }
      });
      if (!ok) {
        log('⚠️ 세션 만료 의심 — 페이지 새로고침');
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
    }
  }

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summary = {
    finishedAt: new Date().toISOString(),
    totalPosts: completedSet.size,
    targetPosts: TOTAL_POSTS,
    totalImages: progress.stats.totalImages,
    targetImages: TARGET_TOTAL,
    totalElapsedSec: totalElapsed,
    averageImageMs: progress.stats.totalImages > 0 ? Math.round(progress.stats.totalMs / progress.stats.totalImages) : 0,
    failures: progress.stats.failures,
    duplicates: progress.stats.duplicates,
    tinyBuffers: progress.stats.tinyBuffers,
    successRate: ((progress.stats.totalImages / TARGET_TOTAL) * 100).toFixed(1) + '%',
  };
  await fs.writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  log('\n━━━ 🏁 마라톤 종료 ━━━');
  log(JSON.stringify(summary, null, 2));

  try { await cachedContext?.close(); } catch {}
}

main().catch((err) => {
  log(`💥 치명적 에러: ${err.message}`);
  console.error(err);
  process.exit(1);
});
