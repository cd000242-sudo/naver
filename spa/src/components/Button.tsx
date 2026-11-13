import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { light, lightRadius, motion, type } from '../styles/tokens';

/**
 * 공용 버튼 — 사이트의 모든 CTA 가 같은 모양을 갖게 하는 한 곳.
 *
 * 지금 CTA 는 페이지마다 인라인 스타일을 복붙해서 유지되고 있다. 그 결과
 * 같은 "주 버튼"이 골드 2갈래(#FFD700→#FFA500 / #c9a84c→#d4a012), 글자색 4종,
 * 모서리 8·10·14 로 갈렸다. 결제 페이지 한 장 안에서도 두 골드가 섞인다.
 * 이 컴포넌트를 쓰는 순간 그 갈래가 하나로 모인다.
 *
 * 프로젝트 규칙대로 CSS 클래스를 만들지 않고 인라인 스타일만 쓴다.
 * 그래서 기존 페이지의 인라인 스타일과 섞어 써도 특이성 충돌이 없다.
 * 개별 조정이 필요하면 style prop 으로 덮으면 된다(마지막에 병합된다).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type CommonProps = {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** 폭을 100% 로. 폼 제출·모바일 CTA 에서 쓴다. */
    fullWidth?: boolean;
    /** 인라인 스타일 덮어쓰기. 토큰 값을 이긴다. */
    style?: CSSProperties;
    className?: string;
    'aria-label'?: string;
};

type ButtonElementProps = CommonProps & {
    as?: 'button';
    onClick?: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    type?: 'button' | 'submit';
};

type LinkProps = CommonProps & {
    as: 'link';
    /** react-router 내부 이동. */
    to: string;
};

type AnchorProps = CommonProps & {
    as: 'a';
    href: string;
    target?: string;
    rel?: string;
};

type Props = ButtonElementProps | LinkProps | AnchorProps;

/** Size steps. Every size keeps the 44px touch height and the control radius (10). */
const SIZES: Record<ButtonSize, CSSProperties> = {
    sm: { padding: '8px 16px', fontSize: type.small, borderRadius: lightRadius.control },
    md: { padding: '12px 24px', fontSize: type.small, borderRadius: lightRadius.control },
    lg: { padding: '16px 28px', fontSize: type.body, borderRadius: lightRadius.control },
};

/**
 * Light theme. The primary button is the one gold fill on a screen (dark text on it).
 * Secondary is a white surface with a quiet line; ghost is text only.
 */
const VARIANTS: Record<ButtonVariant, CSSProperties> = {
    primary: {
        background: light.accent,
        color: light.onAccent,
        border: '1px solid transparent',
        fontWeight: 600,
    },
    secondary: {
        background: light.surface,
        color: light.text,
        border: `1px solid ${light.lineStrong}`,
        fontWeight: 600,
    },
    ghost: {
        background: 'transparent',
        color: light.textSecondary,
        border: '1px solid transparent',
        fontWeight: 500,
    },
};

/** Disabled look: a flat raised surface with muted text. */
const DISABLED: CSSProperties = {
    background: light.raised,
    color: light.textMuted,
    border: `1px solid ${light.line}`,
    cursor: 'not-allowed',
};

function Button(props: Props) {
    const {
        children,
        variant = 'primary',
        size = 'md',
        fullWidth = false,
        style,
        className,
    } = props;

    const isDisabled = props.as === undefined || props.as === 'button' ? Boolean(props.disabled) : false;

    const base: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        textDecoration: 'none',
        lineHeight: 1.4,
        cursor: 'pointer',
        // 모바일 터치 타깃 최소 높이 — 접근성 기준(44px)에 맞춘다.
        minHeight: 44,
        boxSizing: 'border-box',
        transition: `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}`,
        ...SIZES[size],
        ...VARIANTS[variant],
        ...(isDisabled ? DISABLED : null),
        ...(fullWidth ? { width: '100%' } : null),
        ...style,
    };

    if (props.as === 'link') {
        return (
            <Link to={props.to} style={base} className={className} aria-label={props['aria-label']}>
                {children}
            </Link>
        );
    }

    if (props.as === 'a') {
        return (
            <a
                href={props.href}
                target={props.target}
                rel={props.rel}
                style={base}
                className={className}
                aria-label={props['aria-label']}
            >
                {children}
            </a>
        );
    }

    return (
        <button
            type={props.type || 'button'}
            onClick={props.onClick}
            disabled={props.disabled}
            style={base}
            className={className}
            aria-label={props['aria-label']}
        >
            {children}
        </button>
    );
}

export default Button;
