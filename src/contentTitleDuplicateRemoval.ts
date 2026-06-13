/**
 * 제목에서 연속/비연속으로 중복되는 구절을 제거한다.
 *
 * 예: "박나래, 광고 줄줄이 손절 박나래 광고 손절, 복귀 1주일"
 *  → "박나래, 광고 줄줄이 손절, 복귀 1주일"
 */
export function removeDuplicatePhrases(title: string): string {
  let t = String(title || '').trim();
  if (!t || t.length < 10) return t;

  const words = t.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) || [];
  const wordCountMap = new Map<string, number>();

  for (const word of words) {
    const normalized = word.toLowerCase();
    wordCountMap.set(normalized, (wordCountMap.get(normalized) || 0) + 1);
  }

  for (const [word, count] of wordCountMap.entries()) {
    if (count >= 2 && word.length >= 2) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const contextPattern = new RegExp(`${escaped}([가-힣]{0,2})`, 'gi');
      const contexts: string[] = [];
      let cm;
      while ((cm = contextPattern.exec(t)) !== null) {
        contexts.push(cm[1] || '');
      }

      const uniqueContexts = new Set(contexts);
      if (uniqueContexts.size >= contexts.length && contexts.length > 1) {
        console.log(`[DuplicateRemoval] 동음이의어 보호: "${word}" (문맥: ${contexts.join(', ')})`);
        continue;
      }

      const pattern = new RegExp(`(${escaped}[^가-힣a-zA-Z]*)(.*?)\\s*${escaped}`, 'gi');
      let prev;
      do {
        prev = t;
        t = t.replace(pattern, (_match, first, middle) => {
          const trimmedMiddle = (middle || '').trim();
          if (trimmedMiddle && !trimmedMiddle.match(/^[,\s:·•|]+$/)) {
            return first + trimmedMiddle;
          }
          return first.trim();
        });
      } while (t !== prev);

      if (t !== String(title || '').trim()) {
        console.log(`[DuplicateRemoval] 단어 "${word}" 중복 제거됨: "${title}" → "${t}"`);
      }
    }
  }

  for (let len = 20; len >= 6; len--) {
    const regex = new RegExp(`(.{${len},${len}})(.{1,30}?)\\1`, 'g');
    const before = t;
    t = t.replace(regex, (_match, phrase, middle) => {
      if (middle && middle.trim()) {
        console.log(`[DuplicateRemoval] 비연속 중복 제거: "${phrase.trim()}" (중간: "${middle.trim().substring(0, 15)}...")`);
        return phrase + middle;
      }
      return phrase;
    });
    if (t !== before) {
      console.log(`[DuplicateRemoval] 비연속 중복 제거됨 (${len}자): "${before}" → "${t}"`);
    }
  }

  const colonIdx = t.indexOf(':');
  if (colonIdx > 3 && colonIdx < t.length - 3) {
    const beforeColon = t.slice(0, colonIdx).trim();
    const afterColon = t.slice(colonIdx + 1).trim();
    const normBefore = beforeColon.replace(/[\s\-–—:|·•.,!?()[\]{}"']/g, '').toLowerCase();
    if (normBefore.length >= 5) {
      const escapedBefore = beforeColon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dupePattern = new RegExp(`\\s*${escapedBefore}\\s*[,:]?\\s*`, 'gi');
      const cleanedAfter = afterColon.replace(dupePattern, ' ').replace(/\s+/g, ' ').trim();

      if (cleanedAfter !== afterColon && cleanedAfter.length > 0) {
        const remaining = cleanedAfter.replace(/^[,\s:]+|[,\s:]+$/g, '').trim();
        if (remaining.length >= 3) {
          t = `${beforeColon} ${remaining}`;
          console.log(`[DuplicateRemoval] 콜론 전후 중복 제거: "${title}" → "${t}"`);
        } else {
          t = beforeColon;
          console.log(`[DuplicateRemoval] 콜론 뒤 제거 (중복): "${title}" → "${t}"`);
        }
      }
    }
  }

  for (let len = 25; len >= 4; len--) {
    const regex = new RegExp(`(.{${len},${len}})(?:[\\s,·•|]*\\1)+`, 'g');
    const before = t;
    t = t.replace(regex, '$1');
    if (t !== before) {
      console.log(`[DuplicateRemoval] 중복 제거됨 (${len}자): "${before}" → "${t}"`);
    }
  }

  t = t.replace(/\s[가-힣]\s+[가-힣]\s+[가-힣]\s+[가-힣]\s/g, ' ');
  t = t.replace(/[,\s]{2,}/g, ', ').replace(/,\s*,/g, ',').trim();
  t = t.replace(/^[,\s]+|[,\s]+$/g, '');

  return t;
}
