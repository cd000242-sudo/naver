import { useState } from 'react';
import { bridgeBenchmarkTitles } from '../../../lib/bridge';
import { benchmarkTime, metricText, type BenchmarkCandidate } from '../../../lib/homefeedBenchmarkModel.mjs';
import type { HomefeedEvidence } from '../../../lib/homefeedEvidence.mjs';
const monthDay=(day:string)=>{const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(day||'');return m?`${Number(m[1])}/${Number(m[2])}`:day;};
const LABELS = {'review-now':'지금 검토',verify:'추가 확인',stale:'시점 재검토'};
function TitleRow({label,text,editor=false}:{label:string;text:string;editor?:boolean}) {
 const [notice,setNotice]=useState('');
 const copy=async()=>{try {await navigator.clipboard.writeText(text);setNotice('복사됨');} catch {setNotice('제목을 선택해 복사해 주세요');}};
 return <div className={`hfb-title-row${editor?' editor':''}`}><span>{label}</span><p>{text}</p><button type="button" onClick={()=>void copy()} aria-label={`${label} 제목 복사`}>복사</button><small role="status">{notice}</small></div>;
}
/** 카드 맨 위 소재 제목 복사(2026-10-10 사장님 "이 제목도 복사 가능하게"). */
function CopyHeadline({text}:{text:string}) {
 const [notice,setNotice]=useState('');
 const copy=async()=>{try {await navigator.clipboard.writeText(text);setNotice('복사됨');} catch {setNotice('제목을 선택해 복사해 주세요');}};
 return <span className="hfb-headline-copy"><button type="button" onClick={()=>void copy()} aria-label="소재 제목 복사">복사</button><small role="status">{notice}</small></span>;
}
// 소재 1개당 홈판 후킹형 제목 20개. 검색형은 없다 — 홈판은 제목이 멈추게 해야 한다.
/** 앱이 즉석으로 지은 제목은 이 브라우저에만 기억한다 — 새로고침해도 다시 보이게(다음 회차가 붙이면 그쪽이 우선). */
const MADE_KEY=(id:string)=>`leword.hfb.madeTitles.${id}`;
function readMade(id:string):string[] {try {const v=JSON.parse(localStorage.getItem(MADE_KEY(id))||'null');return Array.isArray(v)?v.filter((t)=>typeof t==='string'):[];} catch {return [];}}
function MakeTitles({c,onMade}:{c:BenchmarkCandidate;onMade:(titles:string[])=>void}) {
 const [state,setState]=useState<'idle'|'loading'>('idle');
 const [note,setNote]=useState('');
 const make=async()=>{
  setState('loading');setNote('');
  const card={id:c.id,keyword:c.keyword,category:c.category||'',title:c.title||'',summary:c.summary||'',sourceTitles:(c.sources||[]).map((s:{title?:string})=>s?.title||'').filter(Boolean).slice(0,6),relatedKeywords:(c.relatedKeywords||[]).slice(0,8)};
  const r=await bridgeBenchmarkTitles(card);
  setState('idle');
  if (r.status==='ok'&&r.result.titles.length) {try {localStorage.setItem(MADE_KEY(c.id),JSON.stringify(r.result.titles));} catch { /* 기억 못 해도 화면엔 보인다 */ } onMade(r.result.titles);return;}
  if (r.status==='ok') {setNote('검사를 통과한 제목이 없었습니다 — 한 번 더 눌러 주세요.');return;}
  if (r.status==='offline') {setNote('PC 에서 LEWORD 앱을 켜 두면 내 구독 AI 로 바로 만듭니다 — 앱을 켠 뒤 다시 눌러 주세요.');return;}
  if (r.status==='outdated') {setNote('LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 최신 버전으로 업데이트해 주세요.');return;}
  setNote(r.message||'만들지 못했습니다 — 잠시 뒤 다시 눌러 주세요.');
 };
 return <div className="hfb-title-empty"><p>이 소재는 아직 회차가 제목을 짓지 못했습니다.</p>
  <button type="button" className="hfb-title-make" disabled={state==='loading'} onClick={()=>void make()}>{state==='loading'?'제목 만드는 중… (약 1~2분)':'지금 제목 만들기 · 내 구독 AI'}</button>
  {note&&<small role="status">{note}</small>}</div>;
}
function TitleList({titles:boardTitles,editorTitle,c}:{titles:string[];editorTitle:string;c:BenchmarkCandidate}) {
 const [made,setMade]=useState<string[]>(()=>boardTitles.length?[]:readMade(c.id));
 const titles=boardTitles.length?boardTitles:made;
 const [open,setOpen]=useState(false);
 const [notice,setNotice]=useState('');
 const shown=open?titles:titles.slice(0,5);
 const copyAll=async()=>{try {await navigator.clipboard.writeText(titles.join('\n'));setNotice(`${titles.length}개 복사됨`);} catch {setNotice('제목을 선택해 복사해 주세요');}};
 return <div className="hfb-title-box">
  <div className="hfb-title-head"><h4>홈판 후킹형 제목 {titles.length>0?<span>{titles.length}개</span>:null}</h4>{titles.length>0&&<><button type="button" onClick={()=>void copyAll()}>전체 복사</button><small role="status">{notice}</small></>}</div>
  {editorTitle&&<TitleRow label="편집자 제목" text={editorTitle} editor/>}
  {titles.length===0&&<MakeTitles c={c} onMade={setMade}/>}
  {shown.map((text,i)=><TitleRow key={i} label={`${i+1}`} text={text}/>)}
  {titles.length>5&&<button type="button" className="hfb-title-more" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'접기':`나머지 ${titles.length-5}개 더 보기`}</button>}
  {titles.length>0&&<p className="hfb-caption">따옴표로 시작하는 제목은 독자의 반응·상황을 표현한 초안입니다. 실제 발언 인용 여부는 원문에서 확인해 주세요.</p>}
 </div>;
}
function Points({title,items,kind}:{title:string;items:string[];kind:string}) {return <div className={`hfb-points ${kind}`}><h4>{title}</h4><ul>{items.map((text,i)=><li key={i}>{text}</li>)}</ul></div>;}
/*
 * 실측 홈판 증거(2026-10-01) — 어드바이저가 잰 실제 홈판 상위 · 내 블로그 홈판 유입과 맞댄 결과. 확률이 아니라 확인된 사실만 단다.
 */
