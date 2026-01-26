// src/ui/components/UIFactory.ts
// 재사용 가능한 UI 요소 생성 팩토리

import { escapeHtml } from '../utils';
import { createElement } from './DomHelper';

/**
 * 리스트 아이템 생성
 */
export function createListItem(options: {
    id?: string;
    title: string;
    subtitle?: string;
    badge?: string;
    badgeColor?: string;
    actions?: Array<{ icon: string; label: string; onClick: () => void; variant?: 'primary' | 'danger' | 'default' }>;
    onClick?: () => void;
    selected?: boolean;
}): HTMLElement {
    const item = createElement('div', {
        className: `list-item ${options.selected ? 'list-item--selected' : ''}`,
        attributes: options.id ? { 'data-id': options.id } : {}
    });

    // 콘텐츠 영역
    const content = createElement('div', { className: 'list-item__content' });

    const titleEl = createElement('div', {
        className: 'list-item__title',
        innerHTML: escapeHtml(options.title)
    });
    content.appendChild(titleEl);

    if (options.subtitle) {
        const subtitleEl = createElement('div', {
            className: 'list-item__subtitle',
            textContent: options.subtitle
        });
        content.appendChild(subtitleEl);
    }

    item.appendChild(content);

    // 뱃지
    if (options.badge) {
        const badge = createElement('span', {
            className: `list-item__badge list-item__badge--${options.badgeColor || 'default'}`,
            textContent: options.badge
        });
        item.appendChild(badge);
    }

    // 액션 버튼들
    if (options.actions && options.actions.length > 0) {
        const actionsContainer = createElement('div', { className: 'list-item__actions' });

        for (const action of options.actions) {
            const btn = createElement('button', {
                className: `btn btn--icon btn--${action.variant || 'default'}`,
                innerHTML: action.icon,
                attributes: { title: action.label }
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                action.onClick();
            });
            actionsContainer.appendChild(btn);
        }

        item.appendChild(actionsContainer);
    }

    // 클릭 이벤트
    if (options.onClick) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', options.onClick);
    }

    return item;
}

/**
 * 버튼 생성
 */
export function createButton(options: {
    text: string;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
}): HTMLButtonElement {
    const btn = createElement('button', {
        className: `btn btn--${options.variant || 'primary'} btn--${options.size || 'md'}`,
        innerHTML: options.icon
            ? `<span class="btn__icon">${options.icon}</span><span class="btn__text">${escapeHtml(options.text)}</span>`
            : escapeHtml(options.text)
    }) as HTMLButtonElement;

    btn.type = 'button';
    if (options.disabled) btn.disabled = true;
    if (options.onClick) btn.addEventListener('click', options.onClick);

    if (options.loading) {
        btn.classList.add('btn--loading');
        btn.disabled = true;
    }

    return btn;
}

/**
 * 입력 필드 생성
 */
export function createInput(options: {
    type?: 'text' | 'url' | 'email' | 'password' | 'number';
    id?: string;
    name?: string;
    placeholder?: string;
    value?: string;
    required?: boolean;
    disabled?: boolean;
    onChange?: (value: string) => void;
}): HTMLInputElement {
    const input = createElement('input', {
        className: 'input',
        attributes: {
            type: options.type || 'text',
            ...(options.id && { id: options.id }),
            ...(options.name && { name: options.name }),
            ...(options.placeholder && { placeholder: options.placeholder }),
            ...(options.required && { required: 'required' })
        }
    }) as HTMLInputElement;

    if (options.value) input.value = options.value;
    if (options.disabled) input.disabled = true;
    if (options.onChange) {
        input.addEventListener('input', () => options.onChange!(input.value));
    }

    return input;
}

/**
 * 셀렉트 박스 생성
 */
export function createSelect(options: {
    id?: string;
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
}): HTMLSelectElement {
    const select = createElement('select', {
        className: 'select',
        attributes: options.id ? { id: options.id } : {}
    }) as HTMLSelectElement;

    if (options.placeholder) {
        const placeholderOpt = createElement('option', {
            attributes: { value: '', disabled: 'disabled', selected: 'selected' },
            textContent: options.placeholder
        });
        select.appendChild(placeholderOpt);
    }

    for (const opt of options.options) {
        const optEl = createElement('option', {
            attributes: {
                value: opt.value,
                ...(opt.disabled && { disabled: 'disabled' })
            },
            textContent: opt.label
        });
        select.appendChild(optEl);
    }

    if (options.value) select.value = options.value;
    if (options.onChange) {
        select.addEventListener('change', () => options.onChange!(select.value));
    }

    return select;
}

/**
 * 토스트 알림 표시
 */
export function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000): void {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = createElement('div', {
        className: `toast toast--${type}`,
        innerHTML: `
      <span class="toast__icon">${getToastIcon(type)}</span>
      <span class="toast__message">${escapeHtml(message)}</span>
    `
    });

    container.appendChild(toast);

    // 애니메이션
    requestAnimationFrame(() => {
        toast.classList.add('toast--visible');
    });

    // 자동 제거
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function createToastContainer(): HTMLElement {
    const container = createElement('div', {
        id: 'toast-container',
        className: 'toast-container'
    });
    document.body.appendChild(container);
    return container;
}

function getToastIcon(type: string): string {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        default: return '💬';
    }
}

/**
 * 로딩 스피너 생성
 */
export function createSpinner(size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
    return createElement('div', {
        className: `spinner spinner--${size}`
    });
}

/**
 * 빈 상태 표시 생성
 */
export function createEmptyState(options: {
    icon?: string;
    title: string;
    description?: string;
    action?: { text: string; onClick: () => void };
}): HTMLElement {
    const container = createElement('div', { className: 'empty-state' });

    if (options.icon) {
        container.appendChild(createElement('div', {
            className: 'empty-state__icon',
            textContent: options.icon
        }));
    }

    container.appendChild(createElement('div', {
        className: 'empty-state__title',
        textContent: options.title
    }));

    if (options.description) {
        container.appendChild(createElement('div', {
            className: 'empty-state__description',
            textContent: options.description
        }));
    }

    if (options.action) {
        container.appendChild(createButton({
            text: options.action.text,
            variant: 'primary',
            onClick: options.action.onClick
        }));
    }

    return container;
}
