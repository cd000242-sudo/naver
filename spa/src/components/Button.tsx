import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { color, gradient, onGold, radius, whiteA } from '../styles/tokens';

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

/** 크기 계단 — 기존 CTA 들이 실제로 쓰던 값에서 추린 3단계. */
const SIZES: Record<ButtonSize, CSSProperties> = {
    sm: { padding: '10px 20px', fontSize: 14, borderRadius: radius.sm },
    md: { padding: '12px 24px', fontSize: 15, borderRadius: radius.md },
    lg: { padding: 18, fontSize: 16, borderRadius: radius.xl },
};

/**
 * 주 버튼의 골드는 goldBright 하나로 모은다.
 * 사용처가 더 많고(10곳 vs 5곳), 결제·요금제처럼 실제로 돈이 오가는
 * 화면이 이미 이 갈래를 쓰고 있어서 바꿀 때 위험이 가장 작다.
 */
const VARIANTS: Record<ButtonVariant, CSSProperties> = {
    primary: {
        background: gradient.goldBright,
        color: onGold.black,
        border: 'none',
        fontWeight: 800,
    },
    secondary: {
        background: whiteA(0.05),
        color: color.textPrimary,
        border: `1px solid ${whiteA(0.12)}`,
        fontWeight: 700,
    },
    ghost: {
        background: 'transparent',
        color: whiteA(0.7),
        border: 'none',
        fontWeight: 600,
    },
};

/** 비활성 모양 — 결제·주문 버튼이 쓰던 값을 그대로 표준으로 삼는다. */
const DISABLED: CSSProperties = {
    background: whiteA(0.08),
    color: whiteA(0.4),
    border: 'none',
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
