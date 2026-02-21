import type { Api, Model, Provider, ProviderSessionState } from "./types";
export interface ProviderDetailField {
	label: string;
	value: string;
}
export interface ProviderDetails {
	provider: Provider;
	api: Api;
	fields: ProviderDetailField[];
}
export interface ProviderDetailsContext {
	model: Model<Api>;
	sessionId?: string;
	authMode?: string;
	preferWebsockets?: boolean;
	providerSessionState?: Map<string, ProviderSessionState>;
}
export declare function getProviderDetails(context: ProviderDetailsContext): ProviderDetails;
//# sourceMappingURL=provider-details.d.ts.map
