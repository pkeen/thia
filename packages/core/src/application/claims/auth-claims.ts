// application/identity/claims/AuthClaims.ts
export type AuthClaims = {
	iss: string;
	aud: string;
	sub: string;
	iat: number;
	exp: number;
	jti: string;
	ver: number; // schema version of claims
	uvn: number; // user version (tokenVersion)
	pvn: number; // policy version
	usr: {
		id: string;
		emailVerified: boolean;
		roles: string[];
		orgId?: string;
		scopes?: string[];
	};
};
