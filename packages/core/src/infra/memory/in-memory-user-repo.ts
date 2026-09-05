// infra/memory/in-memory-user-repo.ts
import { UserRepository } from "application/ports/user-repo.port";
import { User } from "domain/entities/user";
import { UserId } from "domain/primitives";
import { EmailAddress } from "domain/value-objects/email-address";

export class InMemoryUserRepo implements UserRepository {
	public name = "InMemoryUserRepo";
	private byId = new Map<string, User>();
	private byEmail = new Map<string, string>();
	private byProviderAccount = new Map<string, string>();

	async getById(id: UserId) {
		return this.byId.get(id.valueOf()) ?? null;
	}
	async getByEmail(email: EmailAddress) {
		const id = this.byEmail.get(email.value);
		return id ? this.byId.get(id)! : null;
	}
	async getByProviderAccount(params: {
		provider: string;
		providerAccountId: string;
	}) {
		const id = this.byProviderAccount.get(
			`${params.provider}:${params.providerAccountId}`
		);
		return id ? (this.byId.get(id) ?? null) : null;
	}
	async save(user: User) {
		this.byId.set(user.id, user);
		this.byEmail.set(user.email.value, user.id);
		for (const account of user.accounts) {
			this.byProviderAccount.set(
				`${account.provider}:${account.providerAccountId}`,
				user.id
			);
		}
	}
}
