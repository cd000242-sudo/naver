const MAX_AGE = 36 * 60 * 60 * 1000;
const str = (v, max = 2400) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const list = (v) => Array.isArray(v) ? v.slice(0, 30).map(x => str(x)).filter(Boolean) : [];
const date = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function safeBenchmarkUrl(value) {
 try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function metricText(value) { const n = number(value); return n === null ? '미측정' : n.toLocaleString('ko-KR'); }
export function benchmarkTime(value) { const d = date(value); return d ? new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(d)) : '미확인'; }
function source(raw = {}) {
 return { id:str(raw.id,120), name:str(raw.name,160) || str(raw.id,120) || '출처', platform:str(raw.platform,40), url:safeBenchmarkUrl(raw.url), status:['ok','unavailable','failed'].includes(raw.status) ? raw.status : 'unavailable', reason:str(raw.reason), postCount:number(raw.postCount) ?? 0, capturedAt:date(raw.capturedAt), publishedAt:date(raw.publishedAt), title:str(raw.title), summary:str(raw.summary), discoveryOnly:raw.discoveryOnly !== false, metrics:{views:number(raw.metrics?.views), likes:number(raw.metrics?.likes), comments:number(raw.metrics?.comments)} };
}
function candidate(raw, index) {
 // seoTitle(검색형)은 폐기. homeTitle 은 편집자가 손으로 고른 한 줄, homeTitles 는 소재당 홈판 후킹형 20개.
 const fields = ['keyword','title','freshnessLabel','summary','summaryAttribution','homeTitle','writingDirection'];
 const strings = Object.fromEntries(fields.map(key => [key,str(raw[key])]));
 const homeTitles = Array.isArray(raw.homeTitles) ? raw.homeTitles.slice(0,20).map(x => str(x,120)).filter(Boolean) : [];
 const officialSources = Array.isArray(raw.officialSources) ? raw.officialSources.slice(0,6).filter(x=>x && typeof x==='object').map(x=>({title:str(x.title,150),url:safeBenchmarkUrl(x.url)})).filter(x=>x.url) : [];
 return {...strings, homeTitles, id:str(raw.id,120) || `candidate-${index}`, category:str(raw.category,80) || '기타', status:['review-now','verify','stale'].includes(raw.status) ? raw.status : 'verify', recommended:raw.recommended === true, priority:number(raw.priority) ?? 0, publishedAt:date(raw.publishedAt), eventAt:date(raw.eventAt), capturedAt:date(raw.capturedAt), reviewedUntil:date(raw.reviewedUntil), officialSources, why:list(raw.why), mustInclude:list(raw.mustInclude), mustAvoid:list(raw.mustAvoid), relatedKeywords:list(raw.relatedKeywords), verificationNeeded:list(raw.verificationNeeded), flags:list(raw.flags), imageGuide:{url:safeBenchmarkUrl(raw.imageGuide?.url),instruction:str(raw.imageGuide?.instruction)}, metrics:{searchVolume:number(raw.metrics?.searchVolume),documentCount:number(raw.metrics?.documentCount),rankingPossibility:'unmeasured',reactionGrowth:number(raw.metrics?.reactionGrowth)}, homefeedExposure:raw.homefeedExposure === 'confirmed' ? 'confirmed' : 'unverified', sources:Array.isArray(raw.sources) ? raw.sources.slice(0,30).filter(x=>x && typeof x==='object').map(source) : []};
}
export function normalizeBenchmarkBoard(raw) {
 if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.candidates) || !Array.isArray(raw.sources)) throw new Error('벤치마크 데이터 형식을 확인하지 못했습니다.');
 if (!date(raw.generatedAt)) throw new Error('마지막 수집 시각을 확인하지 못했습니다.');
 const sources = raw.sources.slice(0,100).filter(x=>x && typeof x==='object').map(source);
 return {schemaVersion:1,generatedAt:date(raw.generatedAt),attemptedAt:date(raw.attemptedAt),status:['fresh','partial','stale'].includes(raw.status) ? raw.status : 'partial',sources,sourceCount:sources.length,collectedPostCount:sources.filter(s=>s.status==='ok').reduce((sum,s)=>sum+s.postCount,0),candidates:raw.candidates.slice(0,200).filter(x=>x && typeof x==='object').map(candidate)};
}
export function benchmarkView(board, now = Date.now()) {
 const isOld = (value) => !value || now - Date.parse(value) > MAX_AGE || Date.parse(value) > now + 5*60*1000;
 const stale = board.status === 'stale' || isOld(board.generatedAt);
 const candidates = board.candidates.map(c => {
  const old = stale || isOld(c.capturedAt);
  // 사람이 검토한 작성안은 검토 만료 시각이 지나면 별을 내리고 다시 확인 대상으로 돌린다
  const reviewExpired = Boolean(c.reviewedUntil) && !(Date.parse(c.reviewedUntil) > now);
  const status = old ? 'stale' : reviewExpired && c.status === 'review-now' ? 'verify' : c.status;
  const qualified = !old && !reviewExpired && c.status === 'review-now' && c.why.length > 0 && c.sources.some(s=>s.url) && (c.homeTitles.length > 0 || Boolean(c.homeTitle)) && Boolean(c.writingDirection) && c.mustInclude.length > 0;
  return {...c,status,recommended:c.recommended && qualified};
 }).sort((a,b)=>Number(b.recommended)-Number(a.recommended) || b.priority-a.priority);
 return {...board,stale,candidates};
}
export function filterBenchmarks(items, {category='전체',status='all',query=''} = {}) {
 const q = query.trim().toLocaleLowerCase();
 return items.filter(c=>(category==='전체'||c.category===category) && (status==='all'||(status==='recommended' ? c.recommended : c.status===status)) && (!q || `${c.keyword} ${c.title} ${c.summary} ${c.relatedKeywords.join(' ')}`.toLocaleLowerCase().includes(q)));
}
