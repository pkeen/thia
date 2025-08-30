import { z } from "zod";
import { User } from "../../entities/user";
import { Keycard } from "../../entities/keycards";

export const authState = z.object({});

// Basic return type for Authentication functions
export type AuthState<E = {}> =
	| { authenticated: true; user: User & E; keyCards: Keycard[] }
	| { authenticated: false; user: null; keyCards: null; error?: AuthError };
