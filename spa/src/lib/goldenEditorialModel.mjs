const DAY = 86400000;
const clean = value => typeof value === 'string' ? value.trim() : '';
const compact = value => clean(value).replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
const GENERIC = /어떤\s*정보가|알아보겠습니다|정보를?\s*확인해?\s*보세요|관련\s*정보\s*정리|추천\s*키워드/;
const PERSONAL = /직접\s*(?:써|쓰|사용|신청|받|방문|겪)|써\s*본|사용해\s*본|내돈내산|제가|나는|했어요|했더니|알겠더라고|있더라고|걸었어요|해\s*봤|써\s*봤|써봤|사용했|방문했|받아\s*봤|신청해\s*봤/;
const PROMISE = /무조건|100%|수익\s*보장|상위\s*노출\s*보장|클릭이\s*그대로|빈\s*자리|자리가?\s*비어|정보\s*공백|상위.{0,18}(?:끝나|끝난|다루지|다룬\s*글.*없|소개|나열)/;
const NAVIGATION = /(?:홈페이지|바로가기|로그인|고객센터|전화번호)(?:\s|$)/;
const TITLE_CONNECTORS = /^(?:및|과|와|그리고|대상과|조건과|방법과|일정과|서류와|확인|정리|안내|비교|체크리스트|절차|방법|준비|전|후|신청|대상|제출|서류|주의사항|꼭|알아야|할|확인할|순서|체크|기준)$/;
function fresh(value, now, days) { const raw=clean(value); const time=Date.parse(raw); const day=raw.slice(0,10); const calendar=Date.parse(day+'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw)&&Number.isFinite(calendar)&&new Date(calendar).toISOString().slice(0,10)===day&&Number.isFinite(time)&&time<=now&&now-time<=days*DAY; }
function publicUrl(value) { try { const u=new URL(value); return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!/^(?:localhost|127\.|10\.|192\.168\.|0\.|\[)/i.test(u.hostname) ? u.href : null; } catch { return null; } }
function subjectTokens(row) { return clean(row?.keyword).split(/\s+/).map(compact).filter(s=>s.length>=2&&!/^(?:신청|대상|방법|후기|가격|조건|202\d)$/.test(s)); }
function sourceRelated(row, fact) { const text=compact(fact?.title); return subjectTokens(row).slice(0,2).some(token=>text.includes(token)); }
/** Conservative display gate: lexical support is necessary, never proof of truth or of a competitor body gap. */
export function safeGoldenTitle(row, input) {
 const title=clean(input); const keyword=compact(row?.keyword);
 if(!title||!keyword||!compact(title).includes(keyword)||GENERIC.test(title)||PERSONAL.test(title)||PROMISE.test(title))return null;
 const brief=row?.brief;
 const support=compact([row.keyword,brief?.primaryIntent,brief?.angle,...(Array.isArray(brief?.facts)?brief.facts.filter(f=>sourceRelated(row,f)).map(f=>f.title):[])].join(' '));
 const extra=title.split(/[\s,·:—()“”"!?]+/).filter(Boolean).filter(t=>compact(t).length>1);
 if(extra.some(token=>!TITLE_CONNECTORS.test(token)&&!support.includes(compact(token).replace(/(?:에서|으로|까지|부터|은|는|을|를|의|과|와)$/,''))))return null;
 return title;
}
export function assessGoldenEditorial(row, now=Date.now()) {
 const reasons=[]; const brief=row?.brief;
 const rejection=row?.revalidation;
 const rejectedStamp=clean(rejection?.checkedAt);
 const validRejection=rejection?.status==='rejected'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(rejectedStamp)
  && fresh(rejectedStamp,now,Infinity)
  && fresh(row?.measuredAt,now,Infinity)
  && Date.parse(rejectedStamp)>=Date.parse(row.measuredAt);
 if(validRejection)reasons.push(`최근 재검증 미통과${clean(rejection.reason)?`: ${clean(rejection.reason).slice(0,200)}`:''}`);
 if(row?.editorialReady===false||(Array.isArray(row?.editorialMissing)&&row.editorialMissing.length>0))reasons.push('작성 자료 추가 확인'); const title=safeGoldenTitle(row,row?.titles?.seo?.text);
 if(!fresh(row?.measuredAt,now,7))reasons.push('검색결과 재확인');
 if(!(typeof row?.searchVolume==='number'&&Number.isFinite(row.searchVolume)&&row.searchVolume>=100))reasons.push('검색 수요 확인');
 if(NAVIGATION.test(clean(row?.keyword))||/탐색|이동|navigation/i.test(clean(row?.intentLabel)))reasons.push('정보형 독자 질문 필요');
 if(!brief||!fresh(brief.builtAt,now,7)||!['NOW','NEXT','ALWAYS'].includes(brief.timing))reasons.push('작성 브리프 갱신');
 if(!(typeof row?.documentCount==='number'&&Number.isFinite(row.documentCount)&&row.documentCount>=0))reasons.push('문서량 확인');
 const serp=row?.serp;
 if(!(Number.isInteger(serp?.sampledTitles)&&serp.sampledTitles>=3&&Number.isInteger(serp?.exactTitleHits)&&serp.exactTitleHits>=0&&serp.exactTitleHits<=serp.sampledTitles&&serp.exactTitleHits<=2))reasons.push('상위 제목 경쟁 확인');
 const fields=['primaryIntent','value','differentiation','angle'];
 if(fields.some(key=>clean(brief?.[key]).length<12||GENERIC.test(clean(brief?.[key])))||new Set(fields.map(key=>clean(brief?.[key]))).size!==4)reasons.push('구체적인 독자 질문·작성 방향 필요');
 if(fields.some(key=>PROMISE.test(clean(brief?.[key]))))reasons.push('추천 근거 재검토');
 const sources=(Array.isArray(brief?.facts)?brief.facts:[]).filter(f=>clean(f?.title)&&publicUrl(f?.link)&&fresh(f?.publishedAt,now,brief?.timing==='NOW'?14:30)&&sourceRelated(row,f)).map(f=>({...f,link:publicUrl(f.link)}));
 if(!sources.length)reasons.push('최근 직접 관련 출처 필요');
 if(!title)reasons.push('제목 재작성 필요');
 return {ready:reasons.length===0,reasons,title,sources};
}
export function selectGoldenWriting(rows, now=Date.now(), limit=10) {
 const seen=new Set();
 return (Array.isArray(rows)?rows:[]).map(row=>({row,...assessGoldenEditorial(row,now)})).filter(item=>{
  const key=compact(item.row.keyword); if(!item.ready||seen.has(key))return false; seen.add(key); return true;
 }).sort((a,b)=>Date.parse(b.row.brief.builtAt)-Date.parse(a.row.brief.builtAt)||Date.parse(b.row.measuredAt)-Date.parse(a.row.measuredAt)).slice(0,Math.min(10,Math.max(0,limit)));
}
export function canReadGoldenWriting(row, unlocked, freeNames) { return unlocked===true||(Array.isArray(freeNames)&&freeNames.includes(row?.keyword)); }

/** Preference changes selection only; it never grants access or manufactures missing candidates. */
export function selectGoldenResearch(rows, preferred='경제·지원금', limit=30) {
 const seen=new Set();
 const unique=(Array.isArray(rows)?rows:[]).filter(row=>{const k=compact(row?.keyword);if(!k||seen.has(k))return false;seen.add(k);return true;});
 const cap=Math.min(30,Math.max(0,limit));
 const economic=row=>/경제|비즈니스|지원금|복지|금융|사업|재테크|부동산/.test(row.topic||'')||/지원금|장려금|보조금|정책자금|사업자|소상공인|환급|공제|실업급여/.test(row.keyword||'');
 const matches=row=>preferred==='경제·지원금'?economic(row):row.topic===preferred;
 const primary=unique.filter(matches), other=unique.filter(row=>!matches(row));
 const preferredCount=Math.min(primary.length,Math.ceil(cap*0.7));
 const initial=[...primary.slice(0,preferredCount),...other.slice(0,cap-preferredCount)];
 return [...initial,...primary.slice(preferredCount)].slice(0,cap);
}

