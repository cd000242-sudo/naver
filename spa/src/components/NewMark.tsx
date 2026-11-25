import '../styles/new-mark.css';

/**
 * The yellow "NEW!" pill on a board row that holds a post the reader has not seen yet (2026-11-25).
 * A screen reader hears "새 글 있음" instead of the letters; the pill itself never blinks or moves.
 */
function NewMark() {
    return (
        <span className="new-mark">
            <span aria-hidden="true">NEW!</span>
            <span className="new-mark-sr">새 글 있음</span>
        </span>
    );
}

export default NewMark;
