import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const candidateRuntimeMock = vi.hoisted(() => vi.fn());
const finalizePublicationMock = vi.hoisted(() => vi.fn());
const materializePublicationMock = vi.hoisted(() => vi.fn());
const resolveTitleContractMock = vi.hoisted(() => vi.fn());
const verifyRuntimeFingerprintMock = vi.hoisted(() => vi.fn());

const runtimeCandidate = Object.freeze({
  selectedTitle: 'candidate-runtime-sentinel',
});
const publicationEnvelope = Object.freeze({
  content: Object.freeze({ selectedTitle: 'publication-core-sentinel' }),
  attachments: Object.freeze({ telemetry: Object.freeze({}) }),
});
const publicationCandidate = Object.freeze({
  selectedTitle: 'publication-candidate-sentinel',
});

vi.mock('../contentGenerator.js', () => ({
  runContentQualityV3CandidateRuntimeForEvaluationOnly: candidateRuntimeMock,
}));

vi.mock('../contentQualityV3/publicationBoundary.js', () => ({
  finalizeContentQualityV3PublicationCandidate: finalizePublicationMock,
  materializeContentQualityV3PublicationEnvelope: materializePublicationMock,
}));

vi.mock('../contentQualityV3/titleContract.js', () => ({
  resolveContentQualityV3TitleContract: resolveTitleContractMock,
}));

vi.mock('../contentQualityV3/candidateRuntimeFingerprint.js', () => ({
  verifyContentQualityV3CandidateRuntimeFingerprint: verifyRuntimeFingerprintMock,
}));

import {
  ContentQualityV3EvaluationOnlyError,
  generateContentQualityV3CandidateForEvaluation,
} from '../contentQualityV3/evaluationOnlyCandidateDriver';

const srcRoot = path.resolve(__dirname, '..');

function walkProductionSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walkProductionSourceFiles(absolutePath);
    }
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [absolutePath] : [];
  });
}

beforeEach(() => {
  verifyRuntimeFingerprintMock.mockReset().mockResolvedValue(undefined);
  candidateRuntimeMock.mockReset().mockResolvedValue(runtimeCandidate);
  finalizePublicationMock.mockReset().mockReturnValue(Object.freeze({
    ok: true,
    envelope: publicationEnvelope,
  }));
  materializePublicationMock.mockReset().mockReturnValue(publicationCandidate);
  resolveTitleContractMock.mockReset().mockReturnValue(Object.freeze({
    requiredTitle: 'source title contract',
  }));
});

describe('Content Quality V3 evaluation-only candidate driver', () => {
  it.each(['seo', 'homefeed', 'affiliate', 'business', 'mate'])(
    'delegates evaluated mode %s to the exact candidate runtime',
    async contentMode => {
      const source = Object.freeze({ contentMode, rawText: 'evaluation fixture' });
      const options = Object.freeze({ provider: 'gemini', minChars: 2_500 });

      const result = await generateContentQualityV3CandidateForEvaluation(
        source as never,
        options,
      );

      expect(result).toBe(publicationCandidate);
      expect(verifyRuntimeFingerprintMock).toHaveBeenCalledTimes(1);
      expect(verifyRuntimeFingerprintMock).toHaveBeenCalledWith(path.resolve(__dirname, '../..'));
      expect(candidateRuntimeMock).toHaveBeenCalledTimes(1);
      expect(candidateRuntimeMock).toHaveBeenCalledWith(source, options);
      expect(resolveTitleContractMock).toHaveBeenCalledWith(source);
      expect(finalizePublicationMock).toHaveBeenCalledWith(runtimeCandidate, {
        titleContract: { requiredTitle: 'source title contract' },
        contentMode,
        affiliateEvidence: source,
        businessEvidence: source,
        minimumBodyChars: 2_500,
      });
      expect(materializePublicationMock).toHaveBeenCalledWith(publicationEnvelope);
    },
  );

  it('fails closed before provider execution when actual workspace source is stale', async () => {
    verifyRuntimeFingerprintMock.mockRejectedValueOnce(new Error(
      'CANDIDATE_RUNTIME_FINGERPRINT_MISMATCH',
    ));

    await expect(generateContentQualityV3CandidateForEvaluation(
      { contentMode: 'seo', rawText: 'evaluation fixture' } as never,
      { provider: 'gemini' },
    )).rejects.toEqual(new ContentQualityV3EvaluationOnlyError(
      'runtime_fingerprint_invalid',
    ));
    expect(candidateRuntimeMock).not.toHaveBeenCalled();
    expect(finalizePublicationMock).not.toHaveBeenCalled();
  });

  it('sanitizes candidate runtime and publication-contract failures separately', async () => {
    const source = { contentMode: 'seo', rawText: 'evaluation fixture' } as never;
    candidateRuntimeMock.mockRejectedValueOnce(new Error('RAW_PROVIDER_SECRET'));

    await expect(generateContentQualityV3CandidateForEvaluation(
      source,
      { provider: 'gemini' },
    )).rejects.toEqual(new ContentQualityV3EvaluationOnlyError('candidate_execution_failed'));
    expect(finalizePublicationMock).not.toHaveBeenCalled();

    finalizePublicationMock.mockReturnValueOnce(Object.freeze({
      ok: false,
      issueCode: 'invalid_candidate',
    }));
    await expect(generateContentQualityV3CandidateForEvaluation(
      source,
      { provider: 'gemini' },
    )).rejects.toEqual(new ContentQualityV3EvaluationOnlyError('candidate_result_invalid'));

    materializePublicationMock.mockImplementationOnce(() => {
      throw new Error('RAW_ATTACHMENT_SECRET');
    });
    await expect(generateContentQualityV3CandidateForEvaluation(
      source,
      { provider: 'gemini' },
    )).rejects.toEqual(new ContentQualityV3EvaluationOnlyError('candidate_result_invalid'));
  });

  it.each(['custom', 'traffic-hunter', 'image-narrative', 'unknown', 'SEO', ' seo '])(
    'fails closed before model execution for unevaluated mode %s',
    async contentMode => {
      const promise = generateContentQualityV3CandidateForEvaluation(
        { contentMode } as never,
        { provider: 'gemini' },
      );

      await expect(promise).rejects.toEqual(new ContentQualityV3EvaluationOnlyError(
        'unsupported_mode',
      ));
      expect(candidateRuntimeMock).not.toHaveBeenCalled();
      expect(verifyRuntimeFingerprintMock).not.toHaveBeenCalled();
    },
  );

  it('is not imported by main, renderer, or any other production module', () => {
    const productionFiles = walkProductionSourceFiles(srcRoot);
    const evaluationModule = path.join(
      srcRoot,
      'contentQualityV3',
      'evaluationOnlyCandidateDriver.ts',
    );
    const contentGenerator = path.join(srcRoot, 'contentGenerator.ts');

    for (const file of productionFiles) {
      if (file === evaluationModule) continue;
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(
        /(?:from\s*['"][^'"]*evaluationOnlyCandidateDriver|import\s*['"][^'"]*evaluationOnlyCandidateDriver)/,
      );
      if (file !== contentGenerator) {
        expect(source, file).not.toMatch(
          /runContentQualityV3CandidateRuntimeForEvaluationOnly/,
        );
      }
    }
  });
});
