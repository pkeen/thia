export type Rule<Context> = (context: Context) => boolean;

// A policy consists of multiple rules
export interface Policy<Context> {
	rules: Rule<Context>[];
	evaluate: (context: Context) => boolean;
}

export interface Permission {
	id: string;
	name: string;
	resource: string;
	action: "create" | "read" | "update" | "delete";
}

export interface User {
	id: number;
	roles: string[];
}

export interface Resource {
	ownerId: number;
	status: string;
}
