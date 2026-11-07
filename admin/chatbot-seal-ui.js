(function attachChatbotSealUi(root) {
    'use strict';

    // "링크와 비밀번호 바꾸기" part of the free-chatbot editor. The plaintext link and password live only in the three
    // sealing inputs until the ciphertext is made; they are cleared right after, never stored, sent or logged.
    // Only the ciphertext object is handed to chatbot-editor.js (getPayload) and saved with the site content.
    const INPUTS = ['cb-seal-link', 'cb-seal-pw', 'cb-seal-pw2'];
    const ERRORS = ['cb-seal-link-error', 'cb-seal-pw-error', 'cb-seal-pw2-error'];

    let payload = null;
    let pending = false;
    let installed = false;
    let notify = function noop() {};

    const doc = root.document;
    const el = (id) => doc.getElementById(id);
    const sealer = () => root.AdminProtectedLink;

    function renderStatus() {
        const status = el('cb-locked-status');
        if (status) {
            status.textContent = pending
                ? '새 링크를 암호화했습니다. 저장해야 사이트에 반영됩니다.'
                : (payload ? '바꾼 링크가 적용되어 있습니다. (암호문만 저장됩니다)' : '사이트 기본 링크를 쓰고 있습니다.');
        }
        el('cb-seal-reset').hidden = payload === null;
    }

    function resetForm() {
        INPUTS.forEach((id) => { el(id).value = ''; });
        ERRORS.forEach((id) => { el(id).textContent = ''; });
        el('cb-seal-warn').textContent = '';
    }

    function setOpen(open) {
        el('cb-seal-form').hidden = !open;
        el('cb-seal-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) el('cb-seal-link').focus();
    }

    async function apply() {
        const link = el('cb-seal-link').value.trim();
        const password = el('cb-seal-pw').value;
        const linkProblem = sealer().checkLink(link);
        const passwordProblem = password.trim() === '' ? '비밀번호를 입력해 주세요.' : '';
        const repeatProblem = !passwordProblem && !sealer().samePassword(password, el('cb-seal-pw2').value)
            ? '두 비밀번호가 같지 않습니다.' : '';
        el('cb-seal-link-error').textContent = linkProblem;
        el('cb-seal-pw-error').textContent = passwordProblem;
        el('cb-seal-pw2-error').textContent = repeatProblem;
        if (linkProblem || passwordProblem || repeatProblem) return;
        const button = el('cb-seal-apply');
        button.disabled = true;
        button.textContent = '암호화 중…';
        try {
            payload = await sealer().seal(link, password);
            pending = true;
            resetForm();
            setOpen(false);
            renderStatus();
            notify();
        } catch (error) {
            el('cb-seal-pw2-error').textContent = '암호화하지 못했습니다. ' + (error && error.message ? error.message : '');
        } finally {
            button.disabled = false;
            button.textContent = '암호화해서 적용';
        }
    }

    function hasUnappliedInput() {
        return INPUTS.some((id) => el(id).value !== '');
    }

    /** Shows (and returns) a message while typed link/password were never applied; '' when nothing is waiting. */
    function checkPending() {
        const message = hasUnappliedInput()
            ? "입력한 링크와 비밀번호가 아직 적용되지 않았습니다. '암호화해서 적용'을 눌러 주세요." : '';
        el('cb-seal-pending').textContent = message;
        return message;
    }

    function load(sealed) {
        payload = root.AdminChatbotTiles.isSealedPayload(sealed) ? JSON.parse(JSON.stringify(sealed)) : null;
        pending = false;
        resetForm();
        setOpen(false);
        renderStatus();
        el('cb-seal-pending').textContent = '';
    }

    function markSaved() {
        pending = false;
        renderStatus();
    }

    function install(onChange) {
        if (typeof onChange === 'function') notify = onChange;
        if (installed) return;
        installed = true;
        el('cb-seal-toggle').addEventListener('click', () => setOpen(el('cb-seal-form').hidden));
        el('cb-seal-apply').addEventListener('click', apply);
        el('cb-seal-reset').addEventListener('click', () => {
            payload = null;
            pending = false;
            renderStatus();
            notify();
        });
        // Typing a link or password is not an edit (nothing about it is saved) and must not reach the live preview.
        ['input', 'change'].forEach((name) => el('cb-seal-form').addEventListener(name, (event) => {
            event.stopPropagation();
            if (event.target.id === 'cb-seal-pw') el('cb-seal-warn').textContent = sealer().passwordWarning(event.target.value);
        }));
    }

    root.AdminChatbotSealUi = Object.freeze({
        install,
        load,
        checkPending,
        markSaved,
        getPayload: () => payload,
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
