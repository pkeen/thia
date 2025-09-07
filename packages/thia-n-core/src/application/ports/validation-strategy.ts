import { User } from "../../entities/user";
import { Keycard } from "../../entities/keycards";

export interface ValidationStrategyPort {
	name: string;
	createKeyCards(user: User): Promise<Keycard[]>;
	logout(keyCards: Keycard[]): Promise<AuthState>;
	validate(keyCards: Keycard[]): Promise<AuthResult>;
	// validateCard(keyCards: KeyCards, name: string): Promise<AuthResult>;
	// validateAll(keyCards: KeyCards): Promise<AuthValidationResult>;
	// validateRefresh?(keyCards: KeyCards): Promise<AuthValidationResult>;
	supportsRefresh(): boolean;
	// signup(credentials: Credentials): Promise<KeyCards>;
	// revoke(token: string): Promise<void>; could support revoking
}
