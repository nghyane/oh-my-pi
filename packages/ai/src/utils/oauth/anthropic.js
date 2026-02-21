/**
 * Anthropic OAuth flow (Claude Pro/Max)
 */
import { OAuthCallbackFlow } from "./callback-server";
import { generatePKCE } from "./pkce";
const decode = (s) => atob(s);
const CLIENT_ID = decode("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_PORT = 54545;
const CALLBACK_PATH = "/callback";
const SCOPES = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers";
class AnthropicOAuthFlow extends OAuthCallbackFlow {
    #verifier = "";
    #challenge = "";
    constructor(ctrl) {
        super(ctrl, CALLBACK_PORT, CALLBACK_PATH);
    }
    async generateAuthUrl(state, redirectUri) {
        const pkce = await generatePKCE();
        this.#verifier = pkce.verifier;
        this.#challenge = pkce.challenge;
        const authParams = new URLSearchParams({
            code: "true",
            client_id: CLIENT_ID,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: SCOPES,
            code_challenge: this.#challenge,
            code_challenge_method: "S256",
            state,
        });
        const url = `${AUTHORIZE_URL}?${authParams.toString()}`;
        return { url };
    }
    async exchangeToken(code, state, redirectUri) {
        const tokenResponse = await fetch(TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: CLIENT_ID,
                code,
                state,
                redirect_uri: redirectUri,
                code_verifier: this.#verifier,
            }),
        });
        if (!tokenResponse.ok) {
            let error;
            try {
                error = await tokenResponse.text();
            }
            catch {
                error = `HTTP ${tokenResponse.status}`;
            }
            throw new Error(`Token exchange failed: ${error}`);
        }
        const tokenData = (await tokenResponse.json());
        return {
            refresh: tokenData.refresh_token,
            access: tokenData.access_token,
            expires: Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
        };
    }
}
/**
 * Login with Anthropic OAuth
 */
export async function loginAnthropic(ctrl) {
    const flow = new AnthropicOAuthFlow(ctrl);
    return flow.login();
}
/**
 * Refresh Anthropic OAuth token
 */
export async function refreshAnthropicToken(refreshToken) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: CLIENT_ID,
            refresh_token: refreshToken,
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic token refresh failed: ${error}`);
    }
    const data = (await response.json());
    return {
        refresh: data.refresh_token || refreshToken,
        access: data.access_token,
        expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
    };
}
//# sourceMappingURL=anthropic.js.map