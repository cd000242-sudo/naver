import type { ProtectedLinkPayload } from './protectedLink.mjs';

export interface PublicTile {
    title: string;
    desc: string;
    url: string;
    cta: string;
    badge: string;
}

export interface ProtectedTileText {
    title: string;
    desc: string;
}

export declare function isHttpsUrl(value: unknown): boolean;
export declare function isSealedPayload(payload: unknown): payload is ProtectedLinkPayload;
export declare function resolvePublicTile(defaults: PublicTile, override: unknown): PublicTile;
export declare function resolveProtectedTile(
    defaults: ProtectedTileText,
    override: unknown,
    bundledPayload: ProtectedLinkPayload,
): ProtectedTileText & { payload: ProtectedLinkPayload };
