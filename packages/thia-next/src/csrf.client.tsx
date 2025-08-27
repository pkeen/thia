// This can be called in the client to get token from cookies
import { useState, useEffect } from "react";
import { CSRF_COOKIE_NAME } from "./csrf";

export function getCsrfToken() {
	return document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${CSRF_COOKIE_NAME}="`))
		?.split("=")[1];
}

export function CsrfField({ csrfToken }: { csrfToken: string | null }) {
	return <input type="hidden" name="csrfToken" value={csrfToken || ""} />;
}

// export function useCsrfToken() {
// 	const [token, setToken] = useState<string | null>(null);

// 	useEffect(() => {
// 		const token = getCsrfToken();
// 		if (token) setToken(token);
// 	}, []);

// 	return token;
// }
