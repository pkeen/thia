import { createContext, useContext } from "react";
import { AuthState } from "@pete_keen/authentication-core";
import { RemixAuthState } from "..";

const AuthContext = createContext<RemixAuthState>({
	csrf: null,
	authState: {
		user: null,
		authenticated: false,
		keyCards: null,
	},
});

export function AuthProvider({
	children,
	csrf,
	authState,
}: {
	children: React.ReactNode;
	csrf: string | null;
	authState: AuthState;
}) {
	return (
		<AuthContext.Provider value={{ csrf, authState }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuthState() {
	return useContext(AuthContext);
}
