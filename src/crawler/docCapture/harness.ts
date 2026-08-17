// src/crawler/docCapture/harness.ts
// 공식문서 캡처 orchestrator — every stage explicit, every stage reported:
//   1) AI source plan (제도·기관·검색어·소제목별 캡처 목표)
//   2) official page discovery (도메인 허용목록: go.kr/gov.kr/korea.kr > or.kr)
//   3) browser segment capture (풀페이지를 뷰포트 슬라이스로, 폰트 차단 없음)
//   4) Vision heading matching (fail-closed)
//   5) per-heading best pick + file save (선정본 + 예비본 전부 저장, 출처 기록)

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { buildDocSourcePlan, findOfficialPages } from './officialSourceFinder.js';
import { captureOfficialPages } from './pageCapturer.js';
import { matchSegmentsToHeadings } from './captureMatcher.js';
import type {
  CapturedSegment,
  DocCaptureOptions,
  DocCapturePayload,
  DocCaptureResult,
  PlacedCapture,
  SegmentVerdict,
} from './types.js';

const LOG = '[DocCaptureHarness]';
const PREVIEW_WIDTH = 360;

function sanitizeFileToken(s: string): string {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'capture';
}

/** Pure: pick the best matched segment per heading (tier → legibility already gated). */
export function pickBestPerHeading(
  segments: readonly CapturedSegment[],
  verdicts: ReadonlyArray<SegmentVerdict | null>,
  headingCount: number,
  tierOf: (sourceUrl: string) => number,
): Map<number, number[]> {
  // heading(1-based) → segment indices sorted best-first
  const byHeading = new Map<number, number[]>();
  verdicts.forEach((v, i) => {
    if (!v || v.headingIndex < 1 || v.headingIndex > headingCount) return;
    if (!v.isOfficial || !v.legible) return;
    const list = byHeading.get(v.headingIndex) ?? [];
    list.push(i);
    byHeading.set(v.headingIndex, list);
  });
  for (const [heading, list] of byHeading) {
    byHeading.set(
      heading,
      [...list].sort((a, b) => {
        const tierDiff = tierOf(segments[a].sourceUrl) - tierOf(segments[b].sourceUrl);
        if (tierDiff !== 0) return tierDiff;
        return segments[a].segmentIndex - segments[b].segmentIndex; // 문서 상단(개요·대상)이 대개 대표컷
      }),
    );
  }
  return byHeading;
}

export async function captureOfficialDocs(
  payload: DocCapturePayload,
  saveDir: string,
  options: DocCaptureOptions = {},
): Promise<DocCaptureResult> {
  const maxPages = options.maxPages ?? 3;
  const maxSegmentsPerPage = options.maxSegmentsPerPage ?? 5;
  const emit = (percent: number, message: string): void => {
    try { options.onProgress?.({ percent: Math.min(100, Math.round(percent)), message }); } catch { /* UI only */ }
  };
  const headingTitles = payload.headings.map((h) => h.title);

  // 1) AI source plan
  emit(4, '🧠 AI가 글의 제도·주관기관을 파악하고 공식 검색어를 설계하는 중...');
  const plan = await buildDocSourcePlan(payload.title, payload.headings, options.geminiApiKey);
  emit(10, plan.aiGenerated
    ? `🧠 제도 파악: "${plan.programName}"${plan.agency ? ` (${plan.agency})` : ''}`
    : '🧠 휴리스틱 검색어 사용 (Gemini 키 없음)');

  // 2) Official page discovery
  emit(14, '🏛️ 정부 공식 페이지(go.kr·korea.kr) 검색 중...');
  const pages = await findOfficialPages(plan, maxPages);
  emit(24, pages.length > 0
    ? `🏛️ 공식 페이지 ${pages.length}개 발굴: ${pages.map((p) => new URL(p.url).hostname).join(', ')}`
    : '⚠️ 공식 페이지를 찾지 못했습니다');
  if (pages.length === 0) {
    return {
      captures: [],
      visitedPages: [],
      stats: { aiPlanUsed: plan.aiGenerated, pagesFound: 0, pagesVisited: 0, segmentsCaptured: 0, segmentsMatched: 0 },
    };
  }

  // 3) Browser segment capture
  const segments = await captureOfficialPages(pages, maxSegmentsPerPage, (pi, url) => {
    emit(26 + (pi / pages.length) * 30, `📸 [${pi + 1}/${pages.length}] ${new URL(url).hostname} 페이지 캡처 중...`);
  });
  emit(58, `📸 총 ${segments.length}컷 캡처 완료 → Vision 소제목 매칭 시작...`);
  if (segments.length === 0 || !options.geminiApiKey) {
    if (!options.geminiApiKey) console.warn(`${LOG} Gemini 키 없음 — 매칭 불가, 캡처 미배치`);
    return {
      captures: [],
      visitedPages: pages,
      stats: { aiPlanUsed: plan.aiGenerated, pagesFound: pages.length, pagesVisited: pages.length, segmentsCaptured: segments.length, segmentsMatched: 0 },
    };
  }

  // 4) Vision matching (fail-closed)
  const verdicts = await matchSegmentsToHeadings(segments, headingTitles, plan.headingGoals, options.geminiApiKey);
  const tierOf = (sourceUrl: string): number => pages.find((p) => p.url === sourceUrl)?.domainTier ?? 9;
  const byHeading = pickBestPerHeading(segments, verdicts, headingTitles.length, tierOf);
  emit(76, `🧩 매칭 완료: ${byHeading.size}개 소제목에 캡처 확보 → 파일 저장 중...`);

  // 5) Save winners (+ runners-up) and build placement entries
  await mkdir(saveDir, { recursive: true });
  const captures: PlacedCapture[] = [];
  let savedCount = 0;
  for (const [headingIdx, segIndices] of byHeading) {
    const headingTitle = headingTitles[headingIdx - 1];
    for (let rank = 0; rank < Math.min(segIndices.length, 3); rank++) {
      const seg = segments[segIndices[rank]];
      const verdict = verdicts[segIndices[rank]]!;
      const fileName = `공식문서-${headingIdx}-${rank + 1}-${sanitizeFileToken(new URL(seg.sourceUrl).hostname)}.png`;
      const filePath = join(saveDir, fileName);
      try {
        await writeFile(filePath, seg.buffer);
        savedCount++;
        if (rank === 0) {
          const preview = await sharp(seg.buffer)
            .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
          captures.push({
            heading: headingTitle,
            filePath,
            previewDataUrl: `data:image/jpeg;base64,${preview.toString('base64')}`,
            sourceUrl: seg.sourceUrl,
            summary: verdict.summary,
          });
        }
      } catch (error) {
        console.warn(`${LOG} ⚠️ 저장 실패 (건너뜀): ${fileName} — ${(error as Error).message}`);
      }
    }
  }

  emit(88, `💾 캡처 ${savedCount}장 저장 (배치 대상 ${captures.length}개 소제목) — 출처 기록 완료`);
  console.log(`${LOG} ✅ 완료: 소제목 ${captures.length}/${headingTitles.length} 캡처 배치, 파일 ${savedCount}장`);
  return {
    captures,
    visitedPages: pages,
    stats: {
      aiPlanUsed: plan.aiGenerated,
      pagesFound: pages.length,
      pagesVisited: pages.length,
      segmentsCaptured: segments.length,
      segmentsMatched: captures.length,
    },
  };
}
