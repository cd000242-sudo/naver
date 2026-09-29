import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { benchmarkTime, benchmarkView, filterBenchmarks, normalizeBenchmarkBoard, type BenchmarkBoard } from '../../../lib/homefeedBenchmarkModel.mjs';
import HomefeedBenchmarkCard from './HomefeedBenchmarkCard';
import HomefeedBenchmarkStyles from './HomefeedBenchmarkStyles';

const FILTERS = [['all','전체'],['recommended','★ 우선 검토'],['review-now','지금 검토'],['verify','추가 확인'],['stale','시점 재검토']];
const SOURCE_STATUS = {ok:'수집 확인',failed:'수집 실패',unavailable:'확인 못함'};

export default function HomefeedBenchmarkBoard() {
 const [data,setData] = useState<BenchmarkBoard|null>(null);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const [category,setCategory] = useState('전체');
 const [status,setStatus] = useState('all');
 const [query,setQuery] = useState('');
 const [now,setNow] = useState(Date.now());
 const [limit,setLimit] = useState(12);
 const request = useRef<AbortController|null>(null);
 const load = useCallback(async () => {
  request.current?.abort();
  const controller = new AbortController(); request.current = controller;
  const timeout = window.setTimeout(()=>controller.abort(),15_000);
  setLoading(true);
  try {
   const response = await fetch('/data/homefeed-benchmarks.json',{cache:'no-store',signal:controller.signal});
   if (!response.ok) throw new Error('공개 벤치마크 자료를 불러오지 못했습니다.');
   const next = normalizeBenchmarkBoard(await response.json());
   if(request.current !== controller) return;
   setData(next); setError(''); setNow(Date.now());
  } catch (cause) {
   if(request.current === controller) setError(controller.signal.aborted ? '불러오는 시간이 길어졌습니다. 잠시 후 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '자료를 불러오지 못했습니다.');
  } finally { window.clearTimeout(timeout); if(request.current === controller) setLoading(false); }
 },[]);
 useEffect(()=>{
  void load();
  const timer=window.setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible') void load();},60_000);
  return ()=>{window.clearInterval(timer); const active=request.current;request.current=null;active?.abort();};
 },[load]);
 useEffect(()=>setLimit(12),[category,status,query]);
 const view=useMemo(()=>data ? benchmarkView(data,now) : null,[data,now]);
 const categories=useMemo(()=>['전체',...new Set(view?.candidates.map(c=>c.category)??[])],[view]);
 const items=useMemo(()=>filterBenchmarks(view?.candidates??[],{category,status,query}),[view,category,status,query]);
 const healthy=view?.sources.filter(s=>s.status==='ok').length??0;
 return <section className="hf-benchmark" aria-label="채널 벤치마크 추천">
  <HomefeedBenchmarkStyles />
  <header className="hfb-header">
   <div><span className="hfb-eyebrow">BENCHMARK RADAR · 리더남의 채널 리스트</span><h2>발견한 소재를, <span>지금 쓸 이야기로.</span></h2><p>벤치마크 채널 전체에서 작성 시점과 근거를 검토합니다.</p></div>
   <div className="hfb-count"><strong>{view?.candidates.length ?? '—'}</strong><span>검토할 소재</span></div>
  </header>
  <div className="hfb-meta"><span>{view ? `마지막 수집 ${benchmarkTime(view.generatedAt)} KST` : '벤치마크 자료 연결 중'}</span><button type="button" onClick={()=>void load()} disabled={loading}>{loading?'불러오는 중…':'자료 새로고침'}</button></div>
  {error && <div className="hfb-alert" role="alert">{error}{view && ' 마지막으로 읽은 자료를 보여드립니다.'}</div>}
  {view?.stale && <div className="hfb-alert" role="status">최근 36시간 안에 확인된 자료가 아닙니다. 우선 추천 별을 내리고 시점 재검토로 표시했습니다.</div>}
  {!view && !loading && !error && <p className="hfb-empty">아직 공개된 벤치마크 자료가 없습니다.</p>}
  {view && <>
   <details className="hfb-coverage"><summary>출처 {healthy}/{view.sourceCount}곳 확인 · 게시물 {view.collectedPostCount.toLocaleString('ko-KR')}개 수집 <span>{healthy<view.sourceCount ? `· ${view.sourceCount-healthy}곳 확인 필요` : ''}</span><small>수집 상태 보기</small></summary>
    <p>게시물 수는 수집 범위입니다. 추천 수나 본문·반응 검증 수와 다릅니다.</p>
    <div className="hfb-source-grid">{view.sources.map((s,index)=><div key={`${s.id}-${index}`} className="hfb-channel"><b>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a> : s.name}</b><span data-state={s.status}>{SOURCE_STATUS[s.status]}{s.status==='ok'?` · ${s.postCount}개`:''}</span>{s.reason&&<small>{s.reason}</small>}<small>확인 {benchmarkTime(s.capturedAt)}</small></div>)}</div>
   </details>
   <div className="hfb-filters">
    <div className="hfb-filter-row" role="group" aria-label="검토 상태">{FILTERS.map(([id,label])=><button type="button" key={id} aria-pressed={status===id} onClick={()=>setStatus(id)}>{label} <span>{id==='all'?view.candidates.length:id==='recommended'?view.candidates.filter(c=>c.recommended).length:view.candidates.filter(c=>c.status===id).length}</span></button>)}</div>
    <div className="hfb-filter-bottom"><div className="hfb-categories" role="group" aria-label="분야">{categories.map(c=><button type="button" key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div><input type="search" aria-label="벤치마크 소재 검색" placeholder="키워드·이야기 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   </div>
   <p className="hfb-legend">★는 근거와 작성 재료를 갖춘 우선 검토 소재입니다. 홈판 노출 확인과는 별개이며, 제목은 작성용 제안입니다.</p>
   <div className="hfb-list">{items.slice(0,limit).map(c=><HomefeedBenchmarkCard key={c.id} candidate={c}/>)}</div>
   {items.length===0 && <div className="hfb-empty"><strong>이 조건에 맞는 소재가 없습니다.</strong><button type="button" onClick={()=>{setCategory('전체');setStatus('all');setQuery('');}}>전체 소재 보기</button></div>}
   {items.length>limit&&<button type="button" className="hfb-more" onClick={()=>setLimit(n=>n+12)}>소재 더 보기 · {Math.min(limit,items.length)}/{items.length}</button>}
  </>}
 </section>;
}
