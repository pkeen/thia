// email-address.ts
export class EmailAddress {
	private constructor(private readonly _value: string) {}

	static create(raw: string): EmailAddress {
		const v = raw.trim().toLowerCase();
		// simple validation; swap for a robust one if needed
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
			throw new Error("Invalid email address");
		}
		return new EmailAddress(v);
	}

	get value(): string {
		return this._value;
	}

	equals(other: EmailAddress): boolean {
		return this._value === other._value;
	}

	toString() {
		return this._value;
	}
}
