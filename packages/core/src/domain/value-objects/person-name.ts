// domain/value-objects/person-name.ts
export class PersonName {
	private constructor(private readonly _value?: string) {}

	/** Build from optional input (useful for patch/update flows). */
	static from(value?: string): PersonName {
		if (value == null) return new PersonName(undefined);

		// Normalize: trim and collapse internal whitespace to single spaces
		const normalized = value.trim().replace(/\s+/g, " ");
		if (normalized.length === 0) return new PersonName(undefined);

		// Simple guardrails (tune as you like)
		if (normalized.length > 200) {
			throw new Error("PersonName: too long (max 200 chars)");
		}

		// Optional: prevent control chars
		if (/[^\P{C}\t\n\r]/u.test(normalized)) {
			throw new Error("PersonName: contains invalid control characters");
		}

		return new PersonName(normalized);
	}

	/** Build when a name is required (e.g., during onboarding). */
	static create(required: string): PersonName {
		const n = PersonName.from(required);
		if (!n._value) throw new Error("PersonName: required");
		return n;
	}

	get value(): string | undefined {
		return this._value;
	}

	equals(other: PersonName): boolean {
		return this._value === other._value;
	}

	toString(): string {
		return this._value ?? "";
	}
}
