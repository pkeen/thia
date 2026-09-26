import { ProviderRegistryPort } from "../ports/provider-registry-port";
import { OAuthTransaction } from "../ports/oauth-transaction-port";
import { oauthTransactionMatches } from "../oauth/transaction";
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
	/** Provider named by the callback route. */
	provider: string;
	/** `code` and `state` exactly as returned on the callback (untrusted). */
	code: string;
	state: string;
	/**
	 * The transaction `beginOAuth` created for this browser, already unsealed
	 * by the caller; undefined when none was found.
	 */
	transaction: OAuthTransaction | undefined;
};

export type CompleteOAuthDeps<E = {}> = {
	registry: ProviderRegistryPort;
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
	/**
	 * What to do when a sign-in's email matches an existing user who hasn't
	 * linked this provider account yet.
	 *
	 * - `"verified-email"` (default): link only if the provider verified the
	 *   email *and* the existing user's email is verified. The first check stops
	 *   a provider that lets anyone claim any email from taking over an account;
	 *   the second stops an attacker who signed up first with an unverified
	 *   email from having the real owner linked into their account later.
	 * - `"never"`: never link automatically; new providers must be connected
	 *   explicitly by an already signed-in user.
	 *
	 * When linking is refused this throws `ACCOUNT_LINK_CONFLICT`. A second user
	 * can't be created instead, because emails are unique.
	 */
	accountLinking?: "verified-email" | "never";
};

export async function completeOAuth<E = {}>(
	deps: CompleteOAuthDeps<E>,
	input: CompleteOAuthInput
): Promise<LoginOutput<E>> {
	// Nothing reaches the provider unless this browser holds an unexpired
	// transaction for this provider whose state matches the callback's.
	const transaction = input.transaction;
	if (!oauthTransactionMatches(transaction, input, deps.clock.now())) {
		throw new Error("INVALID_STATE");
	}
	if (typeof input.code !== "string" || input.code.length === 0) {
		throw new Error("INVALID_STATE");
	}

	const provider = deps.registry.get(input.provider);
	if (!provider) throw new Error("PROVIDER_NOT_FOUND");

	// Redirect URI, verifier and nonce come from the trusted transaction,
	// never from the callback request.
	const { user: oauthUser } = await provider.complete({
		redirectUri: transaction.redirectUri,
		code: input.code,
		state: transaction.state,
		codeVerifier: transaction.codeVerifier,
		nonce: transaction.nonce,
	});

	const linkedAccount = LinkedAccount.link({
		type: "oauth",
		provider: oauthUser.provider,
		providerAccountId: oauthUser.providerAccountId,
	});

	// Only a real email the provider vouches for counts as verified - never
	// the synthesized placeholder used when the provider gives no email.
	const verifiedEmail =
		oauthUser.email && oauthUser.emailVerified === true
			? EmailAddress.create(oauthUser.email)
			: undefined;

	let user = await deps.uow.users.getByProviderAccount({
		provider: oauthUser.provider,
		providerAccountId: oauthUser.providerAccountId,
	});
	let isNewUser = false;

	if (user) {
		// Returning user: record verification if the provider confirms the
		// email on file (e.g. accounts created before this was tracked).
		if (verifiedEmail?.equals(user.email)) user.verifyEmail(deps.clock.now());
	} else {
		const email = resolveEmail(
			oauthUser.provider,
			oauthUser.providerAccountId,
			oauthUser.email
		);
		const existingByEmail = await deps.uow.users.getByEmail(email);

		if (existingByEmail) {
			const linking = deps.accountLinking ?? "verified-email";
			const bothVerified =
				verifiedEmail !== undefined &&
				existingByEmail.emailVerified !== null;
			if (linking === "never" || !bothVerified) {
				throw new Error("ACCOUNT_LINK_CONFLICT");
			}
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
			if (verifiedEmail) user.verifyEmail(deps.clock.now());
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
