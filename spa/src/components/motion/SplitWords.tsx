import { Fragment } from 'react';
import './motion.css';

/**
 * Headline that rises in word by word, once, on first paint (60ms between words).
 * The words stay real text in one element, so reading order and copy are unchanged.
 * `offset` continues the sequence when one headline is split across lines (count of earlier words).
 */
function SplitWords({ text, step = 60, offset = 0 }: { text: string; step?: number; offset?: number }) {
    const words = text.split(/\s+/).filter(Boolean);
    return (
        <>
            {words.map((word, index) => (
                <Fragment key={`${word}-${index}`}>
                    <span className="lp-word" style={{ animationDelay: `${(offset + index) * step}ms` }}>{word}</span>
                    {index < words.length - 1 ? ' ' : null}
                </Fragment>
            ))}
        </>
    );
}

export default SplitWords;
