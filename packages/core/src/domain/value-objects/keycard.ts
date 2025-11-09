
export const KEYCARD_TYPE = ["access", "refresh", "session"] as const;
export type KeycardType = (typeof KEYCARD_TYPE)[number];

export class Keycard {
	private constructor(
		public readonly type: KeycardType,
		public readonly value: string, // opaque secret
		public readonly expiresAt?: Date
	) {}

	static create(input: {
		type: KeycardType;
		value: string;
		expiresAt?: Date;
	}): Keycard {
		if (!input.value) throw new Error("Keycard value required");
		if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
			throw new Error("Invalid expiresAt");
		}
		return new Keycard(input.type, input.value, input.expiresAt);
	}

	isExpired(at: Date = new Date()): boolean {
		return !!this.expiresAt && this.expiresAt.getTime() <= at.getTime();
	}

	equals(other: Keycard): boolean {
		return (
			this.type === other.type &&
			this.value === other.value &&
			(this.expiresAt?.getTime() ?? 0) ===
				(other.expiresAt?.getTime() ?? 0)
		);
	}
}

// export const keyCard = z.object({
// 	name: z.string(),
// 	value: z.string(),
// 	expiresAt: z.date().optional(), // I really dont think this is needed either
// 	type: keyCardType.optional(), // TODO: is name or this needed, i imagine only one?
// });
// export type KeyCard = z.infer<typeof keyCard>;

// export interface KeyCard {
//     name: string;
//     value: string;
//     expiresAt?: Date;
//     type?: "access" | "refresh" | "session";
//     // storageOptions?: CookieOptions; // this i dont think is neccessary
// }
