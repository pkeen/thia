// infra/registry/simple-provider-registry.ts
import {
	OAuthProviderPort,
	ProviderRegistryPort,
} from "application/ports/index";

export class SimpleProviderRegistry implements ProviderRegistryPort {
	private providers: Record<string, OAuthProviderPort>;

	constructor(providers: Record<string, OAuthProviderPort>) {
		this.providers = providers;
	}

	get(providerId: string): OAuthProviderPort | undefined {
		return this.providers[providerId];
	}

	list(): OAuthProviderPort[] {
		return Object.values(this.providers);
	}
}
