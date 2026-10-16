import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const normalize = value => value.replace(/\s+/g, '').toLowerCase();
const safeText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 800 && !/[<>\u0000-\u001f]/.test(value);
function safeUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }
function validateTopic(row) {
 if (!row || !Number.isInteger(row.month) || row.month < 1 || row.month > 12) throw Error('유효하지 않은 기획월');
 for (const field of ['keyword','category','type','angle','prep','sourceTitle','sourceStatus']) if (!safeText(row[field])) throw Error(`유효하지 않은 ${field}`);
 if (!safeUrl(row.sourceUrl)) throw Error('유효하지 않은 출처 URL');
 if (typeof row.money !== 'boolean') throw Error('유효하지 않은 분야 분류');
}
function cleanSuggestions(values, year) {
 const seen = new Set();
 return (Array.isArray(values) ? values : []).filter(value => {
  if (!safeText(value) || value.length > 100) return false;
  if ([...value.matchAll(/\b(20\d{2})(?:년|학년도)?/g)].some(match => +match[1] < year)) return false;
  const key=normalize(value); if (seen.has(key)) return false; seen.add(key); return true;
 });
}
export function buildSeasonalBoard(research) {
 if (!research || !Number.isFinite(Date.parse(research.reviewedAt))) throw Error('유효하지 않은 검토일');
 if (!Array.isArray(research.topics) || !research.topics.length) throw Error('발행할 주제가 없습니다');
 if (!Number.isInteger(research.originalTopics) || research.originalTopics < 0 || research.originalTopics > research.topics.length) throw Error('기존 주제 수가 올바르지 않습니다');
 const collections = new Map((research.collections || []).map(row => [normalize(row.seed), row]));
 const seen = new Set(); let excludedSuggestions = 0;
 const year = Number(research.reviewedAt.slice(0,4));
 const topics = research.topics.map(row => {
  validateTopic(row); const key=`${row.month}:${normalize(row.keyword)}`;
  if (seen.has(key)) throw Error(`중복 주제: ${row.keyword}`); seen.add(key);
  const collection=collections.get(normalize(row.keyword));
  const suggestions=cleanSuggestions(collection?.suggestions,year);
  excludedSuggestions+=(collection?.suggestions?.length || 0)-suggestions.length;
  return {id:createHash('sha256').update(key).digest('hex').slice(0,16),month:row.month,category:row.category,type:row.type,keyword:row.keyword,angle:row.angle,prep:row.prep,money:row.money,sourceTitle:row.sourceTitle,sourceUrl:row.sourceUrl,sourceStatus:row.sourceStatus,suggestions,observedAt:collection && !collection.error && Number.isFinite(Date.parse(collection.observedAt)) ? collection.observedAt : null};
 });
 return {version:1,updatedAt:research.reviewedAt,audit:{originalTopics:research.originalTopics,addedTopics:topics.length-research.originalTopics,excludedSuggestions,notes:(research.notes || []).filter(safeText)},stats:{topics:topics.length,autocompleteUnique:new Set(topics.flatMap(row=>row.suggestions).map(normalize)).size,moneyTopics:topics.filter(row=>row.money).length},topics};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 const source = new URL('../data/seasonal-keyword-research.json',import.meta.url);
 const target = new URL('../public/data/seasonal-keywords.json',import.meta.url);
 const board=buildSeasonalBoard(JSON.parse(await readFile(source,'utf8')));
 await writeFile(target,JSON.stringify(board,null,2)+'\n','utf8');
 console.log(JSON.stringify({stats:board.stats,audit:board.audit}));
}
