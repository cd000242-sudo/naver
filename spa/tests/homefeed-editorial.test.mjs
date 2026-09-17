import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/lib/homefeedModel.mjs';

const ready = () => ({
    state: 'ready', evidenceRevision: 'e1', summary: '기존 요약', sourceTitle: '원문 제목',
    brief: { revision: 'b1', evidenceRevision: 'e1', summary: '근거를 읽고 만든 사건 요약', audience: '첫 집을 구하는 사람', readiness: 'ready', review: { passed: true },
        recommendedAngleId: 'a', angles: [{ id: 'a', label: '보증금 반환 조건', readerQuestion: '언제 돌려받을 수 있나?' }] },
    selection: { revision: 2, briefRevision: 'b1', evidenceRevision: 'e1', angleId: 'a', title: '선택 제목', card: { line1: '첫 줄', line2: '' }, imageId: null },
});

test('목록은 검토된 사건과 관점·독자 질문을 우선하고 미작성은 기사 제목으로 명시한다', () => {
    const card = model.editorialCardModel(ready(), '키워드');
    assert.equal(card.headline, '근거를 읽고 만든 사건 요약');
    assert.equal(card.angle, '보증금 반환 조건');
    assert.equal(card.question, '언제 돌려받을 수 있나?');
    assert.equal(card.sourceOnly, false);
    const pending = model.editorialCardModel({ state: 'unprepared', sourceTitle: '원문 제목', summary: '', brief: null }, '키워드');
    assert.equal(pending.headline, '원문 제목');
    assert.equal(pending.sourceOnly, true);
    assert.equal(pending.angle, null);
});

test('원고는 검토 통과한 최신 작성안과 저장한 최신 선택이 있어야 가능하다', () => {
    const view = ready();
    assert.equal(model.editorialDraftBlock(view), null);
    assert.ok(model.editorialDraftBlock({ ...view, selection: null }));
    assert.ok(model.editorialDraftBlock({ ...view, state: 'stale' }));
    assert.ok(model.editorialDraftBlock({ ...view, brief: { ...view.brief, review: { passed: false } } }));
    assert.ok(model.editorialDraftBlock({ ...view, selection: { ...view.selection, briefRevision: 'old' } }));
    assert.ok(model.editorialDraftBlock({ ...view, selection: { ...view.selection, evidenceRevision: 'old' } }));
    assert.ok(model.editorialDraftBlock({ ...view, selection: { ...view.selection, angleId: 'missing' } }));
    assert.ok(model.editorialDraftBlock({ ...view, public: true }));
});

test('편집 중인 제목·카드·이미지를 저장하지 않은 상태에서 원고 생성하지 않는다', () => {
    const view = ready();
    assert.equal(model.editorialSelectionMatches(view.selection, { ...view.selection }), true);
    for (const changed of [{ title: '새 제목' }, { card: { line1: '수정 첫줄', line2: '' } }, { imageId: 'source-2' }, { angleId: 'b' }]) {
        assert.equal(model.editorialSelectionMatches(view.selection, { ...view.selection, ...changed }), false);
    }
});

test('선택을 다시 저장한 뒤 이전 원고를 현재 선택 원고로 표시하지 않는다', () => {
    const view = ready();
    const draft = { briefRevision: 'b1', selectionRevision: 2 };
    assert.equal(model.editorialDraftMatches(view, draft, view.selection), true);
    const changed = { ...view, selection: { ...view.selection, revision: 3 } };
    assert.equal(model.editorialDraftMatches(changed, draft, changed.selection), false);
    assert.equal(model.editorialDraftMatches({ ...view, state: 'stale' }, draft, view.selection), false);
    assert.equal(model.editorialDraftMatches(view, {}, view.selection), false);
    assert.equal(model.editorialDraftMatches(view, draft, { ...view.selection, title: '편집 중' }), false);
    assert.ok(model.editorialDraftBlock({ ...view, brief: { ...view.brief, review: undefined } }));
});

test('공개파일 작성 결과의 경로 문자열과 null 실패를 구분한다', () => {
    assert.match(model.editorialShareNotice({ publishResult: { written: 'public/data/homefeed-stories.json', reason: null } }), /갱신했습니다/);
    assert.doesNotMatch(model.editorialShareNotice({ publishResult: { written: null, reason: '파일 쓰기 실패' } }), /갱신했습니다/);
    assert.match(model.editorialShareNotice({ publishResult: { written: null, reason: '파일 쓰기 실패' } }), /파일 쓰기 실패/);
    assert.doesNotMatch(model.editorialShareNotice({}), /갱신했습니다/);
});

test('후보 준비는 최대 세 건이며 병렬 생성하지 않고 실패 후 다음 후보를 진행한다', async () => {
    let active = 0; let max = 0;
    const called = [];
    const results = await model.prepareEditorialCandidates([1, 2, 3, 4], async (id) => {
        called.push(id); active++; max = Math.max(max, active);
        await Promise.resolve(); active--;
        if (id === 2) throw new Error('본문 확인 실패');
        return id;
    });
    assert.deepEqual(called, [1, 2, 3]);
    assert.equal(max, 1);
    assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
});

test('규칙 라벨은 독자의 이해·재미나 성과를 판정한 것처럼 단정하지 않는다', () => {
    assert.doesNotMatch(model.CHECK_LABEL.situation_in_1s, /바로 보임|1초/);
    assert.doesNotMatch(model.CHECK_LABEL.image_curiosity, /궁금하게 만듦/);
    assert.doesNotMatch(model.STATUS_LABEL.NOW, /쓸 만함/);
});
