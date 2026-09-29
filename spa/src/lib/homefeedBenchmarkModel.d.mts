export interface BenchmarkSource { id:string; name:string; platform:string; url:string|null; status:'ok'|'unavailable'|'failed'; reason:string; postCount:number; capturedAt:string|null; publishedAt:string|null; title:string; summary:string; discoveryOnly:boolean; metrics:{views:number|null;likes:number|null;comments:number|null} }
export interface BenchmarkCandidate { id:string; keyword:string; title:string; category:string; status:'review-now'|'verify'|'stale'; recommended:boolean; priority:number; publishedAt:string|null; eventAt:string|null; capturedAt:string|null; reviewedUntil:string|null; officialSources:{title:string;url:string}[]; freshnessLabel:string; why:string[]; summary:string; summaryAttribution:string; homeTitle:string; homeTitles:string[]; writingDirection:string; mustInclude:string[]; mustAvoid:string[]; relatedKeywords:string[]; verificationNeeded:string[]; flags:string[]; imageGuide:{url:string|null;instruction:string}; metrics:{searchVolume:number|null;documentCount:number|null;rankingPossibility:string;reactionGrowth:number|null}; homefeedExposure:string; sources:BenchmarkSource[] }
export interface BenchmarkBoard { schemaVersion:number; generatedAt:string; attemptedAt:string|null; status:'fresh'|'partial'|'stale'; sources:BenchmarkSource[]; sourceCount:number; collectedPostCount:number; candidates:BenchmarkCandidate[] }
export interface BenchmarkView extends BenchmarkBoard { stale:boolean }
export function safeBenchmarkUrl(value:unknown):string|null;
export function metricText(value:unknown):string;
export function benchmarkTime(value:unknown):string;
export function normalizeBenchmarkBoard(value:unknown):BenchmarkBoard;
export function benchmarkView(board:BenchmarkBoard,now?:number):BenchmarkView;
export function filterBenchmarks(items:BenchmarkCandidate[],filters?:{category?:string;status?:string;query?:string}):BenchmarkCandidate[];
