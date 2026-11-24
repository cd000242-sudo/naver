export declare const GUEST_BOARDS: readonly string[];
export declare function isGuestBoard(id: string): boolean;
export declare function guestScreen(view: { board: string; write?: boolean; post?: string } | null | undefined): 'read' | 'login';
export declare function guestBoardHref(id: string): string;
export declare function isLoginReply(code: string | undefined | null): boolean;
