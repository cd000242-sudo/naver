import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import LoginRequired from '../components/auth/LoginRequired';
import GuestCommunityView from '../components/community/GuestCommunityView';
import { guestScreen } from '../lib/communityGuest.mjs';
import { ALL_BOARD, boardList, parseCommunityQuery } from '../lib/communityModel.mjs';
import { SECRET_BOARD } from '../lib/communitySecret.mjs';
import { useBoardFeed } from '../lib/useBoardFeed';
import { useBoardNewTracking, useNewBoards } from '../lib/useNewBoards';

/** /community without a login. Members-only screens never ask the server: the login screen is drawn at once. */
function GuestCommunityPage({ legacy }: { legacy: boolean }) {
    const location = useLocation();
    const next = location.pathname + location.search;
    const view = useMemo(() => parseCommunityQuery(location.search), [location.search]);
    if (guestScreen(view) === 'login') return <LoginRequired area="community" next={next} legacy={legacy} />;
    return <GuestReader view={view} next={next} legacy={legacy} />;
}

function GuestReader({ view, next, legacy }: { view: ReturnType<typeof parseCommunityQuery>; next: string; legacy: boolean }) {
    // The secret board has nothing for a guest: the side counts come from the all-boards read instead.
    const feedView = useMemo(() => (view.board === SECRET_BOARD ? { ...view, board: ALL_BOARD } : view), [view]);
    const feed = useBoardFeed(feedView, 0);
    const boards = useMemo(() => boardList(feed.config), [feed.config]);
    const newBoards = useNewBoards();
    useBoardNewTracking({ board: view.board, listing: !view.post && guestScreen(view) === 'read', feed });
    const [blocked, setBlocked] = useState(false);
    useEffect(() => { setBlocked(false); }, [next]);
    useEffect(() => {
        const previous = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);
    return <GuestCommunityView view={view} feed={feed} boards={boards} next={next} legacy={legacy} blocked={blocked} onBlocked={() => setBlocked(true)} newBoards={newBoards} />;
}

export default GuestCommunityPage;
