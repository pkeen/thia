import type { User } from "../../domain/entities/user";
import type { EmailAddress } from "../../domain/value-objects/email-address";
import type { UserId } from "../../domain/primitives/index";

export interface UserRepository {
	name: string; // identifier for debugging/metrics (fine)
	getById(id: UserId): Promise<User | null>;
	getByEmail(email: EmailAddress): Promise<User | null>;
	save(user: User): Promise<void>;

	// Needed for OAuth / social login:
	getByProviderAccount(params: {
		provider: string;
		providerAccountId: string;
	}): Promise<User | null>;
}
