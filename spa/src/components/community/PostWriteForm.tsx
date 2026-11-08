import { useState, type FormEvent } from 'react';
import { boardApi, type PostDraft } from '../../lib/communityApi';
import { normalizePost, type PostItem } from '../../lib/communityData';
import { BODY_MAX, TITLE_MAX, canWriteBoard, validatePostDraft, writableBoards, writeBlockedHint, type BoardConfig } from '../../lib/communityModel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import { readPromoTitle } from '../../lib/promoTitle';
import NicknameForm from './NicknameForm';

type Props = {
    boards: readonly BoardConfig[];
    defaultBoard: string;
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

/** Write or edit a post. Promo posts: the address is read to get the real title, plus a one-line intro. */
function PostWriteForm({ boards, defaultBoard, profile, onDone, onSubmitNew, onCancel, editing }: Props) {
    const choices = writableBoards(boards, profile);
    const first = choices.find((entry) => entry.id === defaultBoard) ?? choices.find((entry) => entry.id === 'free') ?? choices[0];
    const [boardId, setBoardId] = useState(editing?.board ?? first?.id ?? 'free');
    const [title, setTitle] = useState(editing?.title ?? '');
    const [body, setBody] = useState(editing?.body ?? '');
    const [url, setUrl] = useState(editing?.url ?? '');
    const [readNote, setReadNote] = useState('');
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const board = boards.find((entry) => entry.id === boardId);
    const promo = boardId === 'promo';
    // Opened from the notice board: it cannot be written to, so say why and offer the other boards.
    const blocked = writeBlockedHint(defaultBoard, profile);

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

    const readTitle = async () => {
        if (editing || reading || !url.trim()) return;
        setReading(true);
        setReadNote('글을 여는 중…');
        const result = await readPromoTitle(url);
        setReading(false);
        if (result.ok) {
            setTitle(result.title);
            if (!body.trim() && result.description) setBody(result.description.slice(0, 200));
            setReadNote('제목을 읽어 왔어요.');
        } else {
            setTitle('');
            setReadNote(result.message);
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!editing && !canWriteBoard(board, profile)) { setError('이 게시판에는 글을 쓸 수 없어요.'); return; }
        const problem = validatePostDraft({ boards, board: boardId, title, body, url });
        if (problem) { setError(problem); return; }
        setError('');
        if (!editing && onSubmitNew) {
            onSubmitNew({ board: boardId, title: title.trim(), body: body.trim(), url: url.trim() });
            return;
        }
        setBusy(true);
        const result = editing
            ? await boardApi.updatePost(editing.id, { title: title.trim(), body: body.trim(), promo })
            : await boardApi.writePost({ board: boardId, title: title.trim(), body: body.trim(), url: url.trim() });
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
                <>
                    <label className="lp-field">
                        <span>글 주소</span>
                        <input className="lp-input" type="url" inputMode="url" name="url" value={url} readOnly={Boolean(editing)}
                            placeholder="https://blog.naver.com/…" onChange={(event) => { setUrl(event.target.value); setReadNote(''); }}
                            onBlur={() => { void readTitle(); }} />
                        {readNote ? <small role="status">{readNote}</small> : null}
                    </label>
                    <label className="lp-field">
                        <span>제목</span>
                        <input className="lp-input" type="text" name="title" value={title} readOnly
                            placeholder={reading ? '읽는 중…' : '주소를 넣으면 자동으로 읽어 와요'} />
                        <small>글에서 읽어 온 제목이에요. 실제 글과 달라지면 들른 사람이 돌아가요.</small>
                    </label>
                    <label className="lp-field">
                        <span>한 줄 소개</span>
                        <textarea className="lp-textarea cm-short" name="summary" value={body} maxLength={300}
                            placeholder="이 글에서 무엇을 알 수 있는지 한두 문장으로" onChange={(event) => setBody(event.target.value)} />
                        <small>‘좋은 글입니다’보다 무엇이 적혀 있는지 적어 주세요. 그래야 들러요.</small>
                    </label>
                </>
            ) : (
                <>
                    <label className="lp-field">
                        <span>제목</span>
                        <input className="lp-input" type="text" name="title" value={title} maxLength={TITLE_MAX} onChange={(event) => setTitle(event.target.value)} />
                    </label>
                    <label className="lp-field">
                        <span>내용</span>
                        <textarea className="lp-textarea" name="body" value={body} maxLength={BODY_MAX} onChange={(event) => setBody(event.target.value)} />
                        <small>{body.length.toLocaleString('en-US')}/{BODY_MAX.toLocaleString('en-US')}자</small>
                    </label>
                </>
            )}
            {board && !editing && board.dailyLimit > 0 ? <p className="au-help">하루에 {board.dailyLimit}개까지 올릴 수 있어요.</p> : null}
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <div className="cm-form-actions">
                <button type="button" className="lp-btn lp-btn-line" onClick={onCancel}>취소</button>
                <button type="submit" className="lp-btn lp-btn-dark" disabled={busy}>{busy ? '올리는 중…' : editing ? '고치기' : '올리기'}</button>
            </div>
        </form>
    );
}

export default PostWriteForm;
