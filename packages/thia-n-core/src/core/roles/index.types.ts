// Role types - i want to maybe make this customizable
export type Role = "admin" | "user" | "guest";

// export enum RoleType {
// 	ADMIN = "admin",
// 	USER = "user",
// 	GUEST = "guest",
// }

export type RoleDefinition = {
	name: string;
	level: number;
	inherits?: string[];
	permissions?: string[];
};

export type RoleHierarchy = {
	[role: string]: RoleDefinition;
};



// Needs to be hierarchical
