import { Policy } from "./policy";
import { Module, HierachicalModule, User } from "./module";

// export interface User {
// 	id: string;
// }

export type AnyModule = Module<any> | HierachicalModule<any>;

export interface IAuthZ<M extends Record<string, AnyModule>> {
	// Heres the choice, do we take an entities object/array and put all Roles, Permissions, Orgs etc in there
	// or do we have a Roles object, a Permissions object, and a custom entities object?

	modules: M;
	// should the schema and table be returned to user to add to their own migrations? probably yes
	// schemaName?: string; // ??? this needs to actually be at the level of the adpater I think

	// policies: Record<string, Record<string, Policy<any>>>;
	policies: {
		[K in keyof M]: M[K] extends Module<any> ? M[K]["policies"] : never;
	};

	userLifecycle: {
		enrichUser: (user: User) => Promise<User & Record<string, any>>;
		onUserCreated: (user: User) => Promise<void>;
	};
}

// Let A be a tuple of modules, e.g. [RbacModule, PbacModule, ...]
export interface AuthZConfig<A extends AnyModule[]> {
	modules: [...A];
}
export { User };
