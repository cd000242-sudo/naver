const key = value => String(value || '').replace(/\s+/g, '').toLowerCase();
/** Recheck source dates even when offline; never replace them with a fetch date. */
export function expireIssueBoard(board, now = Date.now()) {
  const fresh = row => {
    const at = Date.parse(row.measuredAt || '');
    return Number.isFinite(at) && at - now <= 300000 && now - at <= 48 * 3600000;
  };
  const rows = (board.rows || []).filter(fresh);
  const names = new Set(rows.map(row => key(row.keyword)));
  return {...board, rows, observations:(board.observations || []).filter(fresh),
    freeSample:board.freeSample ? {...board.freeSample,keywords:(board.freeSample.keywords || []).filter(word => names.has(key(word)))} : undefined,
    issues:(board.publishedAt && !fresh({measuredAt:board.publishedAt}) ? [] : board.issues || []).map(issue => ({...issue,
      rowCount:rows.filter(row => key(row.issue) === key(issue.issue)).length,
      nextWave:(issue.nextWave || []).map(item => ({...item,onBoard:names.has(key(item.keyword))})),
    })),
  };
}
