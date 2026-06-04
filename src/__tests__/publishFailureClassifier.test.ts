import { describe, expect, it } from 'vitest';
import { classifyPublishFailure } from '../automation/publishFailureClassifier';

describe('classifyPublishFailure', () => {
  it('classifies browser session crashes as retryable', () => {
    expect(classifyPublishFailure('Protocol error: Target closed')).toEqual({
      code: 'BROWSER_CLOSED',
      retryable: true,
      userActionRequired: false,
    });
  });

  it('classifies Naver challenge/login cases as user-action required', () => {
    expect(classifyPublishFailure('Naver login captcha security verification is required')).toMatchObject({
      code: 'LOGIN_CHALLENGE',
      retryable: false,
      userActionRequired: true,
    });

    expect(classifyPublishFailure('네이버 보안 인증 또는 캡차가 필요합니다')).toMatchObject({
      code: 'LOGIN_CHALLENGE',
      userActionRequired: true,
    });
  });

  it('classifies publish condition failures separately from navigation waits', () => {
    expect(classifyPublishFailure('publish condition is insufficient: body requirement or category requirement')).toMatchObject({
      code: 'PUBLISH_CONDITION',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('본문 조건(글자수·카테고리·이미지)이 부족할 수 있습니다')).toMatchObject({
      code: 'PUBLISH_CONDITION',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('publish navigation timeout: url did not change and no post url was confirmed')).toMatchObject({
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });

    expect(classifyPublishFailure('발행이 완료되지 않았습니다. URL이 변경되지 않았습니다')).toMatchObject({
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });
  });

  it('classifies image upload failures before generic publish conditions', () => {
    expect(classifyPublishFailure('image upload failed: image size exceeds the Naver limit')).toMatchObject({
      code: 'IMAGE_REJECTED',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('이미지 업로드 실패: 이미지 용량이 네이버 제한을 초과했습니다')).toMatchObject({
      code: 'IMAGE_REJECTED',
      userActionRequired: true,
    });
  });

  it('classifies selector drift as unknown UI change', () => {
    expect(classifyPublishFailure('confirm button selector not found: seOnePublishBtn')).toMatchObject({
      code: 'UNKNOWN_UI_CHANGE',
      retryable: true,
    });

    expect(classifyPublishFailure('발행 확인 버튼을 찾을 수 없습니다: seOnePublishBtn')).toMatchObject({
      code: 'UNKNOWN_UI_CHANGE',
      retryable: true,
    });
  });
});
