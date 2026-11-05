/**
 * [2026-11-05] 사장님: "임시발행하면 AI 활용 체크가 안 먹히네?"
 *
 * The representative-photo + AI-use mark pass lived only inside the immediate-publish branch of
 * publishBlogPost, so draft saves and scheduled posts never got it. It must run in all three modes,
 * before the draft save click / the publish modal / the schedule dialog.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(__dirname, '..', 'naverBlogAutomation.ts'), 'utf8');
const start = source.indexOf('async publishBlogPost(');
const end = source.indexOf('private async applyPlainContent(', start);
const body = source.slice(start, end);
const draftAt = body.indexOf("if (mode === 'draft') {");
const publishAt = body.indexOf("} else if (mode === 'publish') {");
const scheduleAt = body.indexOf("} else if (mode === 'schedule') {");
const CALL = 'await prepareEditorImagesForCommit(';

describe('AI-use mark and representative photo run in every publish mode', () => {
  it('finds the three branches of publishBlogPost', () => {
    expect(start).toBeGreaterThan(0);
    expect(draftAt).toBeGreaterThan(0);
    expect(publishAt).toBeGreaterThan(draftAt);
    expect(scheduleAt).toBeGreaterThan(publishAt);
  });

  it('defines the image pass once, before the mode branches', () => {
    const defAt = body.indexOf('const prepareEditorImagesForCommit = async');
    expect(defAt).toBeGreaterThan(0);
    expect(defAt).toBeLessThan(draftAt);
    expect(body.split('[대표사진 v11] 에디터 내 대표이미지 직접 설정').length - 1).toBe(1);
  });

  it('runs it in the draft branch before the save button is clicked', () => {
    const draft = body.slice(draftAt, publishAt);
    const callAt = draft.indexOf(CALL);
    expect(callAt).toBeGreaterThan(0);
    expect(callAt).toBeLessThan(draft.indexOf('await saveButton.click()'));
  });

  it('runs it in the immediate-publish branch', () => {
    expect(body.slice(publishAt, scheduleAt)).toContain(CALL);
  });

  it('runs it in the schedule branch before the schedule dialog opens', () => {
    const schedule = body.slice(scheduleAt);
    const callAt = schedule.indexOf(CALL);
    expect(callAt).toBeGreaterThan(0);
    expect(callAt).toBeLessThan(schedule.indexOf('await this.publishScheduled('));
  });
});
