import './motion.css';

/**
 * One fixed, non-interactive layer of slow warm light behind the page content.
 * Three large low-saturation radial blobs drift on 22-30s loops (transform only).
 * Sits under every in-flow box (z-index -1), so it only tints the bare page background.
 */
function AmbientGlow() {
    return (
        <div className="lp-glow" aria-hidden="true">
            <i className="lp-glow-a" />
            <i className="lp-glow-b" />
            <i className="lp-glow-c" />
        </div>
    );
}

export default AmbientGlow;
