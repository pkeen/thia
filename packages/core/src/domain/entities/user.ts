// export type UserCreate = Omit<
// 	UserSnapshot,
// 	"emailVerified" | "createdAt" | "id"
// >;

export type UserPublic = Omit<UserSnapshot, "emailVerified" | "createdAt">;

// --- Imports from your domain (adjust paths as needed) ---
import { Provider, ProviderAccountId, UserId } from "../primitives"; // type Brand<string,"UserId">
import { EmailAddress } from "../value-objects/email-address";
import { PersonName } from "../value-objects/person-name";
import { ImageUrl } from "../value-objects/image-url";
import { AccountType, LinkedAccount } from "../value-objects/linked-account";
import { Keycard } from "../value-objects/keycard";

// --- Minimal domain events used by this entity ---
export type DomainEvent =
	| { type: "UserEmailVerified"; userId: UserId; at: Date }
	| { type: "UserProfileUpdated"; userId: UserId }
	| { type: "AccountLinked"; userId: UserId; provider: string }
	| {
			type: "AccountUnlinked";
			userId: UserId;
			provider: string;
			providerAccountId: string;
	  }
	| { type: "KeycardIssued"; userId: UserId; keycardType: Keycard["type"] };
// | { type: "KeycardsRevoked"; userId: UserId; count: number }
// | { type: "ExpiredKeycardsPurged"; userId: UserId; count: number };

// --- Snapshot used for persistence/rehydration (DTO-ish) ---
export type UserSnapshot = {
	id: string;
	email: string;
	emailVerified: string | null;
	name?: string;
	image?: string;
	createdAt: string;

	// Optional embedded state (keep if you store these alongside user)
	// Im not sure this is needed currently
	accounts?: Array<{
		type: AccountType;
		provider: Provider;
		providerAccountId: ProviderAccountId;
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		scope?: string;
		tokenType?: string;
		idToken?: string;
		sessionState?: string;
	}>;
	keycards?: Array<{
		type: Keycard["type"];
		value: string;
		expiresAt?: string;
	}>;
};

// --- The User Entity / Aggregate Root ---
export class User {
	private _email: EmailAddress;
	private _emailVerified: Date | null;
	private _name: PersonName;
	private _image: ImageUrl;
	private _createdAt: Date;

	private _accounts: ReadonlyArray<LinkedAccount> = Object.freeze([]);
	private _keycards: ReadonlyArray<Keycard> = Object.freeze([]);

	private constructor(
		public readonly id: UserId,
		email: EmailAddress,
		emailVerified: Date | null,
		name: PersonName,
		image: ImageUrl,
		createdAt: Date
	) {
		this._email = email;
		this._emailVerified = emailVerified;
		// this._name = name; // ✅ already a VO, assign as-is
		this._name = name ?? PersonName.from(); // ✅ guarantee it’s set
		this._image = image; // ✅ already a VO, assign as-is
		this._createdAt = createdAt;
	}

	/** Domain factory */
	static create(params: {
		id: UserId;
		email: EmailAddress;
		name?: string; // accept raw primitives here
		image?: string;
		now?: Date;
	}): User {
		return new User(
			params.id,
			params.email,
			null,
			PersonName.from(params.name), // ✅ build VO here
			ImageUrl.from(params.image), // ✅ build VO here
			params.now ?? new Date()
		);
	}
	// ---------- FACTORIES ----------

	// /** Create a brand-new user (domain factory), with sensible defaults. */
	// static create(params: {
	// 	id: UserId;
	// 	email: EmailAddress;
	// 	name?: PersonName;
	// 	image?: ImageUrl;
	// 	now?: Date;
	// }): User {
	// 	const u = new User(
	// 		params.id,
	// 		params.email,
	// 		null,
	// 		params.name ?? PersonName.from(undefined),
	// 		params.image ?? ImageUrl.from(undefined),
	// 		params.now ?? new Date()
	// 	);
	// 	return u;
	// }

	/** Rehydrate entity from a persistence snapshot. */
	static rehydrate(s: UserSnapshot): User {
		const u = new User(
			s.id as UserId,
			EmailAddress.create(s.email),
			s.emailVerified ? new Date(s.emailVerified) : null,
			PersonName.from(s.name),
			ImageUrl.from(s.image),
			new Date(s.createdAt)
		);

		if (s.accounts?.length) {
			u._accounts = Object.freeze(
				s.accounts.map((a) =>
					LinkedAccount.link({
						type: a.type,
						provider: a.provider,
						providerAccountId: a.providerAccountId,
						accessToken: a.accessToken,
						refreshToken: a.refreshToken,
						expiresAt: a.expiresAt,
						scope: a.scope,
						tokenType: a.tokenType,
						idToken: a.idToken,
						sessionState: a.sessionState,
					})
				)
			);
		}

		if (s.keycards?.length) {
			u._keycards = Object.freeze(
				s.keycards.map((k) =>
					Keycard.create({
						type: k.type,
						value: k.value,
						expiresAt: k.expiresAt
							? new Date(k.expiresAt)
							: undefined,
					})
				)
			);
		}

		return u;
	}

