import { AuthClaims } from "../claims/auth-claims";

export interface TokenSigner {
	sign(claims: AuthClaims): Promise<string>;
}
export interface TokenVerifier {
	verify(token: string): Promise<AuthClaims>;
}
