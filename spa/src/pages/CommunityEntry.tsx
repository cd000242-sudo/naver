import { useLocation } from 'react-router-dom';
import RequireLogin from '../components/auth/RequireLogin';
import { useSiteSession } from '../lib/useSiteSession';
import CommunityPage from './CommunityPage';
import GuestCommunityPage from './GuestCommunityPage';

/** /community: a member gets the community exactly as before; a visitor without a login reads the open boards. */
function CommunityEntry() {
    const location = useLocation();
    const site = useSiteSession(location.pathname);
    if (site.community) return <RequireLogin area="community"><CommunityPage /></RequireLogin>;
    return <GuestCommunityPage legacy={Boolean(site.leword)} />;
}

export default CommunityEntry;
