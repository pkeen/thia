export interface AuthzData {
	roles?: string[];
	permissions?: string[];
	[key: string]: any;
}

interface AuthenticatedUser {
	id: string;
	authz: AuthzData;
}

export interface Authz {
	name: string;
	seed: () => void;
	enrichToken?: (userId: string) => Promise<AuthzData>;
	createUserRole?: (userId: string, role?: string) => Promise<void>;
	updateUserRole?: (userId: string, role?: string) => Promise<void>;
}
