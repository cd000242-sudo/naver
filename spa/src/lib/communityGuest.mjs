/**
 * Guest (no login) reading of the community: which screens a visitor may read and where the rest leads.
 * The server keeps its own list (COMMUNITY_GUEST_BOARDS_ in the GAS code) and stays the authority; add a board
 * id to both lists to open another board.
 */
import { ALL_BOARD, communityPath } from './communityModel.mjs';
import { loginPath } from './siteAuthModel.mjs';
import { SECRET_BOARD } from './communitySecret.mjs';

export const GUEST_BOARDS = Object.freeze(['notice', 'news']);

export const isGuestBoard = (id) => GUEST_BOARDS.includes(id);

/**
 * 'read' = the guest page draws it; 'secret' = the lock screen of 시크릿 클래스 (shown to visitors as well);
 * 'login' = the login screen (writing, or a members-only board).
 */
export function guestScreen(view) {
    if (!view || view.write) return 'login';
    if (view.board === SECRET_BOARD && !view.post) return 'secret';
    return view.board === ALL_BOARD || isGuestBoard(view.board) ? 'read' : 'login';
}

/** Board link for a guest: an open board opens, a members-only board goes to the login and comes back to it. */
export function guestBoardHref(id) {
    const path = communityPath({ board: id });
    return id === ALL_BOARD || id === SECRET_BOARD || isGuestBoard(id) ? path : loginPath(path);
}

/** A server answer that means "members only" (an old server, or a members-only post). */
export const isLoginReply = (code) => code === 'LOGIN_REQUIRED' || code === 'SESSION_INVALID' || code === 'NO_SESSION';
