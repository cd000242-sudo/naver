import { useEffect, useRef, useState } from 'react';
import { createAppBriefTitle, loadSavedBriefTitles } from '../lib/boardBridge';
import { mergeBriefTitles, type SavedBriefTitle } from '../lib/boardFallback';
import { bridgeFailureNote } from '../lib/bridge';
import './AppBriefTitles.css';

const keyOf = (value: string) => value.replace(/\s+/g, '').toLowerCase();
export default function AppBriefTitles({keyword, fallback}: {keyword: string; fallback?: {seo?:string;home?:string;topic?:string;summary?:string}}) {
    const [saved, setSaved] = useState<SavedBriefTitle | null>(null);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const active = useRef(keyword);
    useEffect(() => {
        active.current = keyword;
        let alive = true;
        setSaved(null); setBusy(false); setNote('');
        // Cache reads only. Opening a page never starts a model.
        loadSavedBriefTitles().then(titles => { if (alive) {
            const incoming = titles.find(title => keyOf(title.keyword) === keyOf(keyword)) || null;
            setSaved(previous => previous && (!incoming || Date.parse(previous.at) >= Date.parse(incoming.at)) ? previous : incoming);
        } });
        return () => { alive = false; active.current = ''; };
    }, [keyword]);
    const create = async () => {
        if (busy) return;
        setBusy(true); setNote('앱에서 기사 근거를 확인하고 제목을 만들고 있습니다.');
        const result = await createAppBriefTitle(keyword);
        if (active.current !== keyword) return;
        setBusy(false);
        if (result.status !== 'ok') { setNote(bridgeFailureNote(result, '제목을 만들지 못했습니다')); return; }
        const matched = mergeBriefTitles(null, result.result.board).find(title => keyOf(title.keyword) === keyOf(keyword));
        if (!matched) { setNote('이 검색어의 기사 근거와 검증된 제목이 아직 없습니다. 기존 자료를 유지합니다.'); return; }
        setSaved(previous => previous && Date.parse(previous.at) > Date.parse(matched.at) ? previous : matched); setNote('앱에서 만든 제목을 가져왔습니다.');
    };
    const titles = saved || fallback;
    return <section className="app-brief-titles" aria-label={`${keyword} 추천 제목`}>
        <div className="app-brief-title-head"><strong>글로 이어갈 제목</strong><small>{saved?.source === 'app' ? '이 PC 앱 결과' : '공개 자료'}{saved ? ` · ${new Date(saved.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})}` : ''}</small></div>
        {titles?.seo || titles?.home ? <dl>{titles.seo && <div><dt>설명형</dt><dd>{titles.seo}</dd></div>}{titles.home && <div><dt>관심형</dt><dd>{titles.home}</dd></div>}</dl> : <p>준비된 제목이 없습니다. 앱에 저장된 결과가 있으면 자동으로 가져옵니다.</p>}
        <button type="button" disabled={busy} onClick={() => void create()}>{busy ? '앱에서 만드는 중…' : '앱에서 제목 만들기'}</button>
        <p role="status" aria-live="polite">{note || 'LEWORD 앱을 켜 두세요. 생성 버튼을 누를 때만 내 구독을 사용합니다.'}</p>
    </section>;
}
