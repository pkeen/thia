import { PasswordHasher } from "application/ports/password-hasher.port";

// infra/password/naive-hasher.ts (dev only)
export class NaiveHasher implements PasswordHasher {
	async hash(p: string) {
		return "hash:" + p;
	}
	async verify(p: string, h: string) {
		return h === "hash:" + p;
	}
}
