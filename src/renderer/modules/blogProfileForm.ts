// src/renderer/modules/blogProfileForm.ts
// "블로그 설정" 폼(2026-10-21) — 계정 관리 창 안에서 블로그마다 독자 · 주제 · 방향 · 말투를 저장한다.
// 통계가 없는 새 블로그도 독자 · 주제만 넣고 시작할 수 있다. 저장 전에는 가설(initial), [확인했어요]를 켜고 저장하면 confirmed.
// 다른 창에서 먼저 바꿨으면(profileVersion 불일치) 저장을 거절하고 다시 열게 한다.
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed blogProfile* / BLOG_PROFILE_*.

import { blogPerformanceBuildPanel } from './blogPerformancePanel.js';

type BlogProfileFormAccount = { id: string; name?: string; blogId?: string };
type BlogProfileReply = { success: boolean; profile?: BlogProfileData | null; warning?: string; code?: string; message?: string; json?: string };
type BlogProfileData = {
  intent: 'search' | 'homefeed' | 'mixed'; status: 'initial' | 'confirmed';
  subject: { topics: string[]; exclusions: string[] };
  reader: { who: string; situations: string[]; questions: string[] };
  purpose: string; voice: { examples: string[]; preferences: string[] };
  primarySources: Array<{ label: string; url: string }>;
  profileVersion?: number; updatedAt?: string; boundBlogId?: string;
};
type BlogProfileApi = {
  getBlogProfile?: (id: string) => Promise<BlogProfileReply>;
  saveBlogProfile?: (id: string, input: unknown, expectedVersion: number) => Promise<BlogProfileReply>;
  exportBlogProfile?: (id: string) => Promise<BlogProfileReply>;
  deleteBlogProfile?: (id: string) => Promise<BlogProfileReply>;
};

const BLOG_PROFILE_INTENTS: Array<[BlogProfileData['intent'], string]> = [
  ['search', '검색형 — 검색 질문에 바로 답하는 글'], ['homefeed', '홈판형 — 지금 읽을 계기와 장면이 있는 글'], ['mixed', '혼합'],
];
const BLOG_PROFILE_FIELD_CSS = 'width:100%;box-sizing:border-box;padding:0.5rem 0.6rem;border-radius:8px;border:1px solid rgba(148,163,184,0.4);background:rgba(15,23,42,0.6);color:inherit;font-size:0.86rem;';

function blogProfileApi(): BlogProfileApi { return ((window as unknown as { api?: BlogProfileApi }).api) || {}; }
function blogProfileEl<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.style.cssText = css; if (text !== undefined) element.textContent = text; return element;
}
const blogProfileLines = (value: string): string[] => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

/** 한 칸: 이름 · 도움말 · 입력(한 줄이면 input, 여러 줄이면 textarea — 한 줄에 하나). */
function blogProfileField(label: string, help: string, value: string, multiline: boolean): { wrap: HTMLElement; read: () => string; write: (text: string) => void } {
  const wrap = blogProfileEl('label', 'display:block;margin-bottom:0.75rem;font-size:0.86rem;font-weight:600;', label);
  const input = multiline ? blogProfileEl('textarea', `${BLOG_PROFILE_FIELD_CSS}min-height:4.2rem;resize:vertical;`) : blogProfileEl('input', BLOG_PROFILE_FIELD_CSS);
  input.value = value; input.style.marginTop = '0.3rem';
  wrap.append(input, blogProfileEl('div', 'font-weight:400;font-size:0.76rem;color:var(--text-muted,#94a3b8);margin-top:0.2rem;', help));
  return { wrap, read: () => input.value, write: (text: string) => { input.value = text; } };
}

