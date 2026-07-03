/**
 * editorUrlLoginFalsePositive.test.ts
 *
 * [2026-07-03] 실측 팅김: navigateToBlogWrite가 로그인 페이지
 *   (nid.naver.com/nidlogin.login?mode=form&url=https://blog.naver.com/GoBlogWrite.naver)를
 *   에디터로 오인 → 성공 처리하고 로그인 복구 브랜치를 건너뛰어 프레임 전환 실패로 팅김.
 *   원인: isNaverWriteEditorUrl이 URL 전체 substring 매칭이라 쿼리 속 'GoBlogWrite'를 잡음.
 *   수정: 로그인 URL은 에디터로 분류하지 않는다. 정상 에디터 URL은 그대로 인식.
 */
import { describe, it, expect } from 'vitest';
import { isNaverWriteEditorUrl, isNaverLoginUrl } from '../automation/editorUrlState';
import { classifyBlogWriteNavigationUrl } from '../automation/editorNavigationUrlPolicy';

const LOGIN_WITH_EDITOR_QUERY =
  'https://nid.naver.com/nidlogin.login?mode=form&url=https://blog.naver.com/GoBlogWrite.naver';

describe('로그인 URL을 에디터로 오인하지 않는다 (팅김 회귀)', () => {
  it('로그인 리다이렉트(url=...GoBlogWrite)는 에디터가 아니다', () => {
    expect(isNaverLoginUrl(LOGIN_WITH_EDITOR_QUERY)).toBe(true);
    expect(isNaverWriteEditorUrl(LOGIN_WITH_EDITOR_QUERY)).toBe(false);
  });

  it('classifyBlogWriteNavigationUrl이 로그인 페이지를 login으로 분류(에디터 아님)', () => {
    const state = classifyBlogWriteNavigationUrl(LOGIN_WITH_EDITOR_QUERY);
    expect(state.kind).toBe('login');
    expect(state.isEditorUrl).toBe(false);
    expect(state.isLoginRedirect).toBe(true);
  });

  it('정상 에디터 URL은 그대로 인식(오탐 없음)', () => {
    expect(isNaverWriteEditorUrl('https://blog.naver.com/GoBlogWrite.naver')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/PostWriteForm.naver?blogId=x')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/leader_248?Redirect=Write&')).toBe(true);
    expect(classifyBlogWriteNavigationUrl('https://blog.naver.com/GoBlogWrite.naver').kind).toBe('editor');
  });
});
