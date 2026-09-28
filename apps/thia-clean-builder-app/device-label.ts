/**
 * A coarse "Browser on OS" label for the devices page, from the User-Agent.
 * Display only: it is client-supplied, so never used for security decisions.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
	const ua = userAgent ?? "";
	const browser =
		/Edg\//.test(ua) ? "Edge"
		: /OPR\/|Opera/.test(ua) ? "Opera"
		: /Firefox\//.test(ua) ? "Firefox"
		: /Chrome\/|CriOS\//.test(ua) ? "Chrome"
		: /Safari\//.test(ua) ? "Safari"
		: undefined;
	const os =
		/iPhone|iPad|iPod/.test(ua) ? "iOS"
		: /Android/.test(ua) ? "Android"
		: /CrOS/.test(ua) ? "ChromeOS"
		: /Mac OS X|Macintosh/.test(ua) ? "macOS"
		: /Windows/.test(ua) ? "Windows"
		: /Linux/.test(ua) ? "Linux"
		: undefined;
	if (browser && os) return `${browser} on ${os}`;
	return browser ?? os ?? "Unknown device";
}
