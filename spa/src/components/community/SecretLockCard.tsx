import { Link } from 'react-router-dom';
import { SECRET_LOCK } from '../../lib/communitySecret.mjs';
import LockMark from './LockMark';
import './community-secret.css';

/**
 * 시크릿 클래스 for someone outside it (a guest, or a member without an 올인원 licence of a year or more): what the
 * class is and where the prices are, instead of the list. The server sends none of its posts to these readers.
 */
function SecretLockCard() {
    return (
        <section className="lp-box cm-secret-lock" aria-labelledby="cm-secret-title">
            <LockMark size={28} />
            <h2 id="cm-secret-title">{SECRET_LOCK.title}</h2>
            <p className="cm-secret-tag">{SECRET_LOCK.tag}</p>
            <ul className="cm-secret-lines">
                {SECRET_LOCK.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <Link className="lp-btn lp-btn-dark" to={SECRET_LOCK.pricing}>{SECRET_LOCK.pricingLabel}</Link>
        </section>
    );
}

export default SecretLockCard;
