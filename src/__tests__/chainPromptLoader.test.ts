/**
 * SPEC-CONVERSION-001 L2-1.7 — chain prompt loader 단위 테스트.
 * 변수 치환·파일 해상도·캐싱·미발견 케이스 검증.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadChainPrompt,
  loadChainPromptRaw,
  resolveChainPromptsDir,
  renderTemplate,
  clearChainPromptCache,
} from '../content/chainPromptLoader';

describe('resolveChainPromptsDir — 위치 해상도', () => {
  beforeEach(() => clearChainPromptCache());

  it('5개 stage 파일이 모두 존재하는 디렉토리를 반환', () => {
    const dir = resolveChainPromptsDir();
    expect(dir).toMatch(/prompts[\\/]+affiliate[\\/]+chain$/);
    const fs = require('fs');
    const path = require('path');
    for (const stage of ['stage1_classify', 'stage2_persona', 'stage3_draft', 'stage4_factgate', 'stage5_optimize']) {
      expect(fs.existsSync(path.join(dir, `${stage}.prompt`))).toBe(true);
    }
  });
});

describe('loadChainPromptRaw — 파일 로드 + 캐싱', () => {
  beforeEach(() => clearChainPromptCache());

  it('stage3_draft 원본에 변수 토큰이 보존됨', () => {
    const raw = loadChainPromptRaw('stage3_draft');
    expect(raw).toContain('{{STAGE12_CONTEXT}}');
    expect(raw).toContain('{{TOPIC}}');
    expect(raw).toContain('{{MIN_CHARS}}');
    expect(raw).toContain('{{MAX_CHARS}}');
  });

  it('stage5_optimize 원본에 변수 토큰이 보존됨', () => {
    const raw = loadChainPromptRaw('stage5_optimize');
    expect(raw).toContain('{{PERSONA_BLOCK}}');
    expect(raw).toContain('{{TOPIC}}');
    expect(raw).toContain('{{PROOF_BLOCK}}');
    expect(raw).toContain('{{DRAFT}}');
  });

  it('두 번째 호출은 캐시 적중 (동일 인스턴스)', () => {
    const a = loadChainPromptRaw('stage4_factgate');
    const b = loadChainPromptRaw('stage4_factgate');
    expect(a).toBe(b);
  });
});

describe('renderTemplate — 변수 치환', () => {
  it('단일 토큰 치환', () => {
    const out = renderTemplate('hello {{NAME}}!', { NAME: '세계' });
    expect(out).toBe('hello 세계!');
  });

  it('동일 토큰 다회 등장 모두 치환', () => {
    const out = renderTemplate('{{X}} and {{X}}', { X: 'A' });
    expect(out).toBe('A and A');
  });

  it('미정의 변수는 throw (allowMissing=false 기본)', () => {
    expect(() => renderTemplate('{{A}} {{B}}', { A: '1' })).toThrow(/CHAIN_PROMPT_MISSING_VARS.*B/);
  });

  it('allowMissing=true 시 토큰 그대로 보존', () => {
    const out = renderTemplate('{{A}} {{B}}', { A: '1' }, { allowMissing: true });
    expect(out).toBe('1 {{B}}');
  });

  it('변수에 빈 문자열도 허용 (undefined만 missing 처리)', () => {
    const out = renderTemplate('[{{A}}]', { A: '' });
    expect(out).toBe('[]');
  });
});

describe('loadChainPrompt — 통합 (파일 로드 + 치환)', () => {
  beforeEach(() => clearChainPromptCache());

  it('stage3_draft 변수 치환 결과에 사용자 입력 반영', () => {
    const out = loadChainPrompt('stage3_draft', {
      STAGE12_CONTEXT: '## [페르소나]\n- 이름: 지영',
      TOPIC: '강남 카페 후기',
      MIN_CHARS: '1500',
      MAX_CHARS: '2500',
    });
    expect(out).toContain('지영');
    expect(out).toContain('강남 카페 후기');
    expect(out).toContain('최소 1500자');
    expect(out).toContain('최대 2500자');
    expect(out).not.toContain('{{');
  });

  it('stage5_optimize 변수 치환', () => {
    const out = loadChainPrompt('stage5_optimize', {
      PERSONA_BLOCK: '톤: friendly',
      TOPIC: '주제',
      PROOF_BLOCK: '데이터 없음',
      DRAFT: '본문 초안 텍스트',
    });
    expect(out).toContain('톤: friendly');
    expect(out).toContain('본문 초안 텍스트');
    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('stage4_factgate 변수 치환', () => {
    const out = loadChainPrompt('stage4_factgate', {
      VERIFICATION_RATE_PCT: '60',
      UNVERIFIED_COUNT: '3',
      UNVERIFIED_LIST: '  • [number] "150g"\n  • [duration] "2주간"',
    });
    expect(out).toContain('검증율 60%');
    expect(out).toContain('미검증 3건');
    expect(out).toContain('150g');
    expect(out).toContain('2주간');
  });

  it('stage2_persona 변수 치환', () => {
    const out = loadChainPrompt('stage2_persona', {
      PERSONA_NAME: '지영',
      PERSONA_AGE: '30대',
      PERSONA_OCCUPATION: '주부',
      PERSONA_YEARS: '5',
      PERSONA_TONE: 'casual',
      PERSONA_VOCAB: '실사용, 솔직히',
      PERSONA_FORBIDDEN: '최고의, 무조건',
    });
    expect(out).toContain('지영');
    expect(out).toContain('주부');
    expect(out).toContain('실사용, 솔직히');
    expect(out).not.toContain('{{');
  });
});
