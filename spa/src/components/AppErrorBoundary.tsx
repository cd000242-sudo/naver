import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, recoverFromChunkError } from '../lib/chunkRecovery.mjs';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Last line of defence so the site never stays as an empty background.
 * Stale chunk after a deploy → reload once; anything else → a visible screen with a reload button.
 */
export default class AppErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        if (isChunkLoadError(error) && recoverFromChunkError()) return;
        console.error('[AppErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f5f0', color: '#1d2129' }}>
                <div style={{ maxWidth: 420, textAlign: 'center' }}>
                    <p style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>화면을 다시 불러와 주세요</p>
                    <p style={{ fontSize: 17, lineHeight: 1.6, margin: '0 0 22px', color: '#4b5160' }}>
                        사이트가 새로 바뀌었거나 연결이 잠시 끊겼어요.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{ minHeight: 52, padding: '0 28px', borderRadius: 12, border: 0, background: '#1d2129', color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
                    >
                        새로고침
                    </button>
                </div>
            </div>
        );
    }
}
