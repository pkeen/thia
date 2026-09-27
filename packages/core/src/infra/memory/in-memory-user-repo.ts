// infra/memory/in-memory-user-repo.ts
import { UserRepository } from "../../application/ports/user-repo.port";
import { User, UserSnapshot } from "../../domain/entities/user";
import { UserId } from "../../domain/primitives";
import { EmailAddress } from "../../domain/value-objects/email-address";

/**
 * Keeps snapshots, not live entities, so it behaves like a database: each
 * read returns an independent copy, a stale copy can be saved over a newer
 * one, and - as the port requires - saving never overwrites the stored
 * token version of an existing user.
 */
export class InMemoryUserRepo implements UserRepository {
	public name = "InMemoryUserRepo";
	private byId = new Map<string, UserSnapshot>();
	private byEmail = new Map<string, string>();
	private byProviderAccount = new Map<string, string>();

	private load(id: string | undefined): User | null {
		const snapshot = id === undefined ? undefined : this.byId.get(id);
		return snapshot ? User.rehydrate(structuredClone(snapshot)) : null;
	}

	async getById(id: UserId) {
		return this.load(id.valueOf());
	}
	async getByEmail(email: EmailAddress) {
		return this.load(this.byEmail.get(email.value));
	}
	async getByProviderAccount(params: {
		provider: string;
		providerAccountId: string;
	}) {
		return this.load(
			this.byProviderAccount.get(
				`${params.provider}:${params.providerAccountId}`
			)
		);
	}
	async save(user: User) {
		const snapshot = user.toSnapshot();
		const existing = this.byId.get(user.id);
		if (existing) snapshot.tokenVersion = existing.tokenVersion;
		this.byId.set(user.id, snapshot);
		this.byEmail.set(user.email.value, user.id);
		for (const account of user.accounts) {
			this.byProviderAccount.set(
				`${account.provider}:${account.providerAccountId}`,
				user.id
			);
		}
	}
	async incrementTokenVersion(id: UserId) {
		const existing = this.byId.get(id.valueOf());
		if (!existing) return null;
		existing.tokenVersion += 1;
		return existing.tokenVersion;
	}
}
