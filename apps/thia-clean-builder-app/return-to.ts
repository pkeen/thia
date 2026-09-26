/**
 * A post-login destination, only if it is a path on this site: starts with a
 * single "/", and still resolves to the same origin after the URL parser has
 * normalised it (catching "//evil", "/\evil", encoded tricks and control
 * characters). Anything else yields undefined, i.e. the default page.
 */
export function safeReturnTo(value: string | null | undefined): string | undefined {
	if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
		return undefined;
	}
	if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
		return undefined;
	}
	if (/[\u0000-\u001f\u007f\\]/.test(value)) return undefined;

	const base = "http://return-to.invalid";
	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		return undefined;
	}
	if (url.origin !== base) return undefined;
	return url.pathname + url.search + url.hash;
}
