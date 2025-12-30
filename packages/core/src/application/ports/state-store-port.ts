// application/ports/state-store.port.ts
export type OAuthTransientState = {
	providerId: string;
	redirectUri: string;
	codeVerifier?: string; // PKCE
	nonce?: string; // OIDC
	returnTo?: string; // where to send user after login
	issuedAt: number; // epoch seconds
};

export interface AuthStateStore {
	/** Create a new random state id and persist the tuple. Return the state id to send to the provider. */
	issue(payload: Omit<OAuthTransientState, "issuedAt">): Promise<string>;

	/** Fetch & delete (one-time). Return undefined if missing/expired. */
	consume(
		state: string,
		now?: Date
	): Promise<OAuthTransientState | undefined>;
}
