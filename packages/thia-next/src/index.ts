import {
	createThiaFunction,
	type MiddlewareConfig,
} from "./createThiaFunction";
import { createHandlers } from "./createHandlers";
import type { IAuthManager, AuthConfig } from "@pete_keen/authentication-core";
import { createAuthManager } from "@pete_keen/authentication-core";

interface extendedAuthConfig {
	middleware: MiddlewareConfig;
	secret: string;
}

export type ThiaNextConfig<Extra> = AuthConfig<Extra> & extendedAuthConfig;

type InferExtraFromConfig<C> = C extends {
	callbacks: { augmentUserData: (...args: any) => infer R };
}
	? Awaited<R>
	: {};

const Thia = <C extends ThiaNextConfig<InferExtraFromConfig<C>>>(config: C) => {
	const authManager = createAuthManager<InferExtraFromConfig<C>>(config);

	const thia = createThiaFunction(
		authManager,
		config.middleware.publicRoutes
	);
	const handlers = createHandlers(authManager);
	return { thia, handlers };
};

export default Thia;

export { CsrfField } from "./csrf.client";
export {
	verifyCsrfAndParseForm,
	getCsrfTokenClient,
	getCsrfTokenServer,
} from "./csrf";

export { thiaSessionCookie } from "./cookies";
