import type { OAuthCredentials } from "./types";
export interface CursorAuthParams {
    verifier: string;
    challenge: string;
    uuid: string;
    loginUrl: string;
}
export declare function generateCursorAuthParams(): Promise<CursorAuthParams>;
export declare function pollCursorAuth(uuid: string, verifier: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function loginCursor(onAuthUrl: (url: string) => void, onPollStart?: () => void): Promise<OAuthCredentials>;
export declare function refreshCursorToken(apiKeyOrRefreshToken: string): Promise<OAuthCredentials>;
export declare function isTokenExpiringSoon(token: string, thresholdSeconds?: number): boolean;
//# sourceMappingURL=cursor.d.ts.map