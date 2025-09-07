import { Keycard } from "entities";
import { AuthResult, AuthState } from "../presentation/auth-response";
import { AuthNCallbacks } from "application/ports/callbacks";
import { IdentityProviderPort } from "application/ports/identity-provider";
import { UserRepo } from "application/ports/user-repo/user-repo";
import { ValidationStrategyPort } from "application/ports/validation-strategy";
// import { DisplayProvider } from "application/presentation/provider-meta";

// --- Auth Manager Interface ---
export interface IAuthManager<Extra = {}> {
	login: (params: any) => Promise<AuthResult<Extra>>; // TODO change any for now
	validate: (keyCards: Keycard[]) => Promise<AuthResult<Extra>>;
	signOut: (
		keyCards: Keycard[] | null | undefined
	) => Promise<AuthState<Extra>>;
	// listProviders: () => DisplayProvider[];
	callbacks: AuthNCallbacks<Extra>; // ✅ expose it here
}

export interface AuthDeps<Extra = {}> {
	idManager: IdentityProviderPort;
	userRepo: UserRepo;
	validationStrategy: ValidationStrategyPort;
	callbacks?: AuthNCallbacks<Extra>;
}

export const createAuthManager = () => {};
