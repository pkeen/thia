import { UnitOfWork } from "application/ports/uow.port";
import { PasswordHasher } from "../ports/password-hasher.port";
import { EmailAddress } from "../../domain/value-objects/email-address";

// core/usecases/login-with-password.ts
export async function loginWithPassword(
	deps: {
		uow: UnitOfWork;
		hasher: PasswordHasher;
	},
	cmd: { email: string; password: string }
) {
	const user = await deps.uow.users.getByEmail(
		EmailAddress.create(cmd.email)
	);
	if (!user) throw new Error("invalid_credentials");
	if (!(await deps.hasher.verify(cmd.password, user.passwordHash())))
		throw new Error("invalid_credentials");
	return user;
}
