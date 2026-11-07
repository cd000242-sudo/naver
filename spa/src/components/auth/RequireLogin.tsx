import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteSession } from '../../lib/useSiteSession';
import LoginRequired from './LoginRequired';

type Props = {
    area: 'community' | 'leword';
    children: ReactNode;
};

/**
 * Route guard: renders the page only with a site (community) login. Without one, the visitor gets the
 * "log in first" screen whose buttons come back to this very address (path + query) after login.
 */
function RequireLogin({ area, children }: Props) {
    const location = useLocation();
    const site = useSiteSession(location.pathname);
    if (site.community) return <>{children}</>;
    return <LoginRequired area={area} next={location.pathname + location.search} legacy={Boolean(site.leword)} />;
}

export default RequireLogin;
