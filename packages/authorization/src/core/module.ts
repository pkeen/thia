import { Policy } from "./policy";

export interface User {
	id: string;
}

export interface Module<
	Policies extends Record<string, Policy<any>>,
	EnrichedData extends Record<string, any> = {}
> {
	name: Readonly<string>;
	policies: Policies;
	pluralName?: string;
	hierarchical?: boolean;
	init?: () => Promise<void>;
	enrichUser?: (user: User) => Promise<User & EnrichedData>;
	getItemsForUser: (user: User) => Promise<EnrichedData>;
	createUserItem: (userId: string, item: ConfigEntryBase) => Promise<void>;
}

// export type HierachicalModule = Module & { hierachical: true; level: number };
export interface HierachicalModule<
	Policies extends Record<string, Policy<any>>,
	EnrichedData extends Record<string, any> = {}
> extends Module<Policies, EnrichedData> {
	hierarchical: true;
	policies: Policies & {
		min: Policy;
		max: Policy;
		exact: Policy;
	};
}

export const createModule = <
	Policies extends Record<string, Policy<any>>,
	EnrichedData extends Record<string, any> = {}
>({
	name,
	policies,
	pluralName,
	hierarchical = false,
	init,
	enrichUser,
	getItemsForUser,
}: {
	name: string;
	policies: Policies;
	pluralName?: string;
	hierarchical?: boolean;
	init?: () => Promise<void>;
	enrichUser?: (user: User) => Promise<User & EnrichedData>;
	getItemsForUser: (user: User) => Promise<EnrichedData>;
}): Module<Policies, EnrichedData> => {
	return {
		name,
		policies,
		pluralName,
		init,
		hierarchical,
		enrichUser,
		getItemsForUser,
	};
};

/**
 * A base shape of an item in your config.
 * For RBAC, this might have both name & level.
 * For PBAC, maybe just name or name+tags, etc.
 */
export interface ConfigEntryBase {
	key: string;
	name: string;
	// If you need "level", you can keep it optional
	// and modules that need it can require it
	// level?: number;
	// ...other optional fields
}

/**
 * The generic config for a module that has an array of items.
 * T extends ReadonlyArray<ConfigEntryBase> to ensure compile-time array of entries.
 */
export type ModuleConfig<
	T extends ReadonlyArray<ConfigEntryBase>,
	D = T[number]["key"]
> = {
	items: T;
	// Optionally define a default item the user must provide from T
	defaultAssignment: D;
	// Or more advanced union logic, like you do with role-level union
};
