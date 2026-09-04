// LLM 직접 작성 기준선 — 사람이 챗에 치는 그대로 한 번 호출한다(파이프라인 없음).
// npx tsx tmp/llm-baseline.cjs
const fs = require('fs');
const path = require('path');

const MODEL = 'gpt-5.6-terra';
const OUT = path.join('tmp', 'llm-baseline');
const KEYWORDS = [
  { mode: 'homefeed', kw: '전세 계약 전 확인할 것' },
  { mode: 'homefeed', kw: '에어컨 전기요금 절약' },
  { mode: 'homefeed', kw: '청년월세지원 신청 자격' },
  { mode: 'homefeed', kw: '겨울 난방비 절약 방법' },
  { mode: 'seo', kw: '전세보증보험 가입조건' },
  { mode: 'seo', kw: '청년도약계좌 가입조건' },
];

// 사람이 실제로 치는 문장. 품질 지시·자료 주입 없음 — 그게 비교 대상이다.
const prompt = (kw) => `네이버 블로그에 올릴 글 하나 써줘. 키워드는 "${kw}" 야.\n제목이랑 소제목도 같이 만들어줘. 소제목은 ## 로 표시해줘.`;

function parseMarkdown(text) {
  const lines = String(text || '').split('\n');
  let title = '';
  const out = [];
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !title) { title = h1[1].replace(/[*_`]/g, '').trim(); continue; }
    out.push(line);
  }
  const rest = out.join('\n');
  const parts = rest.split(/^##\s+/m);
  const intro = parts[0].replace(/^\s*[*_`#]*\s*/, '').trim();
  const headings = parts.slice(1).map((chunk) => {
    const nl = chunk.indexOf('\n');
    return {
      title: (nl < 0 ? chunk : chunk.slice(0, nl)).replace(/[*_`#]/g, '').trim(),
      content: (nl < 0 ? '' : chunk.slice(nl + 1)).trim(),
    };
  }).filter((h) => h.title);
  if (!title) {
    const first = intro.split('\n')[0] || '';
    title = first.replace(/^[*_`#\s]+/, '').slice(0, 60).trim();
  }
  return { selectedTitle: title, introduction: intro, headings, conclusion: '' };
}

(async () => {
  const dir = path.join(process.env.APPDATA, 'better-life-naver');
  const user = fs.readFileSync(path.join(dir, '.last_active_user'), 'utf8').trim();
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `settings_${user}.json`), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  let cost = 0;
  for (const { mode, kw } of KEYWORDS) {
    const t0 = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiApiKey}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt(kw) }], max_completion_tokens: 6000 }),
    });
    const j = await res.json();
    if (!j.choices) { console.log('FAIL', kw, JSON.stringify(j).slice(0, 200)); continue; }
    const text = j.choices[0].message.content || '';
    const parsed = parseMarkdown(text);
    const c = ((j.usage.prompt_tokens) * 2.5 + j.usage.completion_tokens * 15) / 1e6;
    cost += c;
    fs.writeFileSync(path.join(OUT, `${mode}__${kw}.json`), JSON.stringify({ mode, kw, model: MODEL, raw: text, ...parsed, usage: j.usage, cost: +c.toFixed(3) }, null, 2));
    console.log(`${mode} ${kw}: 소제목 ${parsed.headings.length}개 · ${text.replace(/\s/g, '').length}자 · $${c.toFixed(3)} · ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  console.log(`\n총 $${cost.toFixed(2)}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
