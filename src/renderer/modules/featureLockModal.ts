/**
 * featureLockModal.ts — Pro 기능 잠금 모달
 *
 * 무료 체험판 사용자가 Pro 전용 기능 (연속 발행 / 다중계정 풀오토 / 다중계정 관리)
 * 진입점을 클릭하면 표시되는 안내 모달.
 *
 * 정책 (사용자 명시):
 * - 대놓고 결제 강요 X, 결제 욕구 자극 O
 * - 소프트 톤: "현재 무료 체험이라 이 기능은 잠겨있어요. Pro 구독하시면 이용 가능"
 * - CTA 듀얼: 메인(결제 페이지 새 창) + 보조(카카오톡 문의)
 *
 * 사용:
 *   const ok = await checkFeatureLockAndShow('continuous');
 *   if (!ok) return; // 모달 표시됨, 기능 실행 차단
 */

type LockFeatureKey = 'continuous' | 'multi-account-fullauto' | 'multi-account-manage';

interface LockCopy {
  title: string;
  valuePoints: string[];
  proof: string;
}

const COPY_TABLE: Record<LockFeatureKey, LockCopy> = {
  'continuous': {
    title: '연속 발행',
    valuePoints: [
      '키워드만 입력하면 AI가 글·이미지·발행까지 자동',
      '잠자는 동안에도 블로그가 알아서 돌아가요',
      '평균 사용자 하루 8~12편 자동 발행',
    ],
    proof: '이미 2,847명이 연속 발행으로 운영 중',
  },
  'multi-account-fullauto': {
    title: '다중계정 풀오토 발행',
    valuePoints: [
      '여러 계정을 한 번에 자동 발행 (최대 동시 3계정)',
      '계정 1개 = 수익 1배 / 계정 8개 = 수익 8배',
      'IP·세션·간격 모두 자동 — 검열 회피 알고리즘 내장',
    ],
    proof: '누적 158,430편 발행 · 만족도 4.9★',
  },
  'multi-account-manage': {
    title: '다중계정 관리',
    valuePoints: [
      '여러 네이버 블로그를 한 화면에서 관리',
      '계정별 카테고리·CTA·발행 설정을 따로 저장',
      '키우는 시간이 4배 빨라져요',
    ],
    proof: '2,847명이 다중계정으로 운영 중',
  },
};

const PRICING_URL = 'https://www.leaderspro.kr/pricing.html';
const KAKAO_URL = 'https://open.kakao.com/o/sPcaslwh';

/**
 * 모달 DOM 생성 (1회만, 이후 재사용)
 */