export default function HomefeedBenchmarkCard({candidate:c,evidence}:{candidate:BenchmarkCandidate;evidence?:HomefeedEvidence|null}) {
 const proof=evidence?.homefeed;
 return <article className={`hfb-card ${c.recommended?'recommended':''}`}>
  <div className="hfb-card-top"><span className={`hfb-status ${c.status}`}>{LABELS[c.status]}</span>{c.recommended&&<span className="hfb-star" aria-label="우선 검토 추천">★ 추천</span>}{proof&&<span className={`hfb-proof ${proof.kind}`}>{proof.kind==='same-post'?'이 글이 실제 홈판':'비슷한 소재가 실제 홈판'} {proof.rank?`${proof.rank}위`:''} · {monthDay(proof.day)}</span>}{evidence?.mine&&<span className="hfb-proof mine">내 블로그 홈판 유입 소재 · {evidence.mine.count.toLocaleString('ko-KR')}회</span>}<span className="hfb-category">{c.category}</span><span className="hfb-timing">{c.freshnessLabel||'작성 시점 확인 필요'}</span></div>
  <div className="hfb-headline"><h3>{c.title||c.keyword}</h3><CopyHeadline text={c.title||c.keyword}/></div>
  <div className="hfb-keyword"><strong>{c.keyword}</strong><span>검색량 <b>{metricText(c.metrics.searchVolume)}</b></span><span>문서량 <b>{metricText(c.metrics.documentCount)}</b></span><span>상위노출 <b>판정 보류</b></span></div>
  {c.relatedKeywords.length>0&&<p className="hfb-alternatives"><span>대안·연관 키워드</span> {c.relatedKeywords.join(' · ')}</p>}
  <p className="hfb-summary">{c.summary||'원문을 확인한 뒤 사건 내용을 정리해 주세요.'}</p>
  {c.summaryAttribution&&<p className="hfb-attribution">{c.summaryAttribution}</p>}
  {(proof||evidence?.mine)&&<div className="hfb-proof-box">{proof&&<p><b>실제 홈판 {proof.rank?`${proof.rank}위`:''} ({monthDay(proof.day)})</b> {proof.url?<a href={proof.url} target="_blank" rel="noopener noreferrer">{proof.title} ↗</a>:proof.title}</p>}{evidence?.mine&&<p><b>내 글 홈판 유입 {evidence.mine.count.toLocaleString('ko-KR')}회 ({monthDay(evidence.mine.day)})</b> {evidence.mine.title}</p>}<small>어드바이저 실측과 맞댄 결과입니다. 같은 소재라도 이번 글의 홈판 노출을 보장하지는 않습니다.</small></div>}
  {c.why.length>0&&<div className="hfb-why"><span>검토 이유</span><ul>{c.why.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>}
  <TitleList titles={c.homeTitles} editorTitle={c.homeTitle} c={c}/>
  {/* 작성 안내는 회차가 구독 AI 로 이 소재를 분석한 카드에만 있다(2026-10-10 하드코딩 폐기 — 없으면 칸을 그리지 않는다) */}
  {c.writingDirection&&<div className="hfb-direction"><h4>이렇게 쓰세요</h4><p>{c.writingDirection}</p>{c.searchTargets.length>0&&<p className="hfb-alternatives"><span>노릴 검색어 · 네이버 자동완성</span> {c.searchTargets.join(' · ')}</p>}</div>}
  {(c.mustInclude.length>0||c.mustAvoid.length>0)&&<div className="hfb-writing-grid">{c.mustInclude.length>0&&<Points title="반드시 들어갈 내용" items={c.mustInclude} kind="include"/>}{c.mustAvoid.length>0&&<Points title="넣지 않을 내용" items={c.mustAvoid} kind="avoid"/>}</div>}
  {c.verificationNeeded.length>0&&<div className="hfb-verify"><b>작성 전 확인</b> {c.verificationNeeded.join(' · ')}</div>}
  <details className="hfb-reference"><summary>이미지·캡처 안내와 출처 <span>{c.sources.length}곳</span></summary>
   <div className="hfb-image-guide"><h4>이미지 레퍼런스</h4><p>{c.imageGuide.instruction||'원출처의 이미지 재사용 조건을 확인하고 직접 촬영·제작한 이미지를 준비해 주세요.'}</p>{c.imageGuide.url&&<a href={c.imageGuide.url} target="_blank" rel="noopener noreferrer">캡처할 원문 열기 ↗</a>}</div>
   <ul className="hfb-source-list">{c.sources.map((s,i)=><li key={`${s.id}-${i}`}><div>{s.url?<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title||s.name} ↗</a>:<b>{s.title||s.name}</b>}<small>{s.name} · 발행 {benchmarkTime(s.publishedAt)}{s.discoveryOnly?' · 소재 발견 출처':''}</small></div><div className="hfb-reactions">{s.metrics.views!==null&&<span>조회 {metricText(s.metrics.views)}</span>}{s.metrics.likes!==null&&<span>공감 {metricText(s.metrics.likes)}</span>}{s.growth?.likes&&s.growth.likes.change>0&&<span className="hfb-growth">공감 +{s.growth.likes.change.toLocaleString('ko-KR')} ({s.growth.likes.elapsedMinutes}분 사이)</span>}{s.metrics.comments!==null&&<span>댓글 {metricText(s.metrics.comments)}</span>}{Object.values(s.metrics).every(n=>n===null)&&<span>반응 미측정</span>}</div></li>)}</ul>
   {c.officialSources.length>0&&<div className="hfb-image-guide"><h4>공식 자료</h4><ul className="hfb-source-list">{c.officialSources.map((s,i)=><li key={`${s.url}-${i}`}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title||s.url} ↗</a></li>)}</ul></div>}
   <p className="hfb-caption">반응 수는 관측 시점의 값입니다. 증가 추세는 여러 시점의 비교가 필요합니다.</p>
  </details>
  <footer className="hfb-card-footer"><span>원글 발행 {benchmarkTime(c.publishedAt)}</span><span>사건 시점 {benchmarkTime(c.eventAt)}</span><span>수집 {benchmarkTime(c.capturedAt)} KST</span><span>홈판 노출 {c.homefeedExposure==='confirmed'?'확인 기록 있음':'미확인'}</span></footer>
 </article>;
}
