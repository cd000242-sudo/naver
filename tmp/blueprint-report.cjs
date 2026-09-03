// 기준선/재측정 배치들을 마크다운 표로. node tmp/blueprint-report.cjs baseline after after2
const fs = require('fs');
const tags = process.argv.slice(2);
const load = (t) => JSON.parse(fs.readFileSync(`.autopus/specs/SPEC-BLUEPRINT-2026/${t}.json`, 'utf8')).rows;
const agg = (rows) => {
  const n = rows.length; const s = (k) => rows.reduce((x, r) => x + (r[k] || 0), 0);
  return {
    '편수': n,
    '편당 비용': `$${(s('cost') / n).toFixed(3)} (총 $${s('cost').toFixed(2)})`,
    '캐시 적중': `${Math.round(s('cached') / s('tin') * 100)}%`,
    '호출 수': s('calls'),
    '게이트 pass': `${rows.filter((r) => r.decision === 'pass').length}/${n}`,
    '모드 / 종합 평균(게이트 실행 편)': (() => { const g = rows.filter((r) => r.gateFinal != null); const m = g.length || 1; return `${Math.round(g.reduce((x, r) => x + r.gateMode, 0) / m)} / ${Math.round(g.reduce((x, r) => x + r.gateFinal, 0) / m)} (${g.length}편)`; })(),
    '재생성': `${s('regen')}/${n}`,
    '통과 불가 재시도(토큰 밀도)': `${s('faithRetry')}/${n}`,
    '설계도 성공': `${rows.filter((r) => r.bp && !r.bp.skipped).length}/${n}`,
    '인용 ≥1': `${rows.filter((r) => r.quotes >= 1).length}/${n}`,
    '도입부 상황 단서': `${rows.filter((r) => r.introCue === 1).length}/${n}`,
    '문단당 문장': (s('sentPerPara') / n).toFixed(1),
    '본문 글자(공백 제외)': Math.round(s('body') / n),
    '소요(초)': Math.round(s('elapsed') / n),
  };
};
const sets = tags.map((t) => ({ t, all: agg(load(t)), h: agg(load(t).filter((r) => r.mode === 'homefeed')), s: agg(load(t).filter((r) => r.mode === 'seo')) }));
for (const scope of ['all', 'h', 's']) {
  console.log(`\n**${scope === 'all' ? '전체' : scope === 'h' ? '홈판' : 'SEO'}**\n`);
  console.log(`| 지표 | ${tags.join(' | ')} |`);
  console.log(`|---|${tags.map(() => '---').join('|')}|`);
  for (const k of Object.keys(sets[0][scope])) console.log(`| ${k} | ${sets.map((x) => x[scope][k]).join(' | ')} |`);
}
const A = load(tags[0]), Z = load(tags[tags.length - 1]);
console.log('\n편별 종합점수(' + tags[0] + '→' + tags[tags.length - 1] + '): ' + A.map((r) => `${r.mode[0]}${r.i}:${r.gateFinal}→${(Z.find((x) => x.mode === r.mode && x.i === r.i) || {}).gateFinal}`).join(' '));
