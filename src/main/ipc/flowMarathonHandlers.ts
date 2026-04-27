// Flow 1000회 마라톤 IPC 핸들러
// F12 콘솔에서 호출:
//   const r = await window.api.runFlowMarathon({ posts: 125, perPost: 8 });
//
// 이벤트 수신 (선택):
//   window.api.onFlowMarathonProgress((evt) => console.log(evt));

import { ipcMain, app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';
import { generateWithFlow, purgeFlowSessionStorage, recreateFlowContext } from '../../image/flowGenerator.js';
import type { ImageRequestItem } from '../../image/types.js';

const SUBSIDY_CATEGORIES: Array<{ ko: string; en: string }> = [
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

const SCENE_TEMPLATES: Array<(en: string) => string> = [
  (en) => `Hero shot: a hopeful Korean person learning about ${en}, modern office desk with laptop showing application form, warm lighting, professional photography, no text overlay`,
  (en) => `Wide angle: Korean family at home reviewing eligibility for ${en}, cozy living room, natural daylight from window, candid moment, no text`,
  (en) => `Close-up: hands holding a smartphone showing the ${en} mobile application screen, blurred background, shallow depth of field, no readable text`,
  (en) => `Documents and forms scene related to ${en} on a wooden desk, fountain pen, calculator, clean composition, top-down view, no text`,
  (en) => `Government building exterior representing ${en} support office, blue sky, korean architectural elements, clean professional photography, no text`,
  (en) => `Happy outcome: Korean couple smiling after receiving approval notification for ${en}, warm bright bedroom or kitchen, lifestyle photography, no text`,
  (en) => `Computer screen workspace showing the online application portal for ${en}, clean desk setup, plant in corner, modern minimalist office, no text`,
  (en) => `Conceptual illustration: a friendly support consultant helping a Korean person with ${en} paperwork at a counter, soft lighting, helpful atmosphere, no text`,
];

interface MarathonOptions {
  posts?: number;          // 글 수 (기본 125)
  perPost?: number;        // 글당 이미지 수 (기본 8)
  outputDir?: string;      // 출력 폴더 (기본 userData/flow-marathon)
  startFrom?: number;      // 시작 글 인덱스 (재개용, 0-based)
  // v2.7.14: 평소 단발 발행과 동일 조건으로 검증하기 위한 옵션
  skipColdStartCleanup?: boolean;  // true면 storage purge + 더미 컨텍스트 정리 생략
  skipForceFreshContext?: boolean; // true면 매 글 시작 시 recreateFlowContext 안 함
}

interface MarathonProgress {
  postIdx: number;
  postTotal: number;
  imageIdx: number;
  imageTotal: number;
  postFolder: string;
  category: string;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  totalElapsedMs: number;
}

function safeName(s: string): string {
  return s.replace(/[<>:"/\\|?*\s]/g, '_').slice(0, 40);
}

function broadcast(channel: string, payload: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, payload); } catch { /* ignore */ }
  }
}

let __marathonRunning = false;
let __marathonStopFlag = false;

export function registerFlowMarathonHandlers(): void {
  ipcMain.handle('flow:stop-marathon', async () => {
    __marathonStopFlag = true;
    return { ok: true, message: '중단 신호 전송됨 (현재 글 완료 후 중단)' };
  });

  ipcMain.handle('flow:run-marathon', async (_evt, opts: MarathonOptions = {}) => {
    if (__marathonRunning) return { ok: false, error: '이미 실행 중입니다' };
    __marathonRunning = true;
    __marathonStopFlag = false;

    const totalPosts = Math.min(opts.posts ?? 125, SUBSIDY_CATEGORIES.length);
    const perPost = opts.perPost ?? 8;
    const startFrom = Math.max(0, opts.startFrom ?? 0);
    const baseDir = opts.outputDir
      ? path.resolve(opts.outputDir)
      : path.join(app.getPath('userData'), 'flow-marathon');

    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
    const progressFile = path.join(baseDir, 'progress.json');
    const summaryFile = path.join(baseDir, 'summary.json');

    const stats = {
      startedAt: new Date().toISOString(),
      finishedAt: '',
      totalPosts,
      perPost,
      targetImages: totalPosts * perPost,
      completedPosts: 0,
      totalImages: 0,
      failures: 0,
      duplicates: 0,
      tinyBuffers: 0,
      totalMs: 0,
      sha256Set: [] as string[],
    };

    const sha256Set = new Set<string>();
    const usedImageHashes = new Set<string>();
    const usedImageAHashes: bigint[] = [];

    console.log(`[FlowMarathon] 🚀 시작: ${totalPosts}글 × ${perPost}장 = ${totalPosts * perPost}장 (출력: ${baseDir})`);
    broadcast('flow-marathon:started', { totalPosts, perPost, baseDir });

    // v2.7.13 콜드 스타트 정리 (storage + 더미 컨텍스트 2회) — 옵션으로 끌 수 있음
    if (startFrom === 0 && !opts.skipColdStartCleanup) {
      try {
        await purgeFlowSessionStorage();
        console.log('[FlowMarathon] 1/3 ✅ storage purge 완료');
        await recreateFlowContext();
        console.log('[FlowMarathon] 2/3 ✅ 더미 글 0 컨텍스트 (잔재 정리)');
        await new Promise((r) => setTimeout(r, 1000));
        await recreateFlowContext();
        console.log('[FlowMarathon] 3/3 ✅ 글 1 시작 환경 = 글 2와 동일 조건 보장');
      } catch (purgeErr) {
        console.warn('[FlowMarathon] 콜드 스타트 정리 실패 (계속 진행):', (purgeErr as Error).message);
      }
    } else if (opts.skipColdStartCleanup) {
      console.log('[FlowMarathon] ⏭️ 콜드 스타트 정리 생략 (skipColdStartCleanup=true) — 평소 단발 발행 환경 검증 모드');
    }

    const startedAt = Date.now();

    try {
      for (let i = startFrom; i < totalPosts; i++) {
        if (__marathonStopFlag) {
          console.log('[FlowMarathon] ⏹️ 중단 신호 감지 — 종료');
          break;
        }
        const cat = SUBSIDY_CATEGORIES[i];
        const id = String(i + 1).padStart(3, '0');
        const folder = `post-${id}-${safeName(cat.ko)}`;
        const postDir = path.join(baseDir, folder);
        if (!existsSync(postDir)) mkdirSync(postDir, { recursive: true });

        const items: ImageRequestItem[] = SCENE_TEMPLATES.slice(0, perPost).map((t, idx) => ({
          heading: `${cat.ko} - 장면 ${idx + 1}`,
          prompt: t(cat.en),
          englishPrompt: t(cat.en),
          isThumbnail: idx === 0,
        }));

        const postStart = Date.now();
        let postSuccess = 0;
        let postFail = 0;
        let postDup = 0;

        try {
          const generated = await generateWithFlow(
            items,
            cat.ko,
            `marathon-${id}`,
            (img, idx, total) => {
              broadcast('flow-marathon:image-generated', {
                postIdx: i + 1, postTotal: totalPosts,
                imageIdx: idx + 1, imageTotal: total,
                heading: img.heading,
              });
            },
            usedImageHashes,
            usedImageAHashes,
            { forceFreshContext: !opts.skipForceFreshContext }, // v2.7.14: 평소 단발 발행 환경 검증 시 false
          );

          for (let g = 0; g < generated.length; g++) {
            const img = generated[g];
            try {
              const srcPath = (img as any).filePath;
              if (!srcPath || !existsSync(srcPath)) {
                postFail++;
                stats.failures++;
                continue;
              }
              const buf = await fs.readFile(srcPath);
              if (buf.length < 1024) stats.tinyBuffers++;
              const sha = createHash('sha256').update(buf).digest('hex');
              if (sha256Set.has(sha)) { postDup++; stats.duplicates++; }
              sha256Set.add(sha);

              const ext = srcPath.toLowerCase().endsWith('.jpg') || srcPath.toLowerCase().endsWith('.jpeg')
                ? 'jpg' : (srcPath.toLowerCase().endsWith('.webp') ? 'webp' : 'png');
              const destPath = path.join(postDir, `img-${g + 1}.${ext}`);
              copyFileSync(srcPath, destPath);
              postSuccess++;
              stats.totalImages++;
            } catch (copyErr) {
              postFail++;
              stats.failures++;
              console.warn(`[FlowMarathon] 이미지 복사 실패 [${i + 1}/${g + 1}]:`, (copyErr as Error).message);
            }
          }

          const postElapsed = Date.now() - postStart;
          stats.totalMs += postElapsed;
          if (postSuccess > 0) stats.completedPosts++;

          console.log(`[FlowMarathon] 글 ${id} 완료: ${postSuccess}/${perPost} 성공, ${postFail} 실패, ${postDup} 중복, ${(postElapsed / 1000).toFixed(1)}s`);
          const progress: MarathonProgress = {
            postIdx: i + 1, postTotal: totalPosts,
            imageIdx: postSuccess, imageTotal: perPost,
            postFolder: folder, category: cat.ko,
            successCount: postSuccess, failureCount: postFail, duplicateCount: postDup,
            totalElapsedMs: Date.now() - startedAt,
          };
          broadcast('flow-marathon:post-completed', progress);

          // 체크포인트 저장
          await fs.writeFile(progressFile, JSON.stringify({ ...stats, sha256Set: Array.from(sha256Set) }, null, 2));
        } catch (postErr) {
          postFail = perPost - postSuccess;
          stats.failures += postFail;
          console.error(`[FlowMarathon] ❌ 글 ${id} 치명적 실패:`, (postErr as Error).message);
          broadcast('flow-marathon:post-failed', {
            postIdx: i + 1, postTotal: totalPosts,
            error: (postErr as Error).message,
          });
        }
      }
    } finally {
      __marathonRunning = false;
      stats.finishedAt = new Date().toISOString();
      stats.sha256Set = Array.from(sha256Set);
      const summary = {
        ...stats,
        totalElapsedSec: ((Date.now() - startedAt) / 1000).toFixed(1),
        averageImageMs: stats.totalImages > 0 ? Math.round(stats.totalMs / stats.totalImages) : 0,
        successRate: ((stats.totalImages / stats.targetImages) * 100).toFixed(1) + '%',
        baseDir,
      };
      await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
      console.log('[FlowMarathon] 🏁 종료:', JSON.stringify({
        completedPosts: summary.completedPosts,
        totalImages: summary.totalImages,
        failures: summary.failures,
        duplicates: summary.duplicates,
        totalElapsedSec: summary.totalElapsedSec,
        averageImageMs: summary.averageImageMs,
        successRate: summary.successRate,
      }));
      broadcast('flow-marathon:finished', summary);
      return summary;
    }
  });
}
