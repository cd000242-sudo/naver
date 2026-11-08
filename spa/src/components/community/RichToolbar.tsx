import type { ToolState } from './richEditorCommands';

export type ToolName = 'bold' | 'italic' | 'heading' | 'quote' | 'ul' | 'ol' | 'link' | 'photo' | 'hr';

type Props = {
    state: ToolState;
    photoCount: number;
    photoMax: number;
    disabled?: boolean;
    onTool: (tool: ToolName) => void;
};

const TOOLS: ReadonlyArray<{ tool: ToolName; label: string; on?: keyof ToolState }> = [
    { tool: 'bold', label: '굵게', on: 'bold' },
    { tool: 'italic', label: '기울임', on: 'italic' },
    { tool: 'heading', label: '소제목', on: 'heading' },
    { tool: 'quote', label: '인용', on: 'quote' },
    { tool: 'ul', label: '목록', on: 'ul' },
    { tool: 'ol', label: '번호 목록', on: 'ol' },
    { tool: 'link', label: '링크', on: 'link' },
    { tool: 'photo', label: '사진' },
    { tool: 'hr', label: '구분선' },
];

/** The formatting buttons. A mouse press must not take the caret out of the box, so mousedown is cancelled. */
function RichToolbar({ state, photoCount, photoMax, disabled = false, onTool }: Props) {
    return (
        <div className="cm-rich-bar" role="toolbar" aria-label="글 꾸미기">
            {TOOLS.map(({ tool, label, on }) => {
                const pressed = on ? Boolean(state[on]) : undefined;
                const full = tool === 'photo' && photoCount >= photoMax;
                return (
                    <button key={tool} type="button" className={`cm-rich-btn${pressed ? ' is-on' : ''}`} aria-pressed={pressed}
                        disabled={disabled || full} onMouseDown={(event) => event.preventDefault()} onClick={() => onTool(tool)}>
                        {label}{tool === 'photo' ? ` ${photoCount}/${photoMax}` : ''}
                    </button>
                );
            })}
        </div>
    );
}

export default RichToolbar;
