import { useState } from 'react';
import { benchmarkTime, metricText, type BenchmarkSource } from '../../../lib/homefeedBenchmarkModel.mjs';
/*
 * 벤치마킹할 원문 타일(2026-10-22 사장님 "출처가 아래에 접혀 있어 벤치마킹 블로그를 접속하는 법을 모른다 ·
 * 초보자와 시니어도 이미지와 같이 볼 수 있게"). 요약 바로 아래 · 원문마다 썸네일 + 큰 [원문 열기] 버튼.
 * 썸네일은 리퍼러 없이 불러온다 — 네이버 이미지 서버는 다른 사이트 리퍼러면 403(2026-10-22 실측).
 */
const PLATFORM:Record<string,string>={'naver-blog':'네이버 블로그',youtube:'유튜브',instagram:'인스타그램','news-ranking':'뉴스',community:'커뮤니티'};
const FIRST_SHOWN=3;
function Thumb({s,label}:{s:BenchmarkSource;label:string}) {
 const [broken,setBroken]=useState(false);
 if (s.image&&!broken) return <img src={s.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>;
 return <span className="hfb-src-fallback" aria-hidden="true"><b>{Array.from(s.name||label)[0]||'·'}</b><small>{label}</small></span>;
}
function Reactions({s}:{s:BenchmarkSource}) {
 const m=s.metrics;
 const chips=[m.views!==null&&`조회 ${metricText(m.views)}`,m.likes!==null&&`공감 ${metricText(m.likes)}`,m.comments!==null&&`댓글 ${metricText(m.comments)}`].filter(Boolean) as string[];
 const grew=s.growth?.likes&&s.growth.likes.change>0?s.growth.likes:null;
 if (!chips.length&&!grew) return null;
 return <span className="hfb-src-chips">{chips.map((t)=><span key={t}>{t}</span>)}{grew&&<span className="up">공감 +{grew.change.toLocaleString('ko-KR')} · {grew.elapsedMinutes}분 사이</span>}</span>;
}
function Tile({s}:{s:BenchmarkSource}) {
 const label=PLATFORM[s.platform]||'원문';
 const body=<>
  <span className="hfb-src-thumb"><Thumb s={s} label={label}/><span className="hfb-src-platform">{label}</span></span>
  <span className="hfb-src-body">
   <span className="hfb-src-meta">{s.name} · {benchmarkTime(s.publishedAt)}</span>
   <span className="hfb-src-title">{s.title||s.name}</span>
   <Reactions s={s}/>
   {s.url?<span className="hfb-src-open">원문 열기 <span aria-hidden="true">↗</span></span>:<span className="hfb-src-open off">원문 주소 없음</span>}
  </span>
 </>;
 return <li>{s.url?<a className="hfb-src-tile" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`${label} 원문 새 창으로 열기: ${s.title||s.name}`}>{body}</a>:<div className="hfb-src-tile">{body}</div>}</li>;
}
export default function BenchmarkSources({sources}:{sources:BenchmarkSource[]}) {
 const [open,setOpen]=useState(false);
 if (!sources.length) return null;
 const shown=open?sources:sources.slice(0,FIRST_SHOWN);
 return <section className="hfb-src" aria-label="벤치마킹할 원문">
  <div className="hfb-src-head"><h4>벤치마킹할 원문 <span>{sources.length}곳</span></h4><p>사진이나 [원문 열기]를 누르면 원문이 새 창으로 열립니다. 제목 · 사진 배치 · 글 순서를 보고 내 말로 다시 쓰세요.</p></div>
  <ul className="hfb-src-grid">{shown.map((s,i)=><Tile key={`${s.id}-${i}`} s={s}/>)}</ul>
  {sources.length>FIRST_SHOWN&&<button type="button" className="hfb-src-more" onClick={()=>setOpen((v)=>!v)} aria-expanded={open}>{open?'접기':`나머지 ${sources.length-FIRST_SHOWN}곳 더 보기`}</button>}
  <p className="hfb-caption">반응 수는 관측 시점의 값입니다. 증가 추세는 여러 시점의 비교가 필요합니다.</p>
 </section>;
}
