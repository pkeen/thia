import { AuthClaims } from "../claims/auth-claims";

export interface TokenSigner {
	sign(claims: AuthClaims): Promise<string>;
}

/**
 * Verifies a token and returns its claims. Implementations throw
 * InvalidSessionTokenError when the token is not acceptable; any other error
 * means verification itself could not be carried out (e.g. an unreachable
 * key source) and is treated as unavailable infrastructure, not a bad token.
 */
export interface TokenVerifier {
	verify(token: string): Promise<AuthClaims>;
}
