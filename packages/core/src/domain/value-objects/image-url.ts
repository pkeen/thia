// domain/value-objects/image-url.ts
export class ImageUrl {
	private constructor(private readonly _value?: string) {}

	/** Build from optional input (nice for partial profile updates). */
	static from(value?: string): ImageUrl {
		if (value == null) return new ImageUrl(undefined);

		const trimmed = value.trim();
		if (trimmed.length === 0) return new ImageUrl(undefined);

		// Validate and normalize
		let url: URL;
		try {
			url = new URL(trimmed);
		} catch {
			throw new Error("ImageUrl: invalid URL");
		}

		// Allow only safe schemes by default
		const allowed = new Set(["http:", "https:", "data:"]);
		if (!allowed.has(url.protocol)) {
			throw new Error(`ImageUrl: unsupported protocol "${url.protocol}"`);
		}

		// Optional: restrict data URLs to images only
		if (url.protocol === "data:") {
			const isImageData = /^data:image\/[a-z0-9.+-]+;base64,/i.test(
				trimmed
			);
			if (!isImageData)
				throw new Error("ImageUrl: only data:image/* supported");
			// Keep original trimmed for data URLs (URL() will mangle them)
			return new ImageUrl(trimmed);
		}

		// Normalize: lowercase protocol/host, keep path/query as-is
		url.protocol = url.protocol.toLowerCase();
		url.hostname = url.hostname.toLowerCase();

		return new ImageUrl(url.toString());
	}

	/** Build when an image URL is required. */
	static create(required: string): ImageUrl {
		const u = ImageUrl.from(required);
		if (!u._value) throw new Error("ImageUrl: required");
		return u;
	}

	get value(): string | undefined {
		return this._value;
	}

	equals(other: ImageUrl): boolean {
		return this._value === other._value;
	}

	toString(): string {
		return this._value ?? "";
	}
}
