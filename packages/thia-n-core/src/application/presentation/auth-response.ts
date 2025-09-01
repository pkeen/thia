import { z } from "zod";
import { User } from "../../entities/user";
import { Keycard } from "../../entities/keycards";
import { AuthError } from "core/error";

export const authState = z.object({});

// Basic return type for Authentication functions
export type AuthState<E = {}> =
	| { authenticated: true; user: User & E; keyCards: Keycard[] }
	| { authenticated: false; user: null; keyCards: null; error?: AuthError };

export type RedirectResult = {
	type: "redirect";
	url: string;
	state?: string;
};

export type SuccessResult<E = {}> = {
	type: "success";
	authState: AuthState<E>;
};

export type ErrorResult = {
	type: "error";
	error: AuthError;
};

export type RefreshResult<E = {}> = {
	type: "refresh";
	authState: AuthState<E>;
};

export type AuthResult<E = {}> =
	| SuccessResult<E>
	| ErrorResult
	| RedirectResult
	| RefreshResult<E>;
