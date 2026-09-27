/**
 * CSRF check for state-changing POSTs. The session cookie is SameSite=Lax,
 * which already keeps it off cross-site POSTs in current browsers; this is
 * the explicit second layer, independent of cookie behaviour.
 *
 * Browsers send `Origin` on every POST and a page can't forge it, so it must
 * equal this request's own origin. Without `Origin` (some privacy tools strip
 * it) the request is accepted only if the browser marks it
 * `Sec-Fetch-Site: same-origin`. Anything else - another site, `Origin: null`,
 * a tool sending neither header - is refused.
 *
 * Behind a proxy that rewrites the Host header, request.url may not match
 * the public origin; this then fails closed (403) until forwarding is fixed.
 */
export function isSameOriginRequest(request: Request): boolean {
	const expected = new URL(request.url).origin;
	const origin = request.headers.get("origin");
	if (origin !== null) return origin === expected;
	return request.headers.get("sec-fetch-site") === "same-origin";
}
