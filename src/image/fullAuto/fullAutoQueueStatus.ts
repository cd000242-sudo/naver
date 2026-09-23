/**
 * NAVER FULL AUTO — one line of status per queued article, so the owner can open the app after
 * queueing a day's posts and see at a glance: when, which writing mode, which image strategy, text
 * ready or not, images k/N, and the final state (READY at Naver, held for image review, failed …).
 *
 * Pure; inlined into the renderer bundle, so names carry a fullAuto prefix.
 */
import {
  FULL_AUTO_HEADING_SCOPE_LABELS,
  normalizeFullAutoImageStrategy,
  parseFullAutoHeadingScope,
} from './fullAutoImagePolicy.js';

export interface FullAutoQueueItemLike {
  readonly status?: string;
  readonly publishMode?: string;
  readonly scheduleDate?: string;
  readonly scheduleTime?: string;
  readonly contentMode?: string;
  readonly imageSource?: string;
  readonly imageStrategy?: string;
  readonly headingImageScope?: string;
  readonly fullAutoStage?: string;
  readonly imageProgress?: { readonly done?: number; readonly planned?: number };
  readonly imageReviewReasons?: readonly string[];
}

export type FullAutoQueueTone = 'muted' | 'active' | 'ok' | 'warn' | 'error';

export interface FullAutoQueueRowStatus {
  /** "9/24 18:00", "즉시", "임시저장". */
  readonly when: string;
  readonly contentModeLabel: string;
  readonly imageStrategyLabel: string;
  readonly textStatus: string;
  readonly imageStatus: string;
  readonly finalStatus: string;
  readonly tone: FullAutoQueueTone;
  /** Hover text: the review reasons, when held. */
  readonly detail: string;
}

export const FULL_AUTO_CONTENT_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  seo: 'SEO',
  homefeed: '홈판',
  mate: '메이트',
  affiliate: '제휴',
  business: '업체',
  custom: '커스텀',
});

const FULL_AUTO_STRATEGY_SHORT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'naver-homefeed': '홈판 이미지',
  'user-settings': '내 이미지 설정',
});

/** "9/24 18:00" from the queue's separate date and time fields (or one combined value). */
export function formatFullAutoQueueWhen(item: FullAutoQueueItemLike): string {
  if (item.publishMode === 'draft') return '임시저장';
  if (item.publishMode !== 'schedule') return '즉시';
  const rawDate = String(item.scheduleDate || '').trim();
  const [datePart, embeddedTime] = rawDate.split(/[T ]/u);
  const time = String(item.scheduleTime || embeddedTime || '').trim().slice(0, 5);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(datePart || '');
  const date = match ? `${Number(match[2])}/${Number(match[3])}` : '';
  return [date, time].filter(Boolean).join(' ') || '예약(시간 미정)';
}

function fullAutoQueueImagesOff(item: FullAutoQueueItemLike): boolean {
  return item.imageSource === 'skip';
}

function fullAutoQueueImageStatus(item: FullAutoQueueItemLike): string {
  if (fullAutoQueueImagesOff(item)) return '이미지 없음';
  // The run decided "no images" (text-only / "이미지 없음" setting): say so instead of "예정".
  if (item.imageProgress && Number(item.imageProgress.planned) === 0) return '이미지 없음(설정)';
  const planned = Number(item.imageProgress?.planned) || 0;
  const done = Number(item.imageProgress?.done) || 0;
  if (planned > 0) return `이미지 ${done}/${planned}${done >= planned ? ' ✓' : ''}`;
  const scope = parseFullAutoHeadingScope(item.headingImageScope) ?? 'all';
  return scope === 'none' ? '예정: 썸네일 1' : `예정: 썸네일 1 + 소제목 ${FULL_AUTO_HEADING_SCOPE_LABELS[scope]}`;
}

function fullAutoQueueTextStatus(item: FullAutoQueueItemLike): string {
  if (item.status === 'pending') return '글 대기';
  if (item.status === 'processing' && (!item.fullAutoStage || item.fullAutoStage === 'writing')) return '글 생성 중';
  if (item.status === 'failed' && (!item.fullAutoStage || item.fullAutoStage === 'writing')) return '글 실패';
  return '글 ✓';
}

function fullAutoQueueFinal(item: FullAutoQueueItemLike): { text: string; tone: FullAutoQueueTone } {
  switch (item.status) {
    case 'pending':
      return { text: '대기', tone: 'muted' };
    case 'processing':
      if (item.fullAutoStage === 'images') return { text: '이미지 생성 중', tone: 'active' };
      if (item.fullAutoStage === 'images-ready' || item.fullAutoStage === 'publishing') {
        return { text: item.publishMode === 'schedule' ? '네이버 예약 등록 중' : '발행 중', tone: 'active' };
      }
      return { text: '글 생성 중', tone: 'active' };
    case 'completed':
      return item.publishMode === 'schedule'
        ? { text: 'READY · 네이버 예약 등록 완료', tone: 'ok' }
        : { text: item.publishMode === 'draft' ? '임시저장 완료' : '발행 완료', tone: 'ok' };
    case 'image-review':
      return { text: '이미지 검토 필요 (발행 안 함)', tone: 'warn' };
    case 'uncertain':
      return { text: '결과 확인 필요', tone: 'warn' };
    case 'cancelled':
      return { text: '중지됨', tone: 'muted' };
    default:
      return { text: '실패', tone: 'error' };
  }
}

export function describeFullAutoQueueItem(item: FullAutoQueueItemLike): FullAutoQueueRowStatus {
  const final = fullAutoQueueFinal(item);
  const strategy = normalizeFullAutoImageStrategy(item.imageStrategy);
  return Object.freeze({
    when: formatFullAutoQueueWhen(item),
    contentModeLabel: FULL_AUTO_CONTENT_MODE_LABELS[String(item.contentMode || 'seo')] || String(item.contentMode || 'SEO'),
    imageStrategyLabel: fullAutoQueueImagesOff(item) ? '이미지 없음' : FULL_AUTO_STRATEGY_SHORT_LABELS[strategy],
    textStatus: fullAutoQueueTextStatus(item),
    imageStatus: fullAutoQueueImageStatus(item),
    finalStatus: final.text,
    tone: final.tone,
    detail: (item.imageReviewReasons || []).join('\n'),
  });
}
