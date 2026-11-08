import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MyPosts from '../components/account/MyPostsList';
import PasswordSettings from '../components/account/PasswordSettings';
import ProfileCard from '../components/account/ProfileCard';
import { fetchProfileDetail, type ProfileDetail } from '../lib/communityAccount';
import { signOutAll } from '../lib/communityAuth';
import { useSiteSession } from '../lib/useSiteSession';
import '../styles/light-page.css';
import '../components/auth/auth.css';
import '../components/account/account.css';
import '../components/community/community-forum.css';

/**
 * /me — my profile and settings (reachable only with a site login: RequireLogin in App). The profile comes from the
 * stored login first and is completed by the server (phone state, join date); a dead token logs the browser out
 * and RequireLogin takes over. Server text is drawn as text everywhere.
 */
function MyPage() {
    const navigate = useNavigate();
    const site = useSiteSession();
    const profile = site.community;
    const [detail, setDetail] = useState<ProfileDetail | null>(null);
    const [problem, setProblem] = useState('');
    const [leaving, setLeaving] = useState(false);

    const load = useCallback(async () => {
        const result = await fetchProfileDetail();
        if (result.ok) { setDetail(result.detail); setProblem(''); } else setProblem(result.message);
    }, []);

    useEffect(() => {
        const previous = document.title;
        document.title = '내 정보 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    useEffect(() => { void load(); }, [load]);

    const logout = async () => {
        if (leaving) return;
        setLeaving(true);
        await signOutAll();
        navigate('/', { replace: true });
    };

    if (!profile) return null;

    return (
        <div className="lp me">
            <div className="lp-wrap me-wrap">
                <h1 className="me-title">내 정보</h1>
                {problem ? (
                    <div className="lp-error me-problem" role="alert">
                        <p>{problem}</p>
                        <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={() => { void load(); }}>다시 불러오기</button>
                    </div>
                ) : null}
                <ProfileCard profile={profile} detail={detail} onChanged={() => { void load(); }} onDetail={setDetail} />
                <section className="lp-box me-card" aria-labelledby="me-posts-title">
                    <h2 id="me-posts-title">내가 쓴 글</h2>
                    <MyPosts />
                </section>
                <section className="lp-box me-card" aria-labelledby="me-settings-title">
                    <h2 id="me-settings-title">설정</h2>
                    <h3>비밀번호 바꾸기</h3>
                    <PasswordSettings />
                    <div className="me-logout">
                        <button type="button" className="lp-btn lp-btn-line lp-btn-full" disabled={leaving} onClick={() => { void logout(); }}>
                            {leaving ? '로그아웃하는 중…' : '로그아웃'}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default MyPage;
