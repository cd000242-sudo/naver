import { describe, expect, it } from 'vitest';
import {
  gstopClassify,
  gstopFormatResetClock,
  gstopParseResetAt,
  gstopSummaryLine,
} from '../generationStop/stopClassifier.js';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

describe('멈춤 분류기: 어떤 실패가 막는 창을 띄우는가', () => {
  it('코덱스 한도 초과(원인 코드 rate_limited)는 limit 으로 분류하고 초기화 시각을 읽는다', () => {
    const info = gstopClassify(
      new Error('Codex 생성 실패 (원인 코드: rate_limited). Codex 구독 한도 소진 — 11월 24일 15시 20분 이후 다시 시도'),
      'image', 'codex-image', NOW,
    );
    expect(info?.cause).toBe('limit');
    expect(info?.stage).toBe('image');
    expect(info?.resetAt).toBe(new Date(2026, 10, 24, 15, 20).getTime());
  });

  it('영문 usage limit 문구도 초기화 시각을 읽는다', () => {
    const info = gstopClassify("You've hit your usage limit. try again at Nov 24th, 2026 3:20 PM.", 'text', 'agent-codex', NOW);
    expect(info?.cause).toBe('limit');
    expect(info?.resetAt).toBe(new Date(2026, 10, 24, 15, 20).getTime());
  });

  it('로그인 만료·모델 오류를 가른다', () => {
    expect(gstopClassify(new Error('Claude Code 생성 실패 (원인 코드: not_logged_in).'), 'text', 'agent-claude', NOW)?.cause).toBe('login');
    expect(gstopClassify(new Error('고른 모델을 쓸 수 없습니다 model_unavailable'), 'text', 'agent-codex', NOW)?.cause).toBe('model');
  });

  it('이유를 모르는 이미지 실패는 image, 글 실패는 other 로 둔다', () => {
    expect(gstopClassify(new Error('이미지 생성 결과가 비어있음'), 'image', 'nano-banana-2', NOW)?.cause).toBe('image');
    expect(gstopClassify(new Error('콘텐츠 생성에 실패했습니다'), 'text', 'agent-codex', NOW)?.cause).toBe('other');
  });

  it('창을 띄우지 않는 오류: 사용자 취소·이중 생성·입력 부족·라이선스·네이버 계정 멈춤·쇼핑 참조 없음', () => {
    for (const text of [
      '사용자가 작업을 취소했습니다.',
      'IMAGE_DUPLICATE_RUN:같은 글의 이미지 생성이 이미 진행 중입니다',
      '키워드 또는 초안이 필요합니다',
      '라이선스 인증이 필요합니다.',
      '[LOGIN_REQUIRED] 네이버 로그인이 필요합니다',
      '쇼핑커넥트 대표 상품 이미지가 없어 원본 썸네일과 소제목 AI 이미지를 만들 수 없습니다.',
      'CONTENT_POLICY_BLOCKED BLOCK_EMPTY_DRAFT',
    ]) {
      expect(gstopClassify(new Error(text), 'image', 'codex-image', NOW), text).toBeNull();
    }
  });
});

describe('멈춤 한 줄', () => {
  it('"이미지 생성이 멈췄어요 · 코덱스 한도 초과 · 초기화 오후 3:20" 모양이다', () => {
    const info = gstopClassify(new Error('원인 코드: rate_limited 11월 24일 15시 20분 이후 다시 시도'), 'image', 'codex-image', NOW)!;
    expect(gstopSummaryLine(info)).toBe('이미지 생성이 멈췄어요 · 코덱스 한도 초과 · 초기화 오후 3:20');
  });

  it('초기화 시각이 없으면 그 부분을 뺀다', () => {
    const info = gstopClassify(new Error('원인 코드: not_logged_in'), 'text', 'agent-claude', NOW)!;
    expect(gstopSummaryLine(info)).toBe('글 생성이 멈췄어요 · 클로드 코드 로그인 만료');
  });

  it('시각 표기: 오전·오후·정오·자정', () => {
    expect(gstopFormatResetClock(new Date(2026, 10, 24, 0, 5).getTime())).toBe('오전 12:05');
    expect(gstopFormatResetClock(new Date(2026, 10, 24, 12, 0).getTime())).toBe('오후 12:00');
    expect(gstopFormatResetClock(new Date(2026, 10, 24, 9, 7).getTime())).toBe('오전 9:07');
  });

  it('해가 바뀌는 시각은 다음 해로 읽는다', () => {
    const at = gstopParseResetAt('1월 2일 3시 4분 이후 다시 시도', new Date(2026, 11, 31, 23, 0).getTime());
    expect(at).toBe(new Date(2027, 0, 2, 3, 4).getTime());
  });
});
