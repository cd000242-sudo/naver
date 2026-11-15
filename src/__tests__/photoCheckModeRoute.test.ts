/**
 * Photo-check mode: the owner may re-run a stopped collection with another way of checking photos.
 * Pure functions only — no network, no electron.
 */
import { describe, expect, it } from 'vitest';
import { isPhotoCheckMode, normalizePhotoCheckMode, resolveVisionRouteForMode, resolveIssueVisionRoute } from '../crawler/issueHarness/visionRoute.js';
import { buildVisionUnavailableFields, VisionEngineUnavailableError } from '../crawler/issueHarness/visionEngineError.js';
import { validateIssueCollectPayload } from '../main/ipc/validators.js';

const claudeEngine = { primaryGeminiTextModel: 'agent-claude' };
const codexEngine = { primaryGeminiTextModel: 'agent-codex' };

describe('isPhotoCheckMode / normalizePhotoCheckMode', () => {
  it('accepts the four known values only', () => {
    for (const mode of ['selected', 'agent-claude', 'agent-codex', 'caption']) expect(isPhotoCheckMode(mode)).toBe(true);
    for (const bad of ['', 'gemini', 'agent-gemini', 'CAPTION', undefined, null, 1, {}]) expect(isPhotoCheckMode(bad)).toBe(false);
  });

  it('treats unknown values as selected', () => {
    expect(normalizePhotoCheckMode('caption')).toBe('caption');
    expect(normalizePhotoCheckMode('agent-codex')).toBe('agent-codex');
    expect(normalizePhotoCheckMode('bogus')).toBe('selected');
    expect(normalizePhotoCheckMode(undefined)).toBe('selected');
  });
});

describe('resolveVisionRouteForMode', () => {
  it('agent-claude forces the Claude subscription route even when the text engine is Codex', () => {
    expect(resolveVisionRouteForMode('agent-claude', codexEngine)).toEqual({
      vendor: 'agent-claude', model: 'agent-claude', apiKey: '', label: 'Claude 구독', free: true, fellBack: false,
    });
  });

  it('agent-codex forces the Codex subscription route even when the text engine is Claude', () => {
    expect(resolveVisionRouteForMode('agent-codex', claudeEngine)).toEqual({
      vendor: 'agent-codex', model: 'agent-codex', apiKey: '', label: 'Codex 구독', free: true, fellBack: false,
    });
  });

  it('agent modes do not need any key or engine setting', () => {
    expect(resolveVisionRouteForMode('agent-codex', {})?.vendor).toBe('agent-codex');
    expect(resolveVisionRouteForMode('agent-claude', undefined)?.vendor).toBe('agent-claude');
  });

  it('caption has no check route even when a subscription engine is selected', () => {
    expect(resolveVisionRouteForMode('caption', claudeEngine)).toBeNull();
    expect(resolveVisionRouteForMode('caption', codexEngine)).toBeNull();
  });

  it('selected (and unknown / missing values) follow the text engine exactly as before', () => {
    expect(resolveVisionRouteForMode('selected', codexEngine)).toEqual(resolveIssueVisionRoute(codexEngine));
    expect(resolveVisionRouteForMode('bogus', claudeEngine)).toEqual(resolveIssueVisionRoute(claudeEngine));
    expect(resolveVisionRouteForMode(undefined, claudeEngine)?.vendor).toBe('agent-claude');
    // agy (Gemini CLI) cannot read photos headlessly: still no route, no silent switch to another vendor.
    expect(resolveVisionRouteForMode('selected', { primaryGeminiTextModel: 'agent-gemini' })).toBeNull();
  });
});

describe('issue:collectImages payload — photoCheckMode', () => {
  const base = { title: '김연아 은퇴', headings: [{ title: '은퇴 기자회견 그 후' }] };

  it('defaults to selected when absent', () => {
    const v = validateIssueCollectPayload(base);
    expect(v.ok && v.value.photoCheckMode).toBe('selected');
  });

  it('keeps each of the four values', () => {
    for (const mode of ['selected', 'agent-claude', 'agent-codex', 'caption']) {
      const v = validateIssueCollectPayload({ ...base, photoCheckMode: mode });
      expect(v.ok && v.value.photoCheckMode).toBe(mode);
    }
  });

  it('rejects any other value instead of guessing', () => {
    expect(validateIssueCollectPayload({ ...base, photoCheckMode: 'gemini' }).ok).toBe(false);
    expect(validateIssueCollectPayload({ ...base, photoCheckMode: 3 }).ok).toBe(false);
  });
});

describe('buildVisionUnavailableFields', () => {
  it('gives the screen a stable code plus reason and vendor', () => {
    const error = new VisionEngineUnavailableError('rate_limit', { vendor: 'agent-claude', label: 'Claude 구독' }, '한도 소진');
    expect(buildVisionUnavailableFields(error)).toEqual({
      code: 'VISION_ENGINE_UNAVAILABLE', visionUnavailable: { reason: 'rate_limit', vendor: 'agent-claude' },
    });
  });
});