export async function blogProfileBuildForm(account: BlogProfileFormAccount, done: { onClose: () => void; say: (text: string, failed?: boolean) => void }): Promise<HTMLElement> {
  const api = blogProfileApi();
  const form = blogProfileEl('form', '');
  const reply = await api.getBlogProfile?.(account.id).catch(() => undefined);
  if (!reply?.success) {
    form.append(blogProfileEl('div', 'padding:1rem 0;color:#fca5a5;', reply?.message || '블로그 설정을 불러오지 못했습니다.'));
    const back = blogProfileEl('button', 'padding:0.45rem 0.9rem;border-radius:8px;border:1px solid #94a3b8;background:transparent;color:inherit;cursor:pointer;', '돌아가기');
    back.type = 'button'; back.addEventListener('click', done.onClose); form.append(back); return form;
  }
  const p = reply.profile || null;
  const expected = p?.profileVersion || 0;
  const head = p
    ? `설정 버전 ${p.profileVersion} · ${p.status === 'confirmed' ? '확인됨' : '초기 가설'} · 저장 ${String(p.updatedAt || '').slice(0, 16).replace('T', ' ')}`
    : '아직 설정이 없습니다. 지금은 계정 기본값(말투 · 카테고리 · 키워드)으로 글을 씁니다. 독자와 주제만 넣어도 시작할 수 있어요.';
  form.append(blogProfileEl('div', 'font-size:0.82rem;line-height:1.6;color:var(--text-muted,#cbd5e1);margin-bottom:0.8rem;', head));
  if ((reply as { blogKnown?: boolean }).blogKnown === false) {
    form.append(blogProfileEl('div', 'font-size:0.84rem;color:#fcd34d;margin-bottom:0.8rem;', '이 계정의 블로그 주소 칸에 이름만 있습니다. [수정]에서 blog.naver.com/아이디 주소를 넣어야 설정과 성과를 이 블로그에 연결할 수 있어요(로그인 아이디와 블로그 주소가 다를 수 있습니다).'));
  }
  if (reply.warning === 'BLOG_PROFILE_BINDING_MISMATCH') {
    form.append(blogProfileEl('div', 'font-size:0.84rem;color:#fcd34d;margin-bottom:0.8rem;', '저장된 설정은 다른 블로그 주소로 만든 것이라 지금은 쓰지 않습니다. 이 블로그에 맞게 다시 저장해 주세요.'));
  }

  const intentBox = blogProfileEl('fieldset', 'border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:0.5rem 0.7rem;margin:0 0 0.8rem;');
  intentBox.append(blogProfileEl('legend', 'font-size:0.86rem;font-weight:600;padding:0 0.3rem;', '글 방향'));
  for (const [value, text] of BLOG_PROFILE_INTENTS) {
    const row = blogProfileEl('label', 'display:block;font-size:0.84rem;margin:0.2rem 0;cursor:pointer;');
    const radio = blogProfileEl('input', 'margin-right:0.4rem;'); radio.type = 'radio'; radio.name = 'blog-profile-intent'; radio.value = value;
    radio.checked = (p?.intent || 'mixed') === value; row.append(radio, document.createTextNode(text)); intentBox.append(row);
  }
  const fields = {
    topics: blogProfileField('다루는 주제', '한 줄에 하나 — 예: 자동차 고장 · 수입차 관리', (p?.subject.topics || []).join('\n'), true),
    exclusions: blogProfileField('다루지 않을 주제', '한 줄에 하나 — 예: 보험 영업 · 열애설 추측', (p?.subject.exclusions || []).join('\n'), true),
    who: blogProfileField('주 독자', '누가 읽나요? 예: 차를 처음 산 30대', p?.reader.who || '', false),
    situations: blogProfileField('독자 상황', '한 줄에 하나 — 예: 경고등이 켜졌다', (p?.reader.situations || []).join('\n'), true),
    questions: blogProfileField('독자 질문', '한 줄에 하나 — 실제로 검색 · 궁금해하는 질문', (p?.reader.questions || []).join('\n'), true),
    purpose: blogProfileField('운영 목적', '예: 고장 상황에서 바로 확인할 답', p?.purpose || '', false),
    examples: blogProfileField('말투 예문', '이 블로그에 실제로 쓴 문장 한 줄씩(호흡 참고용 — 문장 · 사실은 옮기지 않아요)', (p?.voice.examples || []).join('\n'), true),
    preferences: blogProfileField('말투 메모', '한 줄에 하나 — 예: 짧은 문장 · 결론 먼저', (p?.voice.preferences || []).join('\n'), true),
    sources: blogProfileField('주로 확인할 1차 출처', '한 줄에 하나: 이름 | https://주소', (p?.primarySources || []).map(s => `${s.label} | ${s.url}`).join('\n'), true),
  };
  const confirm = blogProfileEl('label', 'display:block;font-size:0.84rem;margin:0.4rem 0 0.9rem;cursor:pointer;');
  const confirmBox = blogProfileEl('input', 'margin-right:0.4rem;'); confirmBox.type = 'checkbox'; confirmBox.checked = p?.status === 'confirmed';
  confirm.append(confirmBox, document.createTextNode('내용을 확인했어요(확인 전에는 초기 가설로 표시)'));
  // 최근 공개 글 · 성과로 추천 받기(2026-10-21) — 칸만 채우고 저장은 사용자가 한다
  const suggest = blogProfileEl('button', 'padding:0.45rem 0.9rem;border-radius:8px;border:1px solid #a78bfa;background:transparent;color:#a78bfa;font-weight:600;cursor:pointer;margin-bottom:0.8rem;', '최근 글로 추천 받기');
  suggest.type = 'button';
  const suggestNote = blogProfileEl('div', 'font-size:0.78rem;color:var(--text-muted,#94a3b8);margin:-0.4rem 0 0.8rem;');
  suggest.addEventListener('click', () => { void (async () => {
    suggest.disabled = true; suggestNote.textContent = '최근 공개 글을 읽고 작성 엔진에 추천을 받는 중입니다…';
    const result = await (api as { suggestBlogProfile?: (id: string) => Promise<{ success: boolean; profile?: BlogProfileData; evidence?: string[]; titleCount?: number; engine?: string; message?: string }> })
      .suggestBlogProfile?.(account.id).catch(() => undefined);
    suggest.disabled = false;
    if (!result?.success || !result.profile) { suggestNote.textContent = ''; done.say(result?.message || '추천을 받지 못했습니다.', true); return; }
    const s = result.profile;
    const radio = form.querySelector<HTMLInputElement>(`input[name="blog-profile-intent"][value="${s.intent}"]`); if (radio) radio.checked = true;
    fields.topics.write(s.subject.topics.join('\n')); fields.exclusions.write(s.subject.exclusions.join('\n'));
    fields.who.write(s.reader.who); fields.situations.write(s.reader.situations.join('\n')); fields.questions.write(s.reader.questions.join('\n'));
    if (s.purpose) fields.purpose.write(s.purpose);
    confirmBox.checked = false;
    suggestNote.textContent = `공개 글 ${result.titleCount}편으로 만든 추천(${result.engine}) — 초기 가설입니다. 근거 제목: ${(result.evidence || []).slice(0, 5).join(' / ') || '없음'}. 확인 후 저장하세요.`;
  })(); });
  form.append(suggest, suggestNote, intentBox, ...Object.values(fields).map(f => f.wrap), confirm);

  const buttons = blogProfileEl('div', 'display:flex;gap:0.5rem;flex-wrap:wrap;');
  const button = (text: string, color: string, type: 'button' | 'submit' = 'button') => {
    const b = blogProfileEl('button', `padding:0.45rem 0.9rem;border-radius:8px;border:1px solid ${color};background:transparent;color:${color};font-weight:600;cursor:pointer;`, text);
    b.type = type; return b;
  };
  const save = button('저장', '#34d399', 'submit'); const exportButton = button('내보내기(복사)', '#60a5fa');
  const remove = button('설정 삭제', '#f87171'); const cancel = button('돌아가기', '#94a3b8');
  buttons.append(save, exportButton, remove, cancel); form.append(buttons);

  const collect = () => ({
    intent: (form.querySelector<HTMLInputElement>('input[name="blog-profile-intent"]:checked')?.value || 'mixed'),
    status: confirmBox.checked ? 'confirmed' : 'initial',
    subject: { topics: blogProfileLines(fields.topics.read()), exclusions: blogProfileLines(fields.exclusions.read()) },
    reader: { who: fields.who.read(), situations: blogProfileLines(fields.situations.read()), questions: blogProfileLines(fields.questions.read()) },
    purpose: fields.purpose.read(),
    voice: { examples: blogProfileLines(fields.examples.read()), preferences: blogProfileLines(fields.preferences.read()) },
    primarySources: blogProfileLines(fields.sources.read()).map(line => {
      const [label, ...rest] = line.split('|'); const url = rest.join('|').trim();
      return url ? { label: label.trim(), url } : { label: '', url: label.trim() };
    }),
    provenance: { profile: 'user' },
  });
  form.addEventListener('submit', event => { event.preventDefault(); void (async () => {
    save.disabled = true;
    const result = await api.saveBlogProfile?.(account.id, collect(), expected).catch(() => undefined);
    save.disabled = false;
    if (!result?.success) { done.say(result?.message || '저장하지 못했습니다.', true); return; }
    done.say(`블로그 설정을 저장했습니다(버전 ${result.profile?.profileVersion}). 다음 글부터 반영됩니다.`); done.onClose();
  })(); });
  exportButton.addEventListener('click', () => { void (async () => {
    const result = await api.exportBlogProfile?.(account.id).catch(() => undefined);
    if (!result?.success || !result.json) { done.say(result?.message || '내보낼 설정이 없습니다.', true); return; }
    try { await navigator.clipboard.writeText(result.json); done.say('설정을 클립보드에 복사했습니다.'); } catch { done.say('클립보드에 복사하지 못했습니다.', true); }
  })(); });
  remove.addEventListener('click', () => { void (async () => {
    if (!window.confirm('이 블로그의 설정을 삭제할까요? 계정 · 원고 · 예약은 그대로 둡니다.')) return;
    const result = await api.deleteBlogProfile?.(account.id).catch(() => undefined);
    if (!result?.success) { done.say(result?.message || '삭제할 설정이 없습니다.', true); return; }
    done.say('블로그 설정을 삭제했습니다. 계정 기본값으로 돌아갑니다.'); done.onClose();
  })(); });
  cancel.addEventListener('click', done.onClose);
  form.append(blogPerformanceBuildPanel(account.id, done.say));
  return form;
}
