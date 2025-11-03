import { Keycard, UserPublic } from "domain/entities";

// --- Input/Output DTOs ---
export type RegisterUserInput = {
	email: string;
	password: string; // for credentials flow; omit if you do OAuth-only variant
	name?: string;
	image?: string;
	verifyUrlFactory?: (token: string) => string; // how to build the link (keeps HTTP out)
};

export type RegisterUserOutput<E = {}> = {
	user: UserPublic & E;
	keycards: Keycard[];
};
