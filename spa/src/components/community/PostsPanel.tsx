import { useCallback, useEffect, useMemo, useState } from 'react';
import { GAS_URL } from '../../lib/siteOps';

/**
 * 커뮤니티 '내 글 홍보' — 서로 들러 주는 판.
 *
 * 이런 판이 죽는 이유는 하나다: 올리기만 하고 아무도 안 들르는 것.
 * 그래서 상호성을 구조에 박았다(사장님 설계 2026-08-21).
 *   ① 순서를 **들른 만큼** 정한다 — 서버가 given 내림차순으로 준다.
 *   ② 상대가 얼마나 들렀는지 카드에 적는다. 받기만 하는 사람은 티가 난다.
 *   ③ 주소를 넣으면 그 글을 실제로 열어 **제목을 읽어 온다** — 없는 글·남의
 *      글·낚시 제목을 막는다.
 *   ④ 하루 3개까지.
 *
 * 화면이 만드는 숫자는 없다. 들른 수·올라온 수는 전부 서버 집계다.
 */

type Post = {
    timestamp: string;
    author: string;
    url: string;
    title: string;
    summary: string;
    platform: string;
    visits: number;
    given: number;
};

const PLATFORM_LABEL: Record<string, string> = {
    naver: '네이버', tistory: '티스토리', blogspot: '블로그스팟', brunch: '브런치', etc: '기타',
};

/** 내가 누구인지 이 브라우저에 기억해 둔다 — 들른 기록을 내 글에 붙이려면 필요하다. */
const ME_KEY = 'leaderspro.posts.me';
type Me = { author: string; email: string };
function loadMe(): Me {
    try { return { author: '', email: '', ...JSON.parse(localStorage.getItem(ME_KEY) || '{}') }; } catch { return { author: '', email: '' }; }
}
function saveMe(me: Me) {
    try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch { /* 저장 못 해도 동작은 한다 */ }
}

/** 들른 글은 이 브라우저에 남긴다 — 어디까지 봤는지 보이게. */
const VISITED_KEY = 'leaderspro.posts.visited';
function loadVisited(): string[] {
    try { return JSON.parse(localStorage.getItem(VISITED_KEY) || '[]'); } catch { return []; }
}

const WORKER_URL = 'https://leword-keyword-api.leword.workers.dev/';

async function gas(payload: Record<string, unknown>) {
    const res = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({ success: false, message: '응답을 읽지 못했습니다.' }));
}

