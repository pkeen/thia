import { OAuthProviderPort } from "./oauth-provider-port";

// application/ports/provider-registry.port.ts
export interface ProviderRegistryPort {
	get(providerId: string): OAuthProviderPort | undefined;
	list(): OAuthProviderPort[];
}
