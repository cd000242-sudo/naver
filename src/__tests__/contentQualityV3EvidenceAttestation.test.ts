import { describe, expect, it, vi } from 'vitest';

import {
  APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256,
  CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
  CONTENT_QUALITY_V3_EVIDENCE_MODEL,
  CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
  computeContentQualityV3EvidenceArtifactSha256,
  evaluateContentQualityV3EvidenceAttestation as evaluateEvidenceAttestation,
  type ContentQualityV3CanonicalEvidence,
  type ContentQualityV3EvidenceAttestation,
  type ContentQualityV3EvidenceAttestationMetadata,
} from '../contentQualityV3/evidenceAttestation.js';
import { getCurrentContentQualityV3EvidenceBindings } from '../contentQualityV3/currentEvidenceBindings.js';
import { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from '../contentQualityV3/candidateRuntimeFingerprint.js';

const RAW_EVIDENCE_PACKAGE_SHA256 = '9'.repeat(64);

function evaluateContentQualityV3EvidenceAttestation(
  value: unknown,
  recordedEvidence: ContentQualityV3CanonicalEvidence,
  expectedRunId: string | undefined,
) {
  return evaluateEvidenceAttestation(
    value,
    recordedEvidence,
    expectedRunId,
    RAW_EVIDENCE_PACKAGE_SHA256,
  );
}

function metadata(
  overrides: Partial<ContentQualityV3EvidenceAttestationMetadata> = {},
): ContentQualityV3EvidenceAttestationMetadata {
  return {
    schemaVersion: CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
    provider: CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
    model: CONTENT_QUALITY_V3_EVIDENCE_MODEL,
    locale: CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
    runId: 'run-1',
    rawEvidencePackageSha256: RAW_EVIDENCE_PACKAGE_SHA256,
    ...getCurrentContentQualityV3EvidenceBindings(),
    ...overrides,
  };
}

function evidence(): ContentQualityV3CanonicalEvidence {
  return {
    cases: [{ caseId: 'case-1', candidateQualityScore: 91 }],
    pairwiseJudgments: [{
      judgmentId: 'judgment-1',
      runId: 'run-1',
      verdict: 'CANDIDATE_WIN',
    }],
  };
}

function attestation(
  value = evidence(),
  pinned = metadata(),
): ContentQualityV3EvidenceAttestation {
  return {
    ...pinned,
    artifactSha256: computeContentQualityV3EvidenceArtifactSha256(value, pinned),
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

describe('Content Quality V3 evidence attestation', () => {
  it('uses deterministic key-sorted SHA-256 without mutating immutable evidence', () => {
    const first = deepFreeze(evidence());
    const reordered = deepFreeze<ContentQualityV3CanonicalEvidence>({
      cases: [{ candidateQualityScore: 91, caseId: 'case-1' }],
      pairwiseJudgments: [{
        verdict: 'CANDIDATE_WIN',
        runId: 'run-1',
        judgmentId: 'judgment-1',
      }],
    });
    const before = structuredClone(first);

    const firstDigest = computeContentQualityV3EvidenceArtifactSha256(first, metadata());
    const secondDigest = computeContentQualityV3EvidenceArtifactSha256(reordered, metadata());

    expect(firstDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(secondDigest).toBe(firstDigest);
    expect(first).toEqual(before);
    expect(CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION).toBe(2);
  });

  it('is fail-closed when missing and leaves self-consistent evidence unapproved', () => {
    const value = evidence();
    const missing = evaluateContentQualityV3EvidenceAttestation(undefined, value, 'run-1');
    const fabricated = evaluateContentQualityV3EvidenceAttestation(
      attestation(value),
      value,
      'run-1',
    );

    expect(missing).toEqual({ status: 'MISSING' });
    expect(fabricated).toEqual({ status: 'UNAPPROVED' });
    expect(Object.isFrozen(missing)).toBe(true);
    expect(Object.isFrozen(fabricated)).toBe(true);
    expect(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256).toEqual([]);
    expect(Object.isFrozen(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256)).toBe(true);
  });

  it('rejects self-consistent caller-declared artifact pins that do not match current artifacts', () => {
    const value = evidence();
    const callerPins = metadata({
      promptBundleSha256: '0'.repeat(64),
      outputSchemaSha256: '0'.repeat(64),
      corpusSha256: '0'.repeat(64),
      legacyBaselineSha256: '0'.repeat(64),
      candidateRuntimeSha256: '0'.repeat(64),
    });

    expect(evaluateContentQualityV3EvidenceAttestation(
      attestation(value, callerPins),
      value,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('requires the attested raw evidence package digest to match a separately verified package', () => {
    const value = evidence();
    const candidate = attestation(value);

    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      undefined,
    )).toEqual({ status: 'INVALID' });
    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      '8'.repeat(64),
    )).toEqual({ status: 'INVALID' });
    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      RAW_EVIDENCE_PACKAGE_SHA256,
    )).toEqual({ status: 'UNAPPROVED' });
  });

  it('caches one immutable current-artifact identity and rejects each stale pin', () => {
    const current = getCurrentContentQualityV3EvidenceBindings();
    const value = evidence();

    expect(getCurrentContentQualityV3EvidenceBindings()).toBe(current);
    expect(Object.isFrozen(current)).toBe(true);
    expect(current).toEqual({
      promptBundleSha256:
        '59da1db556b91b80e2f6a0a9a6c10a12b6f28dbfb343a699f40a4a0883861e35',
      outputSchemaSha256:
        'd2a8e746c86950e548e63f5eff7cbe00a9fc1dbf8a057b12ed7a1d36c8b07cd4',
      corpusSha256:
        'cf1721af51303263182a38f7618f5431f4534858c5a9655c33fa90c61abf33f0',
      legacyBaselineSha256:
        // [2026-08-12] 제미나이 3티어 배선(modelRegistry 티어·표시이름 분리)으로 재계산
        // [2026-08-14] 모드별 소제목 스펙 2종이 베이스라인에 편입(108→110) + promptLoader 변경으로 재계산
        // [2026-08-19] 노출 글 구조 블록 주입(promptLoader structureGuideBlock)으로 재계산
        // [2026-08-20] 홈판 제목 클릭사유 개편(title/homefeed/base.prompt 0점 패턴 추가)으로 재계산
        // [2026-08-20] 본선 배선(contentJsonPromptFormat clickReason·whyClick·훅 계약)으로 재계산
        // [2026-08-20] SEO 검색 클릭 계약 + 쇼핑 제품명+상황+후킹 계약 배선으로 재계산
        // [2026-08-20 3차] mate·business 클릭 계약 + 사진(imageNarrative) titleReason 계약으로 재계산
        // [2026-08-27] 프롬프트 슬림화 — 자가점검 체크리스트 제거 + 장식 구분선 220줄 제거로 재계산
        // [2026-08-27 2차] 제목 길이 계약을 JSON 스키마 필드로 올리며 재계산
        // [2026-08-27 3차] 홈판 사전분석에 surprisingFact(의외 지점) 필드 신설로 재계산
        // [2026-09-01] SEO 소제목 골격 반복 금지를 구체 확인 항목으로 바꾸며 재계산
        //   (실측: 소제목 6/6 이 "수치 나열, 명사형 설명구" 동일 골격이었다)
        // [2026-09-01 2차] GEO 오버레이에 유효 수치 정의 추가로 재계산
        //   (실측: "사진 검색 결과 419개" 같은 파이프라인 내부 수치가 근거로 실렸다)
        // [2026-09-01 3차] 시청 · 관람 경험을 체험 금지에서 분리하며 재계산
        //   (드라마를 본 것은 실존 인물을 만난 것이 아니다 — 선은 작품이 아니라 사람에서 긋는다)
        // [2026-09-01 4차] 요약표 규율(본문보다 강하게 말하지 않기 · 무관한 축 금지)로 재계산
        //   (실측: 본문은 "과대포장을 덜어냈을 때의 체감"인데 표는 "30% 늘어난 사례"로 단정)
        // [2026-09-01 5차] 매 섹션 강제 템플릿 완화로 재계산
        //   (expert_review 가 매 H3 마지막에 [한 줄 판정] 을 강제하고 있었다 — 앞 내용 재진술이라 이탈을 부른다)
        // [2026-09-01 6차] evidence 근거 인용 필드 신설 + 요약표 조건 칸 + 분량 압력 제거로 재계산
        //   (사장님: "검사를 해서 다시쓰기를 하면 의미가 없어" — 첫 호출에서 지키게 하는 유일한 레버가 스키마 필드다)
        // [2026-09-01 7차] 소제목 종결형 강제 해제로 재계산
        //   (출력 형식이 조립 맨 뒤라 headings-homefeed 의 모범 예시 "이 조건에서 갈립니다" 를 금지하고 있었다)
        // [2026-09-01 8차] 페르소나 교착 해소 + 업체 해시태그 배선으로 재계산
        //   (expert_review 가 "3년간 200개 봤습니다" 를 시키면서 같은 파일이 그것을 금지했다)
        // [2026-09-01 9차] storyteller 오감·시간축 강제 해소 + mate FAQ 개수 강제 해소로 재계산
        //   (프롬프트가 자료로는 채울 수 없는 것을 "반드시"로 요구하던 자리들)
        // [2026-09-02 10차] 본문 프롬프트에 오늘 날짜 주입으로 재계산
        //   (지난해 행사를 "오는 17일부터" 로 옮겨 없는 행사를 안내하던 것)
        // [2026-09-02 11차] 산문 지시가 흘려서 dateBasis 스키마 필드로 형태 변경
        // [2026-09-02 12차] 검색용 조합어 표시 배선으로 재계산
        // [2026-09-02 13차] dateBasis 서술 금지 조항 추가로 재계산
        // [2026-09-02 14차] 멘토 어미 믹싱 · 공통 격식 오르내림 조항으로 재계산
        // [2026-09-02 15차] 홈판 문단 규칙 1~2문장 → 2~3문장(사장님 결정)으로 재계산
        // [2026-09-03] 쇼핑 1인칭 전환 — promptLoader(리뷰 라벨·활용 지침 분기) + 평가기 옵트인 스레딩 + qualityEvaluator 입력으로 재계산
        '0f5bfd2f351b0a56ba5bf1dc2f716c3aae5e0121123f705d8f26990e5827fedf',
      candidateRuntimeSha256: CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
    });

    for (const key of [
      'promptBundleSha256',
      'outputSchemaSha256',
      'corpusSha256',
      'legacyBaselineSha256',
      'candidateRuntimeSha256',
    ] as const) {
      const stale = metadata({ [key]: 'f'.repeat(64) });
      expect(evaluateContentQualityV3EvidenceAttestation(
        attestation(value, stale),
        value,
        'run-1',
      )).toEqual({ status: 'INVALID' });
    }
  });

  it('fails closed when the raw legacy baseline cannot be loaded', async () => {
    const value = evidence();
    const candidate = attestation(value);
    vi.resetModules();
    vi.doMock('node:fs', () => ({
      readFileSync: () => {
        throw new Error('baseline unavailable');
      },
    }));

    try {
      const freshModule = await import('../contentQualityV3/evidenceAttestation.js');
      expect(freshModule.evaluateContentQualityV3EvidenceAttestation(
        candidate,
        value,
        'run-1',
        RAW_EVIDENCE_PACKAGE_SHA256,
      )).toEqual({ status: 'INVALID' });
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('detects evidence tampering and rejects stale current-artifact pins', () => {
    const originalEvidence = evidence();
    const originalAttestation = attestation(originalEvidence);
    const tamperedMetric: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      cases: [{ caseId: 'case-1', candidateQualityScore: 92 }],
    };
    const tamperedVerdict: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      pairwiseJudgments: [{
        judgmentId: 'judgment-1',
        runId: 'run-1',
        verdict: 'LEGACY_WIN',
      }],
    };
    const tamperedMetadata = {
      ...originalAttestation,
      corpusSha256: '5'.repeat(64),
    };
    const tamperedRunEvidence: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      pairwiseJudgments: [{
        judgmentId: 'judgment-1',
        runId: 'run-2',
        verdict: 'CANDIDATE_WIN',
      }],
    };
    const tamperedRunAttestation = {
      ...originalAttestation,
      runId: 'run-2',
    };

    for (const [candidate, candidateEvidence, runId] of [
      [originalAttestation, tamperedMetric, 'run-1'],
      [originalAttestation, tamperedVerdict, 'run-1'],
      [tamperedRunAttestation, tamperedRunEvidence, 'run-2'],
    ] as const) {
      expect(evaluateContentQualityV3EvidenceAttestation(
        candidate,
        candidateEvidence,
        runId,
      )).toEqual({ status: 'DIGEST_MISMATCH' });
    }

    expect(evaluateContentQualityV3EvidenceAttestation(
      tamperedMetadata,
      originalEvidence,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('rejects run replay against a different recorded run before approval', () => {
    const originalEvidence = evidence();
    const originalAttestation = attestation(originalEvidence);
    const replayedEvidence: ContentQualityV3CanonicalEvidence = {
      cases: [{ caseId: 'case-replayed', candidateQualityScore: 91 }],
      pairwiseJudgments: originalEvidence.pairwiseJudgments,
    };

    expect(evaluateContentQualityV3EvidenceAttestation(
      originalAttestation,
      replayedEvidence,
      'run-1',
    )).toEqual({ status: 'DIGEST_MISMATCH' });
    expect(evaluateContentQualityV3EvidenceAttestation(
      { ...originalAttestation, runId: 'run-2' },
      originalEvidence,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('rejects extra keys, accessors, custom prototypes, proxies, and invalid pinned metadata', () => {
    const value = evidence();
    const valid = attestation(value);
    let accessorReads = 0;
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'artifactSha256', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return valid.artifactSha256;
      },
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }), valid);
    const hostileProxy = new Proxy({ ...valid }, {
      ownKeys: () => {
        throw new Error('hostile ownKeys trap');
      },
    });
    const invalidValues: unknown[] = [
      null,
      { ...valid, extra: true },
      accessor,
      customPrototype,
      hostileProxy,
      { ...valid, schemaVersion: 1 },
      { ...valid, provider: 'openai' },
      { ...valid, model: 'gemini-3.5-flash' },
      { ...valid, locale: 'en-US' },
      { ...valid, runId: '' },
      { ...valid, promptBundleSha256: 'A'.repeat(64) },
      { ...valid, candidateRuntimeSha256: 'A'.repeat(64) },
      { ...valid, rawEvidencePackageSha256: 'A'.repeat(64) },
      { ...valid, artifactSha256: 'not-a-sha256' },
    ];

    for (const invalidValue of invalidValues) {
      expect(evaluateContentQualityV3EvidenceAttestation(
        invalidValue,
        value,
        'run-1',
      )).toEqual({ status: 'INVALID' });
    }
    expect(accessorReads).toBe(0);
  });

  it('bounds direct canonicalization arrays, strings, and own keys against memory abuse', () => {
    const oversizedArray = new Array(50_001);
    const oversizedString = 'x'.repeat(4_097);
    const excessiveKeys = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`key${index}`, index]),
    );
    const sparseArray = new Array(1);
    const extraKeyArray = [{}] as unknown[] & { extra?: true };
    extraKeyArray.extra = true;
    const customPrototypeArray: unknown[] = [{}];
    Object.setPrototypeOf(customPrototypeArray, Object.create(Array.prototype));
    let excessiveDepth: Record<string, unknown> = { value: 'leaf' };
    for (let depth = 0; depth < 20; depth += 1) {
      excessiveDepth = { nested: excessiveDepth };
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const cases of [
      oversizedArray,
      [{ value: oversizedString }],
      [excessiveKeys],
      sparseArray,
      extraKeyArray,
      customPrototypeArray,
      [excessiveDepth],
      [cyclic],
    ]) {
      expect(() => computeContentQualityV3EvidenceArtifactSha256(
        { cases, pairwiseJudgments: [] },
        metadata(),
      )).toThrow('INVALID_EVIDENCE_ATTESTATION');
    }
  });

  it('rejects hostile direct evidence containers without invoking accessors', () => {
    let accessorReads = 0;
    const accessorEvidence = { pairwiseJudgments: [] } as Record<string, unknown>;
    Object.defineProperty(accessorEvidence, 'cases', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return [];
      },
    });
    const extraEvidence = { cases: [], pairwiseJudgments: [], extra: true };
    const customPrototypeEvidence = Object.assign(
      Object.create({ inherited: true }),
      { cases: [], pairwiseJudgments: [] },
    );

    for (const candidate of [accessorEvidence, extraEvidence, customPrototypeEvidence]) {
      expect(() => computeContentQualityV3EvidenceArtifactSha256(
        candidate as unknown as ContentQualityV3CanonicalEvidence,
        metadata(),
      )).toThrow('INVALID_EVIDENCE_ATTESTATION');
    }
    expect(accessorReads).toBe(0);
  });

  it('does not accept environment, config-shaped, or extra-argument approval overrides', () => {
    const value = evidence();
    const fabricated = attestation(value);
    const envKey = 'CONTENT_QUALITY_V3_APPROVED_ARTIFACT_SHA256';
    const previous = process.env[envKey];
    process.env[envKey] = fabricated.artifactSha256;
    const invokeWithOverride = evaluateContentQualityV3EvidenceAttestation as unknown as (
      attestationValue: unknown,
      evidenceValue: ContentQualityV3CanonicalEvidence,
      expectedRunId: string,
      ignoredApprovalOverride: unknown,
    ) => ReturnType<typeof evaluateContentQualityV3EvidenceAttestation>;

    try {
      expect(invokeWithOverride(
        fabricated,
        value,
        'run-1',
        { approvedArtifactSha256: [fabricated.artifactSha256] },
      )).toEqual({ status: 'UNAPPROVED' });
    } finally {
      if (previous === undefined) delete process.env[envKey];
      else process.env[envKey] = previous;
    }
  });
});
