/**
 * OpenAI Codex (ChatGPT OAuth) flow
 */
import { OAuthCallbackFlow } from "./callback-server";
import { generatePKCE } from "./pkce";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = "/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
function decodeJwt(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return null;
        const payload = parts[1] ?? "";
        const decoded = Buffer.from(payload, "base64").toString("utf-8");
        return JSON.parse(decoded);
    }
    catch {
        return null;
    }
}
function getAccountId(accessToken) {
    const payload = decodeJwt(accessToken);
    const auth = payload?.[JWT_CLAIM_PATH];
    const accountId = auth?.chatgpt_account_id;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}
class OpenAICodexOAuthFlow extends OAuthCallbackFlow {
    pkce;
    originator;
    constructor(ctrl, pkce, originator) {
        super(ctrl, CALLBACK_PORT, CALLBACK_PATH);
        this.pkce = pkce;
        this.originator = originator;
    }
    async generateAuthUrl(state, redirectUri) {
        const searchParams = new URLSearchParams({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            scope: SCOPE,
            code_challenge: this.pkce.challenge,
            code_challenge_method: "S256",
            state,
            id_token_add_organizations: "true",
            codex_cli_simplified_flow: "true",
            originator: this.originator,
        });
        const url = `${AUTHORIZE_URL}?${searchParams.toString()}`;
        return { url, instructions: "A browser window should open. Complete login to finish." };
    }
    async exchangeToken(code, _state, redirectUri) {
        return exchangeCodeForToken(code, this.pkce.verifier, redirectUri);
    }
}
async function exchangeCodeForToken(code, verifier, redirectUri) {
    const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
        }),
    });
    if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }
    const tokenData = (await tokenResponse.json());
    if (!tokenData.access_token || !tokenData.refresh_token || typeof tokenData.expires_in !== "number") {
        throw new Error("Token response missing required fields");
    }
    const accountId = getAccountId(tokenData.access_token);
    if (!accountId) {
        throw new Error("Failed to extract accountId from token");
    }
    return {
        access: tokenData.access_token,
        refresh: tokenData.refresh_token,
        expires: Date.now() + tokenData.expires_in * 1000,
        accountId,
    };
}
export async function loginOpenAICodex(options) {
    const pkce = await generatePKCE();
    const originator = options.originator?.trim() || "opencode";
    const flow = new OpenAICodexOAuthFlow(options, pkce, originator);
    return flow.login();
}
/**
 * Refresh OpenAI Codex OAuth token
 */
export async function refreshOpenAICodexToken(refreshToken) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        }),
    });
    if (!response.ok) {
        let detail = `${response.status}`;
        try {
            const body = (await response.json());
            if (body.error)
                detail = `${response.status} ${body.error}${body.error_description ? `: ${body.error_description}` : ""}`;
        }
        catch { }
        throw new Error(`OpenAI Codex token refresh failed: ${detail}`);
    }
    const tokenData = (await response.json());
    if (!tokenData.access_token || !tokenData.refresh_token || typeof tokenData.expires_in !== "number") {
        throw new Error("Token response missing required fields");
    }
    const accountId = getAccountId(tokenData.access_token);
    return {
        access: tokenData.access_token,
        refresh: tokenData.refresh_token || refreshToken,
        expires: Date.now() + tokenData.expires_in * 1000,
        accountId: accountId ?? undefined,
    };
}
//# sourceMappingURL=openai-codex.js.map