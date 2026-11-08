import { useMemo, useRef, useState, type FormEvent } from 'react';
import { boardApi, type PostDraft } from '../../lib/communityApi';
import { normalizePost, type PostItem } from '../../lib/communityData';
import { associateWriteState, isAssociate } from '../../lib/communityLevel.mjs';
import { BODY_MAX, TITLE_MAX, canWriteBoard, validatePostDraft, writableBoards, writeBlockedHint, type BoardConfig } from '../../lib/communityModel.mjs';
import { checkRichDraft, parseRichBody, richPlainText, serializeRichDoc } from '../../lib/communityRich.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import LevelUpCard from './LevelUpCard';
import NicknameForm from './NicknameForm';
import PromoFields, { usePromoDraft } from './PromoFields';
import RichEditor, { type RichEditorHandle } from './RichEditor';

type Props = {
    boards: readonly BoardConfig[];
    defaultBoard: string;
    /** The promo sub-tab the writer came from ('naver' | 'google'). */
    defaultPlatform?: string;
    profile: CommunityProfile;
    onDone: (post: PostItem | null) => void;
    /**
     * A NEW post: the page puts it on top of the list at once and sends it in the background, so the form
     * does not wait for the server. Without it (or when editing) the form waits for the answer as before.
     */
    onSubmitNew?: (draft: PostDraft) => void;
    onCancel: () => void;
    /** Editing an existing post: the board cannot change, a promo post keeps its address and title. */
    editing?: PostItem;
};

/**
 * Write or edit a post. Promo posts: the platform and address are read to get the real title, plus a one-line intro.
 * Every other new post is written in the rich editor; an old plain-text post is edited as plain text.
 */
function PostWriteForm({ boards, defaultBoard, defaultPlatform, profile, onDone, onSubmitNew, onCancel, editing }: Props) {
    const choices = writableBoards(boards, profile);
    const first = choices.find((entry) => entry.id === defaultBoard) ?? choices.find((entry) => entry.id === 'free') ?? choices[0];
    const [boardId, setBoardId] = useState(editing?.board ?? first?.id ?? 'free');
    const [title, setTitle] = useState(editing?.title ?? '');
    const [body, setBody] = useState(editing?.format === 'rich' ? '' : editing?.body ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const editor = useRef<RichEditorHandle>(null);
    const promoDraft = usePromoDraft(editing, defaultPlatform);
    const initialBlocks = useMemo(() => (editing?.format === 'rich' ? parseRichBody(editing.body).blocks : undefined), [editing]);

    const board = boards.find((entry) => entry.id === boardId);
    const promo = boardId === 'promo';
    const rich = !promo && (!editing || editing.format === 'rich');
    // Opened from the notice board: it cannot be written to, so say why and offer the other boards.
    const blocked = writeBlockedHint(defaultBoard, profile);
    const gate = editing ? { open: true, reason: '', message: '' } : associateWriteState(profile, boardId);

    if (profile.needsNickname || !profile.nickname) {
        return (
            <section className="lp-box cm-form">
                <h1 className="cm-form-title">글쓰기</h1>
                <p className="lp-note">닉네임을 먼저 정해 주세요. 글과 댓글에 이 닉네임이 보여요.</p>
                <NicknameForm onDone={() => undefined} />
                <button type="button" className="lp-btn lp-btn-line" onClick={onCancel}>돌아가기</button>
            </section>
        );
    }
    if (!gate.open) {
        return (
            <section className="lp-box cm-form">
                <h1 className="cm-form-title">글쓰기</h1>
                <LevelUpCard profile={profile} hint={gate.message} />
                <button type="button" className="lp-btn lp-btn-line" onClick={onCancel}>돌아가기</button>
            </section>
        );
    }

    const readTitle = async () => {
        const found = await promoDraft.read({ summary: body });
        if (!found) return;
        if (found.title !== undefined) setTitle(found.title);
        if (found.summary) setBody(found.summary);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!editing && !canWriteBoard(board, profile)) { setError('이 게시판에는 글을 쓸 수 없어요.'); return; }
        const written = rich ? editor.current?.read() ?? { blocks: [], images: [] } : null;
        const text = written ? richPlainText(written.blocks) : body.trim();
        const problem = validatePostDraft({ boards, board: boardId, title, body: text, url: promoDraft.url, platform: promo ? promoDraft.platform : undefined })
            || (written ? checkRichDraft(written.blocks) : '');
        if (problem) { setError(problem); return; }
        setError('');
        const draft: PostDraft = {
            board: boardId, title: title.trim(), body: written ? serializeRichDoc(written.blocks) : body.trim(), url: promoDraft.url.trim(),
            ...(promo ? { platform: promoDraft.platform } : {}), ...(written ? { format: 'rich' as const, images: written.images } : {}),
        };
        if (!editing && onSubmitNew) { onSubmitNew(draft); return; }
        setBusy(true);
        const result = editing
            ? await boardApi.updatePost(editing.id, { title: draft.title, body: draft.body, promo, images: draft.images })
            : await boardApi.writePost(draft);
        setBusy(false);
        if (result.ok) onDone(normalizePost((result as { post?: unknown }).post));
        else setError(result.message);
    };

    return (
        <form className="lp-box cm-form" onSubmit={(event) => { void submit(event); }} noValidate>
            <h1 className="cm-form-title">{editing ? '글 고치기' : '글쓰기'}</h1>
            {editing || !blocked ? null : <p className="lp-note" role="note">{blocked}</p>}
            {editing ? null : (
                <label className="lp-field">
                    <span>게시판</span>
                    <select className="lp-select" value={boardId} onChange={(event) => { setBoardId(event.target.value); setError(''); }}>
                        {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                    {board?.note ? <small>{board.note}</small> : null}
                </label>
            )}
            {promo ? (
                <PromoFields draft={promoDraft} editing={Boolean(editing)} title={title} summary={body} onSummary={setBody} onBlurUrl={() => { void readTitle(); }} />
            ) : (
                <>
                    <label className="lp-field">
                        <span>제목</span>
                        <input className="lp-input" type="text" name="title" value={title} maxLength={TITLE_MAX} onChange={(event) => setTitle(event.target.value)} />
                    </label>
                    {rich ? (
                        <div className="lp-field">
                            <span>내용</span>
                            <RichEditor ref={editor} initialBlocks={initialBlocks} postId={editing?.id} disabled={busy} />
                        </div>
                    ) : (
                        <label className="lp-field">
                            <span>내용</span>
                            <textarea className="lp-textarea" name="body" value={body} maxLength={BODY_MAX} onChange={(event) => setBody(event.target.value)} />
                            <small>{body.length.toLocaleString('en-US')}/{BODY_MAX.toLocaleString('en-US')}자</small>
                        </label>
                    )}
                </>
            )}
            {isAssociate(profile) && !editing ? <p className="au-help">준회원은 자유게시판에 가입 인사 1개를 쓸 수 있어요.</p> : null}
            {board && !editing && !isAssociate(profile) && board.dailyLimit > 0 ? <p className="au-help">하루에 {board.dailyLimit}개까지 올릴 수 있어요.</p> : null}
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <div className="cm-form-actions">
                <button type="button" className="lp-btn lp-btn-line" onClick={onCancel}>취소</button>
                <button type="submit" className="lp-btn lp-btn-dark" disabled={busy}>{busy ? '올리는 중…' : editing ? '고치기' : '올리기'}</button>
            </div>
        </form>
    );
}

export default PostWriteForm;
