import { AnyModule, User, Module, HierachicalModule } from "./simpler-module";

/**
 * Extract the EnrichedData from any type of module
 * (Module or HierachicalModule).
 */
// type ExtractEnrichedData<M extends AnyModule> =
//   M extends Module<infer _Pol, infer E> ? E :
//   M extends HierachicalModule<infer _Pol, infer E> ? E :
//   never;
// without generic policies for now:
// type ExtractEnrichedData<M extends AnyModule> = M extends Module<infer E>
// 	? E
// 	: M extends HierachicalModule<infer E>
// 	? E
// 	: never;

type ExtractEnrichedData<M extends AnyModule> =
	// HierachicalModule<P, A> extends Module<P, A>, so we still want the second param:
	M extends HierachicalModule<infer _P, infer A>
		? A
		: M extends Module<infer _P, infer A>
		? A
		: never;
/**
 * Converts a union of types (A | B | C) into an intersection (A & B & C).
 * Classic TS trick using distributive conditional types.
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I
) => void
	? I
	: never;

/**
 * Given an array of modules, gather up all the "EnrichedData"
 * from each module, producing a single intersection type.
 */
type ModulesEnrichedData<A extends AnyModule[]> = UnionToIntersection<
	ExtractEnrichedData<A[number]>
>;

export interface AuthZOptions<A extends AnyModule[]> {
	modules: A;
	seed?: boolean;
}

export type AuthZRuntime<MergedData> = {
	enrichUser: (user: User) => Promise<User & MergedData>;
	onUserCreated: (user: User) => Promise<void>;
	onUserDeleted: (user: User) => Promise<void>;
	getAuthzData: (userId: string) => Promise<MergedData>;
	// A fake property to hold the type reference.
	// It's "null as any as MergedData" so it doesn't exist at runtime,
	// but TS sees it at compile-time.
	__DataType: MergedData;
};

/**
 * Takes an array of modules, calls init() if present,
 * and returns an object of combined lifecycle methods.
 */
export async function buildAuthZ<A extends AnyModule[]>(
	options: AuthZOptions<A>
): Promise<AuthZRuntime<ModulesEnrichedData<A>>> {
	const modules = options.modules;
	// 1) Initialize all modules
	if (options.seed) {
		for (const mod of modules) {
			await mod.init?.();
		}
	}

	// 2) We'll produce a typed aggregator function
	type MergedData = ModulesEnrichedData<A>;

	const enrichUser = async (baseUser: User): Promise<User & MergedData> => {
		// console.log("GETTING INTO ENRICH USER AGGREGATOR, USER:", baseUser);
		let result = { ...baseUser } as User & Partial<MergedData>;
		for (const mod of modules) {
			if (mod.enrichUser) {
				const modEnriched = await mod.enrichUser(result);
				// Spread the newly added fields
				result = { ...result, ...modEnriched };
			}
		}
		// By the end, result includes all modules' fields
		// console.log("ENRICH USER AGGREGATOR RESULT:", result);
		return result as User & MergedData;
	};

	const getAuthzData = async (userId: string) => {
		let result = {} as Partial<MergedData>;
		for (const mod of modules) {
			if (mod.getAuthzData) {
				const modData = await mod.getAuthzData(userId);
				// Spread the newly added fields
				result = { ...result, ...modData };
			}
		}
		// By the end, result includes all modules' fields
		// console.log("GET AUTHZ DATA AGGREGATOR RESULT:", result);
		return result as MergedData;
	};

	const executeLifecycleCallbacks = async (
		callbackName: "onUserCreated" | "onUserDeleted",
		user: User
	): Promise<void> => {
		console.log("EXECUTE LIFECYCLE CALLBACK: ", callbackName, user);
		for (const mod of modules) {
			if (mod[callbackName]) {
				await (mod[callbackName] as (user: User) => Promise<void>)(
					user
				);
			}
		}
	};
	// 2) Construct aggregated lifecycle
	const userLifecycle = {
		enrichUser,
		onUserCreated: (user: User) =>
			executeLifecycleCallbacks("onUserCreated", user),
		onUserDeleted: (user: User) =>
			executeLifecycleCallbacks("onUserDeleted", user),
	};

	// Return a combined object, or just the lifecycle if you prefer
	return {
		enrichUser,
		onUserCreated: (user: User) =>
			executeLifecycleCallbacks("onUserCreated", user),
		onUserDeleted: (user: User) =>
			executeLifecycleCallbacks("onUserDeleted", user),
		// The brand that never gets used at runtime:
		__DataType: null as any as MergedData,
		getAuthzData,
	} satisfies AuthZRuntime<MergedData>;
}

export type InferExtraData<T> = T extends {
	enrichUser: (user: User) => Promise<infer R>;
}
	? Omit<R, keyof User>
	: never;
