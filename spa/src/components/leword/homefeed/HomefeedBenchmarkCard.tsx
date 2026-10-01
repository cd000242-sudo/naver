import { useState } from 'react';
import { benchmarkTime, metricText, type BenchmarkCandidate } from '../../../lib/homefeedBenchmarkModel.mjs';
import type { HomefeedEvidence } from '../../../lib/homefeedEvidence.mjs';
const monthDay=(day:string)=>{const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(day||'');return m?`${Number(m[1])}/${Number(m[2])}`:day;};
const LABELS = {'review-now':'지금 검토',verify:'추가 확인',stale:'시점 재검토'};
function TitleRow({label,text,editor=false}:{label:string;text:string;editor?:boolean}) {
 const [notice,setNotice]=useState('');
 const copy=async()=>{try {await navigator.clipboard.writeText(text);setNotice('복사됨');} catch {setNotice('제목을 선택해 복사해 주세요');}};
 return <div className={`hfb-title-row${editor?' editor':''}`}><span>{label}</span><p>{text}</p><button type="button" onClick={()=>void copy()} aria-label={`${label} 제목 복사`}>복사</button><small role="status">{notice}</small></div>;
}
// 소재 1개당 홈판 후킹형 제목 20개. 검색형은 없다 — 홈판은 제목이 멈추게 해야 한다.
function TitleList({titles,editorTitle}:{titles:string[];editorTitle:string}) {
 const [open,setOpen]=useState(false);
 const [notice,setNotice]=useState('');
 const shown=open?titles:titles.slice(0,5);
 const copyAll=async()=>{try {await navigator.clipboard.writeText(titles.join('\n'));setNotice(`${titles.length}개 복사됨`);} catch {setNotice('제목을 선택해 복사해 주세요');}};
 return <div className="hfb-title-box">
  <div className="hfb-title-head"><h4>홈판 후킹형 제목 {titles.length>0?<span>{titles.length}개</span>:null}</h4>{titles.length>0&&<><button type="button" onClick={()=>void copyAll()}>전체 복사</button><small role="status">{notice}</small></>}</div>
  {editorTitle&&<TitleRow label="편집자 제목" text={editorTitle} editor/>}
  {titles.length===0&&!editorTitle&&<p className="hfb-title-empty">제목 준비 중 — 다음 회차에 붙습니다.</p>}
  {shown.map((text,i)=><TitleRow key={i} label={`${i+1}`} text={text}/>)}
  {titles.length>5&&<button type="button" className="hfb-title-more" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'접기':`나머지 ${titles.length-5}개 더 보기`}</button>}
  {titles.length>0&&<p className="hfb-caption">따옴표로 시작하는 제목은 독자의 반응·상황을 표현한 초안입니다. 실제 발언 인용 여부는 원문에서 확인해 주세요.</p>}
 </div>;
}
function Points({title,items,kind}:{title:string;items:string[];kind:string}) {return <div className={`hfb-points ${kind}`}><h4>{title}</h4>{items.length?<ul>{items.map((text,i)=><li key={i}>{text}</li>)}</ul>:<p>원출처 확인 후 보완해 주세요.</p>}</div>;}
/*
 * 실측 홈판 증거(2026-10-01) — 어드바이저가 잰 실제 홈판 상위 · 내 블로그 홈판 유입과 맞댄 결과. 확률이 아니라 확인된 사실만 단다.
 */
export default function HomefeedBenchmarkCard({candidate:c,evidence}:{candidate:BenchmarkCandidate;evidence?:HomefeedEvidence|null}) {
 const proof=evidence?.homefeed;
 return <article className={`hfb-card ${c.recommended?'recommended':''}`}>
  <div className="hfb-card-top"><span className={`hfb-status ${c.status}`}>{LABELS[c.status]}</span>{c.recommended&&<span className="hfb-star" aria-label="우선 검토 추천">★ 추천</span>}{proof&&<span className={`hfb-proof ${proof.kind}`}>{proof.kind==='same-post'?'이 글이 실제 홈판':'비슷한 소재가 실제 홈판'} {proof.rank?`${proof.rank}위`:''} · {monthDay(proof.day)}</span>}{evidence?.mine&&<span className="hfb-proof mine">내 블로그 홈판 유입 소재 · {evidence.mine.count.toLocaleString('ko-KR')}회</span>}<span className="hfb-category">{c.category}</span><span className="hfb-timing">{c.freshnessLabel||'작성 시점 확인 필요'}</span></div>
  <h3>{c.title||c.keyword}</h3>
  <div className="hfb-keyword"><strong>{c.keyword}</strong><span>검색량 <b>{metricText(c.metrics.searchVolume)}</b></span><span>문서량 <b>{metricText(c.metrics.documentCount)}</b></span><span>상위노출 <b>판정 보류</b></span></div>
  {c.relatedKeywords.length>0&&<p className="hfb-alternatives"><span>대안·연관 키워드</span> {c.relatedKeywords.join(' · ')}</p>}
  <p className="hfb-summary">{c.summary||'원문을 확인한 뒤 사건 내용을 정리해 주세요.'}</p>
  {c.summaryAttribution&&<p className="hfb-attribution">{c.summaryAttribution}</p>}
  {(proof||evidence?.mine)&&<div className="hfb-proof-box">{proof&&<p><b>실제 홈판 {proof.rank?`${proof.rank}위`:''} ({monthDay(proof.day)})</b> {proof.url?<a href={proof.url} target="_blank" rel="noopener noreferrer">{proof.title} ↗</a>:proof.title}</p>}{evidence?.mine&&<p><b>내 글 홈판 유입 {evidence.mine.count.toLocaleString('ko-KR')}회 ({monthDay(evidence.mine.day)})</b> {evidence.mine.title}</p>}<small>어드바이저 실측과 맞댄 결과입니다. 같은 소재라도 이번 글의 홈판 노출을 보장하지는 않습니다.</small></div>}
  {c.why.length>0&&<div className="hfb-why"><span>검토 이유</span><ul>{c.why.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>}
  <TitleList titles={c.homeTitles} editorTitle={c.homeTitle}/>
  <div className="hfb-direction"><h4>이렇게 쓰세요</h4><p>{c.writingDirection||'작성 방향은 원출처 확인 후 정해 주세요.'}</p></div>
  <div className="hfb-writing-grid"><Points title="반드시 들어갈 내용" items={c.mustInclude} kind="include"/><Points title="넣지 않을 내용" items={c.mustAvoid} kind="avoid"/></div>
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