	/** Take a snapshot (for persistence). */
	toSnapshot(): UserSnapshot {
		return {
			id: this.id,
			email: this._email.value,
			emailVerified: this._emailVerified
				? this._emailVerified.toISOString()
				: null,
			name: this._name.value,
			image: this._image.value,
			createdAt: this._createdAt.toISOString(),
			accounts: this._accounts.map((a) => ({
				type: a.type,
				provider: a.provider,
				providerAccountId: a.providerAccountId,
				accessToken: a.accessToken,
				refreshToken: a.refreshToken,
				expiresAt: a.expiresAt,
				scope: a.scope,
				tokenType: a.tokenType,
				idToken: a.idToken,
				sessionState: a.sessionState,
			})),
			keycards: this._keycards.map((k) => ({
				type: k.type,
				value: k.value,
				expiresAt: k.expiresAt?.toISOString(),
			})),
		};
	}

	// ---------- QUERIES (getters) ----------

	get email(): EmailAddress {
		return this._email;
	}
	get emailVerified(): Date | null {
		return this._emailVerified;
	}
	get name(): PersonName {
		return this._name;
	}
	get image(): ImageUrl {
		return this._image;
	}
	get createdAt(): Date {
		return this._createdAt;
	}
	get accounts(): ReadonlyArray<LinkedAccount> {
		return this._accounts;
	}
	get keycards(): ReadonlyArray<Keycard> {
		return this._keycards;
	}

	// ---------- COMMANDS (business rules) ----------

	/** Mark email verified (idempotent). */
	verifyEmail(at: Date = new Date()): DomainEvent[] {
		if (this._emailVerified) return [];
		this._emailVerified = at;
		return [{ type: "UserEmailVerified", userId: this.id, at }];
	}

	/** Update profile fields with validation in VOs. */
	updateProfile(input: { name?: string; image?: string }): DomainEvent[] {
		let changed = false;
		if (input.name !== undefined) {
			const next = PersonName.from(input.name);
			if (!this._name.equals(next)) {
				this._name = next;
				// events.push(UserNameChanged(...));
			}
		}
		if (input.image !== undefined) {
			const next = ImageUrl.from(input.image);
			if (!this._image.equals(next)) {
				this._image = next;
				changed = true;
			}
		}
		return changed ? [{ type: "UserProfileUpdated", userId: this.id }] : [];
	}

	/**
	 * Link a new account. Policy:
	 * - Idempotent if same provider + providerAccountId
	 * - (Example) Reject multiple accounts for the same provider
	 */
	linkAccount(newAcc: LinkedAccount): {
		changed: boolean;
		events: DomainEvent[];
	} {
		if (this._accounts.some((a) => a.equals(newAcc))) {
			return { changed: false, events: [] };
		}

		// Example invariant: one account per provider. Adjust to your policy.
		const alreadyProvider = this._accounts.some(
			(a) => a.provider === newAcc.provider
		);
		if (alreadyProvider) {
			throw new Error("User already has an account for this provider");
		}

		this._accounts = Object.freeze([...this._accounts, newAcc]);
		return {
			changed: true,
			events: [
				{
					type: "AccountLinked",
					userId: this.id,
					provider: newAcc.provider,
				},
			],
		};
	}

	/** Unlink by natural key. No-op if not present (or throw if you prefer). */
	unlinkAccount(provider: string, providerAccountId: string): DomainEvent[] {
		const before = this._accounts.length;
		this._accounts = Object.freeze(
			this._accounts.filter(
				(a) =>
					!(
						a.provider === provider &&
						a.providerAccountId === providerAccountId
					)
			)
		);
		if (this._accounts.length === before) return [];
		return [
			{
				type: "AccountUnlinked",
				userId: this.id,
				provider,
				providerAccountId,
			},
		];
	}

	/** Issue a keycard (token VO). */
	issueKeycard(card: Keycard): DomainEvent[] {
		this._keycards = Object.freeze([...this._keycards, card]);
		return [
			{ type: "KeycardIssued", userId: this.id, keycardType: card.type },
		];
	}

	// /** Revoke keycards that match a predicate. */
	// revokeKeycards(match: (k: Keycard) => boolean): DomainEvent[] {
	// 	const before = this._keycards.length;
	// 	this._keycards = Object.freeze(this._keycards.filter((k) => !match(k)));
	// 	const removed = before - this._keycards.length;
	// 	return removed > 0
	// 		? [{ type: "KeycardsRevoked", userId: this.id, count: removed }]
	// 		: [];
	// }

	// /** Remove expired keycards (utility to run on login/refresh). */
	// purgeExpiredKeycards(at: Date = new Date()): DomainEvent[] {
	// 	const before = this._keycards.length;
	// 	this._keycards = Object.freeze(
	// 		this._keycards.filter((k) => !k.isExpired(at))
	// 	);
	// 	const removed = before - this._keycards.length;
	// 	return removed > 0
	// 		? [
	// 				{
	// 					type: "ExpiredKeycardsPurged",
	// 					userId: this.id,
	// 					count: removed,
	// 				},
	// 			]
	// 		: [];
	// }
}
