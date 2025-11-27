// core/usecases/issue-access-token.ts
import { TokenSigner } from "../ports/token-signer.port";
import { Clock } from "application/ports/clock.port";
import { IdGenerator } from "application/ports/id-generator.port";
import { User } from "domain/entities/user";
import { Keycard } from "../../domain/value-objects/keycard";
import { makeAuthClaims } from "../claims/auth-claims";

export async function issueAccessToken(
	deps: {
		signer: TokenSigner;
		clock: Clock;
		ids: IdGenerator;
		policyVersion: number;
		issuer: string;
		audience: string;
		ttlSec: number;
	},
	user: User
) {
	const claims = makeAuthClaims({
		iss: deps.issuer,
		aud: deps.audience,
		sub: user.id,
		// roles: user.roles(),
		emailVerified: !!user.emailVerified,
		uvn: user.tokenVersion(),
		pvn: deps.policyVersion,
		now: deps.clock.now(),
		ttlSec: deps.ttlSec,
		jti: deps.ids.jti(),
	});
	const jwt = await deps.signer.sign(claims);
	return Keycard.create({
		type: "access",
		value: jwt,
		expiresAt: new Date(claims.exp * 1000),
	});
}