function timeAgo(iso: string): string {
    const at = new Date(iso).getTime();
    if (!Number.isFinite(at)) return '';
    const min = Math.round((Date.now() - at) / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`;
    return `${Math.round(min / (60 * 24))}일 전`;
}

function PostsPanel() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [today, setToday] = useState<{ posts: number; visits: number }>({ posts: 0, visits: 0 });
    const [dailyLimit, setDailyLimit] = useState(3);
    const [loading, setLoading] = useState(true);
    const [platform, setPlatform] = useState('');
    const [visited, setVisited] = useState<string[]>(loadVisited);

    const [open, setOpen] = useState(false);
    const [me, setMe] = useState<Me>(loadMe);
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [reading, setReading] = useState(false);
    const [readNote, setReadNote] = useState('');
    const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${GAS_URL}?action=get-posts`, { cache: 'no-store' });
            const data = await res.json();
            setPosts(Array.isArray(data?.posts) ? data.posts : []);
            if (data?.today) setToday(data.today);
            if (data?.dailyLimit) setDailyLimit(data.dailyLimit);
        } catch {
            /* 목록을 못 받아도 화면은 살아 있어야 한다 */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    /*
     * 주소를 넣으면 그 글을 실제로 열어 제목을 읽는다. 사용자가 적은 제목을
     * 그대로 믿으면 들른 사람이 다른 글을 보게 되어 판이 죽는다.
     */
    const readTitle = async (value: string) => {
        const target = value.trim();
        if (!/^https?:\/\//.test(target)) { setReadNote(''); return; }
        setReading(true);
        setReadNote('글을 여는 중…');
        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'community-post-title', url: target }),
            });
            const data = await res.json();
            if (data?.ok) {
                setTitle(data.title);
                setReadNote(`✓ 제목을 읽어 왔습니다 · ${PLATFORM_LABEL[data.platform] || '기타'}`);
                if (!summary && data.description) setSummary(String(data.description).slice(0, 200));
            } else {
                setReadNote(data?.message || '제목을 읽지 못했습니다.');
            }
        } catch {
            setReadNote('글을 열지 못했습니다 — 주소를 확인해 주세요.');
        } finally {
            setReading(false);
        }
    };

    const submit = async () => {
        if (sending) return;
        if (!me.author.trim()) { setMsg({ text: '닉네임을 적어 주세요.', type: 'error' }); return; }
        if (!title.trim()) { setMsg({ text: '주소를 넣어 제목을 먼저 읽어 주세요.', type: 'error' }); return; }
        if (!summary.trim()) { setMsg({ text: '한 줄 소개를 적어 주세요 — 무엇이 적혀 있는지 알아야 들릅니다.', type: 'error' }); return; }
        setSending(true);
        setMsg(null);
        const result = await gas({
            action: 'post-submit',
            author: me.author.trim(), email: me.email.trim(),
            url: url.trim(), title: title.trim(), summary: summary.trim(),
        });
        setSending(false);
        if (result?.success) {
            saveMe(me);
            setMsg({ text: `올렸습니다. 오늘 ${result.remaining ?? 0}개 더 올릴 수 있습니다.`, type: 'ok' });
            setUrl(''); setTitle(''); setSummary(''); setReadNote('');
            void load();
        } else {
            setMsg({ text: result?.message || '올리지 못했습니다.', type: 'error' });
        }
    };

    /** 들르기 — 새 창으로 열고, 방문을 센다. 내 글이 있으면 그 글의 품앗이 수가 오른다. */
    const visit = (post: Post) => {
        window.open(post.url, '_blank', 'noopener');
        void gas({ action: 'post-visit', url: post.url, visitorEmail: me.email.trim() });
        const next = [...new Set([...visited, post.url])];
        setVisited(next);
        try { localStorage.setItem(VISITED_KEY, JSON.stringify(next)); } catch { /* 계속 */ }
        setPosts((rows) => rows.map((r) => (r.url === post.url ? { ...r, visits: r.visits + 1 } : r)));
    };

    const counts = useMemo(() => {
        const map: Record<string, number> = {};
        posts.forEach((p) => { map[p.platform] = (map[p.platform] || 0) + 1; });
        return map;
    }, [posts]);

    const shown = platform ? posts.filter((p) => p.platform === platform) : posts;
    const myVisitsToday = visited.length;

    return (
        <div className="cp">
            {/*
              * 판이 하나뿐이라 제목·설명이 페이지 머리와 겹쳤다(2026-08-23).
              * 같은 말을 두 번 읽히지 않는다 — 여기서는 규칙만 남긴다.
              */}
            <header className="cp-head">
                <div className="cp-rules">
                    <span>하루 <b>{dailyLimit}개</b>까지</span>
                    <span>내가 쓴 글만</span>
                    <span>제목·주소 <b>실제 확인</b></span>
                    <span>들른 만큼 <b>위로</b></span>
                </div>
            </header>

            {/* 이 판이 도는 원리를 숫자로 — 전부 서버 집계다 */}
            <section className="cp-today">
                <div><b>{today.visits}</b><span>오늘 서로 들른 횟수</span></div>
                <div><b>{today.posts}</b><span>오늘 올라온 글</span></div>
                <div><b>{myVisitsToday}</b><span>내가 들른 글 — 들를수록 내 글이 위로</span></div>
            </section>

            <div className="cp-bar">
                <div className="cp-chips">
                    <button type="button" className={platform === '' ? 'on' : ''} onClick={() => setPlatform('')}>
                        전체<em>{posts.length}</em>
                    </button>
                    {Object.entries(counts).map(([key, n]) => (
                        <button key={key} type="button" className={platform === key ? 'on' : ''} onClick={() => setPlatform(key)}>
                            {PLATFORM_LABEL[key] || key}<em>{n}</em>
                        </button>
                    ))}
                </div>
                <button type="button" className="cp-write" onClick={() => setOpen((v) => !v)}>
                    {open ? '닫기' : '＋ 내 글 올리기'}
                </button>
            </div>

            {open && (
                <section className="cp-composer">
                    <div className="cp-row">
                        <label>
                            <span>닉네임</span>
                            <input value={me.author} onChange={(e) => setMe({ ...me, author: e.target.value })} placeholder="화면에 보일 이름" />
                        </label>
                        <label>
                            <span>이메일 <i>(선택 — 넣으면 내가 들른 기록이 내 글에 쌓입니다)</i></span>
                            <input value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} placeholder="example@email.com" />
                        </label>
                    </div>

                    <label className="cp-field">
                        <span>글 주소</span>
                        <input
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setReadNote(''); }}
                            onBlur={(e) => void readTitle(e.target.value)}
                            placeholder="https://blog.naver.com/…"
                        />
                        {readNote && <em className={readNote.startsWith('✓') ? 'ok' : ''}>{readNote}</em>}
                    </label>

                    <label className="cp-field">
                        <span>제목</span>
                        <input value={title} readOnly placeholder={reading ? '읽는 중…' : '주소를 넣으면 자동으로 읽어 옵니다'} />
                        <em>글에서 읽어 온 제목입니다. 실제 글과 달라지면 들른 사람이 돌아갑니다.</em>
                    </label>

                    <label className="cp-field">
                        <span>한 줄 소개</span>
                        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="이 글에서 무엇을 알 수 있는지 한두 문장으로" />
                        <em>‘좋은 글입니다’보다, 무엇이 적혀 있는지 적어 주세요. 그래야 들릅니다.</em>
                    </label>

                    {msg && <p className={`cp-msg ${msg.type}`}>{msg.text}</p>}

                    <div className="cp-composer-foot">
                        <span>올린 글은 바로 보입니다 · 남의 글을 올리면 내려갑니다</span>
                        <button type="button" onClick={() => void submit()} disabled={sending}>
                            {sending ? '올리는 중…' : '올리기'}
                        </button>
                    </div>
                </section>
            )}

            {loading ? (
                <p className="cp-empty">불러오는 중입니다.</p>
            ) : shown.length === 0 ? (
                <div className="cp-empty">
                    <b>아직 올라온 글이 없습니다</b>
                    <p>첫 글을 올려 주세요. 이 판은 서로 들러 주는 만큼 돕니다.</p>
                </div>
            ) : (
                <div className="cp-list">
                    {shown.map((post, i) => (
                        <article key={post.url} className={`cp-post${visited.includes(post.url) ? ' visited' : ''}`} style={{ ['--i' as string]: i }}>
                            <div className="cp-post-main">
                                <div className="cp-post-top">
                                    <span className={`cp-plat ${post.platform}`}>{PLATFORM_LABEL[post.platform] || post.platform}</span>
                                    <span className="cp-when">{timeAgo(post.timestamp)}</span>
                                </div>
                                <h3><a href={post.url} target="_blank" rel="noreferrer noopener" onClick={(e) => { e.preventDefault(); visit(post); }}>{post.title}</a></h3>
                                <p className="cp-desc">{post.summary}</p>
                                <div className="cp-meta">
                                    <span>{post.author}</span>
                                    <span>들른 사람 <b>{post.visits}</b></span>
                                    <span>이 사람이 들른 글 <b>{post.given}</b></span>
                                </div>
                            </div>
                            <button type="button" className="cp-go" onClick={() => visit(post)}>
                                <b>{post.visits}</b>
                                <span>{visited.includes(post.url) ? '들렀음 ✓' : '들르기'}</span>
                            </button>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PostsPanel;
