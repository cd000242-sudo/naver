// src/renderer/modules/exposedStructureRef.ts
// 노출된 글 구조 참고 — 입력칸 배선.
//
// 사용자가 잘 노출된 글 주소를 넣고 "구조 분석"을 누르면, 그 글의 **수치**만 받아
// 이번 생성에 붙인다. 원문 문장·소재는 오지 않는다(메인 프로세스가 보장).
// 값이 없으면 아무 일도 하지 않는다 — 기존 동작 그대로다.

let cachedBlock = '';
let cachedForUrl = '';

/** 이번 생성에 붙일 구조 블록. 없으면 빈 문자열. */
export function getExposedStructureBlock(): string {
  return cachedBlock;
}

export function clearExposedStructureBlock(): void {
  cachedBlock = '';
  cachedForUrl = '';
}

function setResult(text: string, ok: boolean): void {
  const box = document.getElementById('exposed-structure-result') as HTMLElement | null;
  if (!box) return;
  box.style.display = 'block';
  box.textContent = text;
  box.style.color = ok ? 'var(--text-strong)' : '#f87171';
}

/** 입력칸의 URL 을 분석해 구조 블록을 캐시한다. 실패해도 예외를 던지지 않는다. */
export async function analyzeExposedStructure(): Promise<void> {
  const input = document.getElementById('exposed-structure-url') as HTMLInputElement | null;
  const button = document.getElementById('exposed-structure-analyze-btn') as HTMLButtonElement | null;
  const url = (input?.value || '').trim();

  if (!url) {
    clearExposedStructureBlock();
    setResult('주소를 입력하면 그 글의 구조만 가져옵니다.', false);
    return;
  }
  if (url === cachedForUrl && cachedBlock) {
    setResult('이미 분석한 주소입니다. 이번 생성에 반영됩니다.', true);
    return;
  }

  const original = button?.textContent || '구조 분석';
  if (button) { button.disabled = true; button.textContent = '분석 중...'; }
  try {
    const api = (window as any).api;
    const result = await api?.analyzeExposedStructure?.(url);
    if (!result?.success) {
      clearExposedStructureBlock();
      setResult(result?.message || '구조를 읽지 못했습니다.', false);
      return;
    }
    cachedBlock = String(result.block || '');
    cachedForUrl = url;
    const p = result.profile || {};
    setResult(
      `✅ 구조만 가져왔습니다 (문장·소재는 가져오지 않습니다)\n`
      + `본문 ${Number(p.bodyLength || 0).toLocaleString()}자 · 문단 ${p.paragraphCount ?? '-'}개`
      + ` · 소제목 ${p.headingCount ?? '-'}개 · 이미지 ${p.imageCount ?? 0}장\n`
      + `문단 종결 — 완결 ${p.endings?.closed ?? '-'}% / 명사형 ${p.endings?.noun ?? '-'}%`,
      true,
    );
  } catch (error) {
    clearExposedStructureBlock();
    setResult(`분석 실패: ${(error as Error).message}`, false);
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

/** 버튼·입력칸 이벤트를 건다. 요소가 없으면 조용히 넘어간다. */
export function initExposedStructureRef(): void {
  const button = document.getElementById('exposed-structure-analyze-btn');
  const input = document.getElementById('exposed-structure-url') as HTMLInputElement | null;
  if (!button || !input) return;

  button.addEventListener('click', () => { void analyzeExposedStructure(); });
  // 주소를 고치면 이전 분석 결과를 버린다 — 엉뚱한 글의 구조가 따라붙지 않게.
  input.addEventListener('input', () => {
    if (input.value.trim() !== cachedForUrl) clearExposedStructureBlock();
  });
}
