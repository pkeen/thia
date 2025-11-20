import { AuthStrategyPort } from "../../ports/auth-strategy";
import { IdentityProviderPort } from "../../ports/identity-provider";
import { LoggerPort } from "../../ports/logger";
import { UserRepoPort } from "../../ports/user-repo/user-repo";
import { Keycard, User, UserPublic } from "../../entities";
import { AppError } from "../../entities/error";
import { Result } from "../entities/utilities";

// Use-case (application layer)
export type LoginOutput<E = {}> = {
	user: UserPublic & E;
	keycards: Keycard[];
};

const sanitizeUser = (user: User): UserPublic => ({
	id: user.id,
	name: user.name,
	email: user.email,
	image: user.image,
});

// application/errors.ts
export type LoginErrorCode =
	| "PROVIDER_ERROR" // mapped from IdentityProviderError
	| "USER_NOT_FOUND"
	| "ACCOUNT_LINK_CONFLICT"
	| "SESSION_ISSUE"
	| "UNKNOWN";

export type LoginError = AppError<LoginErrorCode>;

export async function completeOAuth<E = {}>(input: {
	provider: string; // TODO String for now - enum or union later
	code: string;
	enrichUser: (u: UserPublic) => Promise<E> | E;
	ports: {
		signInSystem: IdentityProviderPort;
		userRegistry: UserRepoPort;
		authStrategy: AuthStrategyPort;
		logger: LoggerPort;
		callbacks?: { onUserCreated?: (u: User) => void | Promise<void> };
	};
}): Promise<Result<LoginOutput<E>, LoginError>> {
	const { signInSystem, userRegistry, authStrategy, logger, callbacks } =
		input.ports;

	const r = await signInSystem.completeOAuth(input.provider, input.code);
	if (r.ok == false) {
		input.ports.logger.error("Sign in failed", { error: r.error });
		return { ok: false, error: r.error || "PROVIDER_ERROR" };
	}
	// NOTE: no "redirect" case here — that’s handled by startLogin()

	const { profile, account: adapterAccount } = r.value;
	let user = await userRegistry.getUserByEmail(profile.email);

	if (!user) {
		user = await userRegistry.createUser(profile);
		await userRegistry.createAccountForUser(user, adapterAccount);
		await callbacks?.onUserCreated?.(user);
	} else {
		const account = await userRegistry.getAccount(
			adapterAccount.provider,
			adapterAccount.providerAccountId
		);
		if (account) await userRegistry.updateAccount(adapterAccount);
		else await userRegistry.createAccountForUser(user, adapterAccount);
	}

	const publicUser = sanitizeUser(user);
	const extra = await input.enrichUser(publicUser);
	const keycards = await authStrategy.createKeyCards({
		...publicUser,
		...extra,
	});

	return { ok: true, value: { user: { ...publicUser, ...extra }, keycards } };
}
