/**
 * Grant or revoke a role, by email.
 *
 *   pnpm assign-role pete@example.com admin
 *   pnpm assign-role pete@example.com admin --revoke
 *   pnpm assign-role pete@example.com          # show current roles
 *
 * Roles must be one of those defined in authz.ts - a typo would otherwise sit
 * in the database granting nothing, since unknown roles are ignored at check
 * time.
 */
import { EmailAddress } from "@thia/core";
import { PostgresRoleStore, PostgresUserRepository } from "@thia/adapters-drizzle";
import db from "../db";
import { rbac } from "../authz";

async function main() {
	const [email, role, ...flags] = process.argv.slice(2);
	const revoke = flags.includes("--revoke");

	if (!email) {
		console.error(
			"usage: pnpm assign-role <email> [role] [--revoke]\n" +
				`roles: ${rbac.roles().join(", ")}`
		);
		process.exit(1);
	}

	const users = PostgresUserRepository(db);
	const roles = PostgresRoleStore(db);

	const user = await users.getByEmail(EmailAddress.create(email));
	if (!user) {
		console.error(`No user with email ${email}. They must sign in once first.`);
		process.exit(1);
	}

	if (!role) {
		const current = await roles.getRoles(user.id);
		console.log(
			`${email}: ${current.length ? current.join(", ") : "(none assigned)"}`
		);
		return;
	}

	if (!rbac.roles().includes(role)) {
		console.error(
			`Unknown role "${role}". Defined roles: ${rbac.roles().join(", ")}`
		);
		process.exit(1);
	}

	if (revoke) {
		await roles.revoke(user.id, role);
		console.log(`Revoked ${role} from ${email}`);
	} else {
		await roles.assign(user.id, role);
		console.log(`Assigned ${role} to ${email}`);
	}

	console.log(`${email} now has: ${(await roles.getRoles(user.id)).join(", ") || "(none)"}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
