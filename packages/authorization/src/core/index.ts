import { Module } from "./module";
import { Policy } from "./policy";
import type { User, AnyModule, AuthZConfig, IAuthZ } from "./types";

type ModuleName<M extends AnyModule> = M["name"] extends string
	? M["name"]
	: never;

type ModulesArrayToDict<A extends AnyModule[]> = {
	[Mod in A[number] as ModuleName<Mod>]: Mod;
};

export const AuthZ = <A extends AnyModule[]>(
	config: AuthZConfig<A>
): IAuthZ<ModulesArrayToDict<A>> => {
	// Ensure reduce returns Record<string, AnyModule>
	const modulesDict = config.modules.reduce(
		(acc, module) => {
			acc[module.name] = module; // Explicitly assigning the module object
			return acc;
		},
		{} as ModulesArrayToDict<A> // TypeScript will now infer correctly
	);

	// Optionally, you can initialize them or do more logic here
	for (const modName in modulesDict) {
		modulesDict[modName].init?.();
	}

	// Ensure reduce returns Record<string, Record<string, Policy<any>>>
	const policiesDict = config.modules.reduce((acc, module) => {
		acc[module.name] = module.policies ?? {};
		return acc;
	}, {} as IAuthZ<ModulesArrayToDict<A>>["policies"]);

	const enrichUser = async (user: User) => {
		for (const modName in modulesDict) {
			const mod = modulesDict[modName] as Module<any, any>;
			if (mod.enrichUser) {
				const enriched = await mod.enrichUser(user);
				return { ...user, ...enriched };
			}
		}
		return user;
	};

	const executeLifecycleCallbacks = async (
		callbackName: "onUserCreated" | "onUserDeleted",
		user: User
	): Promise<void> => {
		for (const modName in modulesDict) {
			const mod = modulesDict[modName];
			if (mod[callbackName]) {
				await (mod[callbackName] as (user: User) => Promise<void>)(
					user
				);
			}
		}
	};

	return {
		modules: modulesDict,
		policies: policiesDict,
		userLifecycle: {
			enrichUser,
			onUserCreated: (user: User) =>
				executeLifecycleCallbacks("onUserCreated", user),
		},
	};
};

// export * from "./module";
// export * from "./rbac";
export * from "./simpler-rbac";
export * from "./simpler-module";
export * from "./initAuthz";