function ensureLockModalDom(): HTMLElement {
  let modal = document.getElementById('feature-lock-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'feature-lock-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.style.cssText = [
    'display: none',
    'position: fixed',
    'inset: 0',
    'z-index: 10020',
    'background: rgba(0,0,0,0.65)',
    'backdrop-filter: blur(6px)',
    '-webkit-backdrop-filter: blur(6px)',
    'align-items: center',
    'justify-content: center',
    'padding: 20px',
  ].join(';');

  modal.innerHTML = `
    <div id="feature-lock-card"
      style="position: relative; max-width: 500px; width: 100%; background: linear-gradient(155deg, #0f172a 0%, #1e293b 60%, #1e1b4b 100%); border: 1px solid rgba(255,215,0,0.25); border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(255,215,0,0.08); overflow: hidden;">

      <!-- 닫기 (작게, 강제 아님) -->
      <button id="feature-lock-close"
        style="position: absolute; top: 14px; right: 14px; z-index: 2; width: 32px; height: 32px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; color: rgba(255,255,255,0.7); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="닫기">✕</button>

      <!-- 헤더: 잠금 아이콘 + Pro 뱃지 -->
      <div style="padding: 32px 32px 16px 32px; text-align: center;">
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.35); border-radius: 50px; font-size: 12px; font-weight: 700; color: #ffd700; margin-bottom: 18px; letter-spacing: 1px;">
          <span>🔒</span><span>PRO 전용 기능</span>
        </div>
        <h2 id="feature-lock-title"
          style="margin: 0 0 6px 0; font-size: 24px; font-weight: 900; color: #f1f5f9; line-height: 1.3;">기능 잠금</h2>
        <p style="margin: 0; font-size: 13px; color: #94a3b8;">현재 무료 체험판에서는 잠시 사용할 수 없어요</p>
      </div>

      <!-- 가치 포인트 -->
      <div style="padding: 8px 32px 16px 32px;">
        <ul id="feature-lock-points"
          style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px;"></ul>
      </div>

      <!-- 사회적 증명 -->
      <div style="padding: 0 32px 22px 32px;">
        <div id="feature-lock-proof"
          style="padding: 12px 16px; background: linear-gradient(135deg, rgba(102,126,234,0.12), rgba(118,75,162,0.10)); border: 1px solid rgba(102,126,234,0.25); border-radius: 10px; font-size: 13px; color: #cbd5e1; text-align: center; font-weight: 500;"></div>
      </div>

      <!-- CTA 영역 -->
      <div style="padding: 0 32px 24px 32px; display: flex; flex-direction: column; gap: 12px;">
        <a id="feature-lock-cta-main" href="${PRICING_URL}" target="_blank" rel="noopener"
          style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px; background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%); color: #000; font-size: 15px; font-weight: 800; text-decoration: none; border-radius: 12px; transition: all 0.2s; box-shadow: 0 8px 24px rgba(255,215,0,0.25);">
          <span>Pro 구독하고 잠금 해제</span><span style="font-size: 18px;">→</span>
        </a>
        <a id="feature-lock-cta-kakao" href="${KAKAO_URL}" target="_blank" rel="noopener"
          style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; color: rgba(255,255,255,0.65); font-size: 12px; text-decoration: none; transition: color 0.2s;">
          <span>💬</span><span>먼저 카카오톡으로 문의하기</span>
        </a>
      </div>

      <!-- 소프트 안내 -->
      <div style="padding: 14px 32px; background: rgba(0,0,0,0.25); border-top: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: #64748b; text-align: center; line-height: 1.5;">
        💡 무료 체험판은 단일 발행 · 글 1편 작성까지 사용 가능해요
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 닫기 핸들러
  const closeBtn = document.getElementById('feature-lock-close');
  closeBtn?.addEventListener('click', hideLockModal);

  // 배경 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideLockModal();
  });

  // ✅ [2026-05-25] CTA → 시스템 기본 브라우저로 열기 (Electron 내부 창 X)
  //   사용자 명시 요청 — target="_blank" 대신 window.api.openExternalUrl 사용
  const openInBrowser = (url: string) => {
    try {
      const api = (window as any).api;
      if (api?.openExternalUrl) {
        api.openExternalUrl(url);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      console.warn('[featureLockModal] openExternalUrl 실패:', e);
      try { window.open(url, '_blank', 'noopener'); } catch { /* ignore */ }
    }
  };

  const mainCtaEl = document.getElementById('feature-lock-cta-main') as HTMLAnchorElement | null;
  mainCtaEl?.addEventListener('click', (e) => {
    e.preventDefault();
    openInBrowser(PRICING_URL);
  });

  const kakaoCtaEl = document.getElementById('feature-lock-cta-kakao') as HTMLAnchorElement | null;
  kakaoCtaEl?.addEventListener('click', (e) => {
    e.preventDefault();
    openInBrowser(KAKAO_URL);
  });

  // hover 효과
  const mainCta = document.getElementById('feature-lock-cta-main');
  mainCta?.addEventListener('mouseenter', () => {
    if (mainCta) {
      mainCta.style.transform = 'translateY(-2px)';
      mainCta.style.boxShadow = '0 12px 32px rgba(255,215,0,0.4)';
    }
  });
  mainCta?.addEventListener('mouseleave', () => {
    if (mainCta) {
      mainCta.style.transform = '';
      mainCta.style.boxShadow = '0 8px 24px rgba(255,215,0,0.25)';
    }
  });

  const kakaoCta = document.getElementById('feature-lock-cta-kakao');
  kakaoCta?.addEventListener('mouseenter', () => {
    if (kakaoCta) kakaoCta.style.color = 'rgba(255,255,255,0.9)';
  });
  kakaoCta?.addEventListener('mouseleave', () => {
    if (kakaoCta) kakaoCta.style.color = 'rgba(255,255,255,0.65)';
  });

  return modal;
}

function showLockModal(featureKey: LockFeatureKey): void {
  const modal = ensureLockModalDom();
  const copy = COPY_TABLE[featureKey];
  if (!copy) return;

  const titleEl = document.getElementById('feature-lock-title');
  if (titleEl) titleEl.textContent = copy.title;

  const pointsEl = document.getElementById('feature-lock-points');
  if (pointsEl) {
    pointsEl.innerHTML = copy.valuePoints.map(p => `
      <li style="display: flex; align-items: start; gap: 10px; padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; font-size: 13.5px; color: #e2e8f0; line-height: 1.5;">
        <span style="flex-shrink: 0; color: #ffd700; margin-top: 1px;">✓</span>
        <span>${escapeHtml(p)}</span>
      </li>
    `).join('');
  }

  const proofEl = document.getElementById('feature-lock-proof');
  if (proofEl) proofEl.textContent = `📊 ${copy.proof}`;

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function hideLockModal(): void {
  const modal = document.getElementById('feature-lock-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 무료 라이선스 여부 + lock 모달 표시.
 *
 * @returns true = 유료(허용), false = 무료(lock 모달 표시됨, 호출자는 즉시 return해야 함)
 */
export async function checkFeatureLockAndShow(featureKey: LockFeatureKey): Promise<boolean> {
  let isFreeLicense = false;
  try {
    const result = await (window as any).api?.getLicense?.();
    isFreeLicense = result?.license?.licenseType === 'free';
  } catch {
    // 라이선스 확인 실패 시 안전하게 free로 간주 (paywall 표시)
    isFreeLicense = true;
  }

  if (!isFreeLicense) return true; // 유료 사용자 → 통과

  showLockModal(featureKey);
  return false; // 무료 → 차단
}

// ✅ [2026-05-25] esbuild minify namespace 충돌 우회 (intervalJitter v2.10.352 케이스 동일 패턴)
//   다른 모듈에서 import 대신 window 글로벌로 호출 → namespace_1 미정의 ReferenceError 회피
(window as any).checkFeatureLockAndShow = checkFeatureLockAndShow;
