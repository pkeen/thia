import { User, UserPublic } from "../../entities/user";
import { Keycard } from "../../entities/keycards";
import { ValidationError } from "entities/error";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type AuthState<A = {}> = { user: UserPublic & A; keyCards: Keycard[] };

export interface SessionStrategyPort<A = {}> {
	name: string;
	createKeyCards(user: User): Promise<Keycard[]>;
	logout(keyCards: Keycard[]): Promise<Result<AuthState<A>, ValidationError>>;
	validate(
		keyCards: Keycard[]
	): Promise<Result<AuthState<A>, ValidationError>>;
	// validateCard(keyCards: KeyCards, name: string): Promise<AuthResult>;
	// validateAll(keyCards: KeyCards): Promise<AuthValidationResult>;
	// validateRefresh?(keyCards: KeyCards): Promise<AuthValidationResult>;
	supportsRefresh(): boolean;
	// signup(credentials: Credentials): Promise<KeyCards>;
	// revoke(token: string): Promise<void>; could support revoking
}
