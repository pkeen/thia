import { ProviderRegistryPort } from "../ports/provider-registry-port";
import { AuthStateStore } from "../ports/state-store-port";
import { UnitOfWork } from "../ports/uow.port";
import { IdGenerator } from "../ports/id-generator.port";
import { Clock } from "../ports/clock.port";
import { TokenSigner } from "../ports/token-signer.port";
import { Keycard, User, UserPublic } from "../../domain/entities";
import { LinkedAccount } from "../../domain/value-objects/linked-account";
import { EmailAddress } from "../../domain/value-objects/email-address";
import { asUserId } from "../../domain/primitives";
import { issueAccessToken } from "./issue-access-token";

export type LoginOutput<E = {}> = {
	user: UserPublic & E;
	keycards: Keycard[];
};

const sanitizeUser = (user: User): UserPublic => ({
	id: user.id,
	name: user.name.value,
	email: user.email.value,
	image: user.image.value,
});

/**
 * GitHub (and most OAuth providers) may not return a public email address.
 * The domain User requires one, so synthesize a stable, non-deliverable
 * placeholder scoped to the provider account rather than block login.
 */
const resolveEmail = (provider: string, providerAccountId: string, email?: string) =>
	EmailAddress.create(email ?? `${provider}-${providerAccountId}@users.noreply.thia.local`);

export type CompleteOAuthInput = {
	provider: string;
	code: string;
	state: string;
};

export type CompleteOAuthDeps<E = {}> = {
	registry: ProviderRegistryPort;
	stateStore: AuthStateStore;
	uow: UnitOfWork;
	ids: IdGenerator;
	clock: Clock;
	signer: TokenSigner;
	issuer: string;
	audience: string;
	ttlSec: number;
	policyVersion: number;
	enrichUser?: (u: UserPublic) => Promise<E> | E;
	callbacks?: { onUserCreated?: (u: User) => void | Promise<void> };
};

export async function completeOAuth<E = {}>(
	deps: CompleteOAuthDeps<E>,
	input: CompleteOAuthInput
): Promise<LoginOutput<E>> {
	const transient = await deps.stateStore.consume(input.state);
	if (!transient) throw new Error("INVALID_STATE");
	if (transient.providerId !== input.provider) throw new Error("INVALID_STATE");

	const provider = deps.registry.get(input.provider);
	if (!provider) throw new Error("PROVIDER_NOT_FOUND");

	const { user: oauthUser } = await provider.complete({
		redirectUri: transient.redirectUri,
		code: input.code,
		state: input.state,
		codeVerifier: transient.codeVerifier,
	});

	const linkedAccount = LinkedAccount.link({
		type: "oauth",
		provider: oauthUser.provider,
		providerAccountId: oauthUser.providerAccountId,
	});

	let user = await deps.uow.users.getByProviderAccount({
		provider: oauthUser.provider,
		providerAccountId: oauthUser.providerAccountId,
	});
	let isNewUser = false;

	if (!user) {
		const email = resolveEmail(
			oauthUser.provider,
			oauthUser.providerAccountId,
			oauthUser.email
		);
		const existingByEmail = await deps.uow.users.getByEmail(email);

		if (existingByEmail) {
			existingByEmail.linkAccount(linkedAccount);
			user = existingByEmail;
		} else {
			user = User.create({
				id: asUserId(deps.ids.userId()),
				email,
				name: oauthUser.name,
				image: oauthUser.image,
				now: deps.clock.now(),
			});
			user.linkAccount(linkedAccount);
			isNewUser = true;
		}
	}

	await deps.uow.users.save(user);
	await deps.uow.commit();

	if (isNewUser) await deps.callbacks?.onUserCreated?.(user);

	const keycard = await issueAccessToken(
		{
			signer: deps.signer,
			clock: deps.clock,
			ids: deps.ids,
			policyVersion: deps.policyVersion,
			issuer: deps.issuer,
			audience: deps.audience,
			ttlSec: deps.ttlSec,
		},
		user
	);

	const publicUser = sanitizeUser(user);
	const extra = deps.enrichUser ? await deps.enrichUser(publicUser) : ({} as E);

	return {
		user: { ...publicUser, ...extra },
		keycards: [keycard],
	};
}
