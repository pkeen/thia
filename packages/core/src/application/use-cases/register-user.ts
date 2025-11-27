import { UnitOfWork } from "application/ports/uow.port";
import { Keycard, UserPublic } from "domain/entities";
import { IdGenerator } from "application/ports/id-generator.port";
import { Clock } from "application/ports/clock.port";
import { PasswordHasher } from "application/ports/password-hasher.port";
import { EmailAddress } from "../../domain/value-objects/email-address";
import { User } from "../../domain/entities/user";
import { asUserId } from "../../domain/primitives";

// --- Input/Output DTOs ---
export type RegisterUserInput = {
	email: string;
	password: string; // for credentials flow; omit if you do OAuth-only variant
	name?: string;
	image?: string;
	verifyUrlFactory?: (token: string) => string; // how to build the link (keeps HTTP out)
};

export type RegisterUserOutput<E = {}> = {
	user: UserPublic & E;
	keycards: Keycard[];
};

export async function registerUser(
	deps: {
		uow: UnitOfWork;
		ids: IdGenerator;
		clock: Clock;
		hasher: PasswordHasher;
	},
	cmd: { email: string; name?: string; password: string }
) {
	const existing = await deps.uow.users.getByEmail(
		EmailAddress.create(cmd.email)
	);
	if (existing) throw new Error("email_taken");

	const id = deps.ids.userId();
	const user = User.create({
		id: asUserId(id),
		email: EmailAddress.create(cmd.email),
		name: cmd.name,
		now: deps.clock.now(),
	});
	user.setPasswordHash(await deps.hasher.hash(cmd.password)); // however you model credentials
	await deps.uow.users.save(user);
	await deps.uow.commit();
	return user;
}
