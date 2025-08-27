import { Policy } from "./policy";

export interface User {
	id: string;
	[key: string]: any;
}

/**
 * The main attribute base, always has key and name
 */
export interface AttributeBase {
	key: string;
	name: string;
	// If you need "level", you can keep it optional
	// and modules that need it can require it
	// level?: number;
	// ...other optional fields
}

export interface AttributeData extends Record<string, any> {}

export interface Module<
	Policies extends Record<string, Policy<any>>,
	AttributeData = {}
> {
	name: Readonly<string>;
	policies: Policies;
	pluralName?: string;
	hierarchical?: boolean;
	init?: () => Promise<void>;
	enrichUser?: (user: User) => Promise<User & AttributeData>;
	onUserCreated?: (user: User) => Promise<void>;
	onUserDeleted?: (user: User) => Promise<void>;
	getAuthzData?: (userId: string) => Promise<AttributeData>;
	// getItemsForUser: (user: User) => Promise<AttributeData>;
	// createUserItem?: (userId: string, item: ConfigEntryBase) => Promise<void>;
}

export interface HierachicalModule<
	Policies extends Record<string, Policy<any>> & {
		min: Policy<any, any>;
		max: Policy<any, any>;
		exact: Policy<any, any>;
	},
	AttributeData = {}
> extends Module<Policies, AttributeData> {
	hierarchical: true;
	policies: Policies;
}

export type AnyModule = Module<any> | HierachicalModule<any>;

export const createModule = <
	P extends Record<string, Policy<any>>,
	A extends AttributeData = {}
>(config: {
	name: string;
	policies: P;
	pluralName?: string;
	hierarchical?: boolean;
	init?: () => Promise<void>;
	enrichUser?: (user: User) => Promise<User & A>;
	getAuthzData?: (userId: string) => Promise<A>;
	getItemsForUser: (user: User) => Promise<A>;
}): Module<P, A> => {
	return {
		name: config.name,
		policies: config.policies,
		pluralName: config.pluralName,
		init: config.init,
		hierarchical: config.hierarchical,
		enrichUser: config.enrichUser,
		getAuthzData: config.getAuthzData,
		// getItemsForUser: config.getItemsForUser,
	};
};

/**
 * The generic config for a module that has an array of items.
 * T extends ReadonlyArray<ConfigEntryBase> to ensure compile-time array of entries.
 */
export type ModuleConfig<
	T extends ReadonlyArray<AttributeBase>,
	D = T[number]["key"]
> = {
	items: T;
	// Optionally define a default item the user must provide from T
	defaultAssignment?: D;
	// Or more advanced union logic, like you do with role-level union
};
