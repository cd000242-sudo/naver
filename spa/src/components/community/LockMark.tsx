import './community-secret.css';

/** The lock drawn next to 시크릿 클래스 (board menu, tabs, lock screen). */
function LockMark({ size = 14 }: { size?: number }) {
    return (
        <svg className="cm-lock" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="잠금">
            <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
        </svg>
    );
}

export default LockMark;
