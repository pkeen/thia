// application/identity/claims/AuthClaims.ts
export type AuthClaims = {
	iss: string;
	aud: string;
	sub: string;
	iat: number;
	exp: number;
	jti?: string;
	ver: number; // schema version of claims
	uvn: number; // user version (tokenVersion)
	pvn: number; // policy version
	usr: {
		id: string;
		emailVerified: boolean;
		roles?: string[];
		orgId?: string;
		scopes?: string[];
	};
};

export function makeAuthClaims(args: {
	iss: string;
	aud: string;
	sub: string;
	roles?: string[];
	emailVerified: boolean;
	uvn: number;
	pvn: number;
	now: Date;
	ttlSec: number;
	jti?: string;
}): AuthClaims {
	const iat = Math.floor(args.now.getTime() / 1000);
	return {
		iss: args.iss,
		aud: args.aud,
		sub: args.sub,
		iat,
		exp: iat + args.ttlSec,
		jti: args.jti,
		ver: 1,
		uvn: args.uvn,
		pvn: args.pvn,
		usr: {
			id: args.sub,
			emailVerified: args.emailVerified,
			roles: args.roles,
		},
	};
}
