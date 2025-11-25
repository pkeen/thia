import { AuthClaims } from "application/claims/auth-claims";
import { TokenSigner, TokenVerifier } from "application/ports/token-signer";

// infra/jwt/dev-signer.ts (don’t use in prod)
export class DevTokenSigner implements TokenSigner {
	async sign(c: AuthClaims) {
		return Buffer.from(JSON.stringify(c)).toString("base64");
	}
}
export class DevTokenVerifier implements TokenVerifier {
	async verify(t: string) {
		return JSON.parse(Buffer.from(t, "base64").toString());
	}
}
