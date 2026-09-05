import { ProviderRegistryPort } from "../ports/provider-registry-port";
import { AuthStateStore } from "../ports/state-store-port";

export type BeginOAuthInput = {
	provider: string;
	redirectUri: string;
	returnTo?: string;
};

export type BeginOAuthOutput = {
	authorizationUrl: string;
	state: string;
};

export async function beginOAuth(
	deps: {
		registry: ProviderRegistryPort;
		stateStore: AuthStateStore;
	},
	input: BeginOAuthInput
): Promise<BeginOAuthOutput> {
	const provider = deps.registry.get(input.provider);
	if (!provider) throw new Error("PROVIDER_NOT_FOUND");

	const state = await deps.stateStore.issue({
		providerId: input.provider,
		redirectUri: input.redirectUri,
		returnTo: input.returnTo,
	});

	const { authorizationUrl } = provider.begin({
		redirectUri: input.redirectUri,
		state,
	});

	return { authorizationUrl, state };
}
