import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveContentQualityV3ProductionPublishSafetyMode,
  stripContentQualityV3PublishMetadata,
} from '../contentQualityV3/productionPublishSafetyMode.js';

describe('Content Quality V3 production publish safety mode', () => {
  it('uses advisory mode by default so a quality handoff cannot stop a normal publish', () => {
    expect(resolveContentQualityV3ProductionPublishSafetyMode({})).toBe('advisory');
    expect(resolveContentQualityV3ProductionPublishSafetyMode({
      CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION: '0',
    })).toBe('advisory');
  });

  it('enables the legacy strict gate only through an explicit operator opt-in', () => {
    expect(resolveContentQualityV3ProductionPublishSafetyMode({
      CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION: '1',
    })).toBe('strict');
  });

  it('removes only V3 publish metadata while preserving the user article, images, and FTC copy', () => {
    const payload = {
      title: '사용자 제목',
      content: '사용자 본문',
      images: [{ filePath: 'C:/images/product.png' }],
      _contentQualityV3PublishOwnerKey: 'renderer:1',
      _contentQualityV3PostId: 'post-1',
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: { handle: 'h1' },
      structuredContent: {
        selectedTitle: '사용자 제목',
        bodyPlain: '사용자 본문',
        ftcDisclosure: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
        _contentQualityV3PostId: 'post-1',
        _contentQualityV3Required: true,
        _contentQualityV3PublishHandoff: { handle: 'h1' },
      },
    };

    const result = stripContentQualityV3PublishMetadata(payload);

    expect(result).toEqual({
      title: '사용자 제목',
      content: '사용자 본문',
      images: [{ filePath: 'C:/images/product.png' }],
      structuredContent: {
        selectedTitle: '사용자 제목',
        bodyPlain: '사용자 본문',
        ftcDisclosure: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
      },
    });
    expect(payload).toHaveProperty('_contentQualityV3PublishOwnerKey');
    expect(payload.structuredContent).toHaveProperty('_contentQualityV3Required');
  });

  it('keeps the multi-account preflight advisory unless strict verification is explicitly enabled', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const handlerStart = mainSource.indexOf("ipcMain.handle('multiAccount:publish'");
    const handlerEnd = mainSource.indexOf("ipcMain.handle('multiAccount:cancel'", handlerStart);
    const handler = mainSource.slice(handlerStart, handlerEnd);

    expect(handler).toContain(
      'resolveContentQualityV3ProductionPublishSafetyMode(process.env)',
    );
    expect(handler).toMatch(
      /contentQualityV3SafetyMode === 'strict'[\s\S]*?enforceContentQualityV3PublishPayload\(/,
    );
    expect(handler).toContain(
      '다중계정 V3 품질 검증 경고: 글과 이미지를 유지하고 발행을 계속합니다.',
    );
  });
});
