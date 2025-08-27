import {
	AuthConfig,
	AuthSystem,
	AuthState,
} from "@pete_keen/authentication-core";
import {
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	LoaderFunction,
	ActionFunction,
} from "react-router";
import { commitSession, destroySession, getSession } from "./session.server";
import { createLogger } from "@pete_keen/logger";
import { csrfMiddleware } from "./middleware/csrfMiddleware";

export interface RemixAuthState {
	authState: AuthState;
	csrf: string | null;
}

// App-specific config extension
export interface ExtendedAuthConfig {
	redirectAfterLogin?: string;
	redirectAfterLogout?: string;
}

// types/withValidation.d.ts
export interface WithValidationHandlerArgs {
	request: Request;
	authState: AuthState;
	csrf: string | null;
	formData?: FormData;
}

export interface WithValidationData<T> {
	csrf: string | null;
	authState?: AuthState;
	data?: T;
}

export type HandlerFunction<T> = (
	args: WithValidationHandlerArgs
) => Promise<T>;

export type WithValidation<T> = (
	handler: HandlerFunction<T>,
	options?: WithValidationOptions
) => LoaderFunction | ActionFunction;

export interface WithValidationOptions {
	csrf?: boolean;
	role?: string;
}

// Combined configuration for dependency injection
export type RemixAuthConfig = AuthConfig & ExtendedAuthConfig;

export interface ActionFormFunctionArgs extends ActionFunctionArgs {
	formData: FormData;
}

// // 2. OAuth Provider Interface
// // This defines what OAuth providers must implement
// interface OAuthProvider {
// 	// These methods are used by the framework adapter
// 	getAuthorizationUrl(): string;
// 	handleCallback(code: string): Promise<OAuthProviderData>;

// 	// This is used by the core auth system
// 	validateProviderToken(token: string): Promise<boolean>;
// }

export const RemixAuth = (config: RemixAuthConfig) => {
	const authSystem = AuthSystem.create(config);

	// TO-DO: incorperate logger into config somehow
	const logger = createLogger({ prefix: "Remix-Auth" });

	const providers = {
		google: {
			clientId: "123",
			clientSecret: "123",
		},
	};
	// Initialize OAuth flow
	const initializeOAuth = async (provider: string, request: Request) => {
		// const oauthProvider = providers[provider];
		// const oauthProvider = providers[provider];

		// if (!oauthProvider) {
		// 	throw new Error(`Unknown OAuth provider: ${provider}`);
		// }

		console.log("PROVIDER", provider);
		// console.log("oauthProvider", oauthProvider);

		// // Generate and store OAuth state
		// const state = crypto.randomUUID();
		// const session = await sessionStorage.getSession();
		// session.set("oauth_state", state);

		// // Get authorization URL with state
		// const url = await oauthProvider.getAuthorizationUrl(state);

		// // Redirect to provider's auth page
		// return redirect(url, {
		// 	headers: {
		// 		"Set-Cookie": await sessionStorage.commitSession(session),
		// 	},
		// });
	};
	const createLoginAction = (authSystem: AuthSystem, redirectTo?: string) => {
		return async function login({
			request,
			formData,
		}: ActionFormFunctionArgs) {
			// const formData = await request.formData();
			// ^ thats covered by formData now

			// Step 1 Get Session and Form Data
			let session = await getSession(request.headers.get("Cookie"));
			const headers = new Headers();
			// TO-DO: Provide optional credentials type
			const formDataObject = Object.fromEntries(formData);
			const { email, password, action } = formDataObject;
			console.log("provider: ", action);
			// TO-DO: pass correct provider type to auth system
			// const { email, password } = Object.fromEntries(formData);

			return initializeOAuth(action, request);
			// TO-DO: ensure type validation

			// // Call the auth system
			// const authState = await authSystem.authenticate({
			// 	email: email as string,
			// 	password: password as string,
			// });

			// if (!authState.authenticated) {
			// 	logger.info("LOGIN FAILED", { ...authState.error });
			// 	return new Response(JSON.stringify({ ...authState }), {
			// 		headers,
			// 	});
			// } else {
			// 	logger.info("LOGIN SUCCESSFUL", { ...authState.user });

			// 	// Store the keycards array in session
			// 	session.set("keyCards", authState.keyCards); // Can be any JSON array
			// 	session.set("user", authState.user);
			// 	session.set("authenticated", authState.authenticated);
			// 	headers.append("Set-Cookie", await commitSession(session));
			// 	// If redirectTo is provided, redirect and set cookie
			// 	if (redirectTo) {
			// 		return redirect(redirectTo, { headers });
			// 	}
			// 	// Otherwise, return a response and still set the cookie
			// 	return new Response(JSON.stringify({ ...authState }), {
			// 		headers,
			// 	});
			// }
		};
	};
	// const createLoginAction = (authSystem: AuthSystem, redirectTo?: string) => {
	// 	return async function login({
	// 		request,
	// 		formData,
	// 	}: ActionFormFunctionArgs) {
	// 		// const formData = await request.formData();
	// 		// ^ thats covered by formData now

	// 		// Step 1 Get Session and Form Data
	// 		let session = await getSession(request.headers.get("Cookie"));
	// 		const headers = new Headers();
	// 		// TO-DO: Provide optional credentials type
	// 		const formDataObject = Object.fromEntries(formData);
	// 		const { email, password, action } = formDataObject;
	// 		console.log("provider: ", action);
	// 		// TO-DO: pass correct provider type to auth system
	// 		// const { email, password } = Object.fromEntries(formData);

	// 		// TO-DO: ensure type validation

	// 		// Call the auth system
	// 		const authState = await authSystem.authenticate({
	// 			email: email as string,
	// 			password: password as string,
	// 		});

	// 		if (!authState.authenticated) {
	// 			logger.info("LOGIN FAILED", { ...authState.error });
	// 			return new Response(JSON.stringify({ ...authState }), {
	// 				headers,
	// 			});
	// 		} else {
	// 			logger.info("LOGIN SUCCESSFUL", { ...authState.user });

	// 			// Store the keycards array in session
	// 			session.set("keyCards", authState.keyCards); // Can be any JSON array
	// 			session.set("user", authState.user);
	// 			session.set("authenticated", authState.authenticated);
	// 			headers.append("Set-Cookie", await commitSession(session));
	// 			// If redirectTo is provided, redirect and set cookie
	// 			if (redirectTo) {
	// 				return redirect(redirectTo, { headers });
	// 			}
	// 			// Otherwise, return a response and still set the cookie
	// 			return new Response(JSON.stringify({ ...authState }), {
	// 				headers,
	// 			});
	// 		}
	// 	};
	// };

	const createLogoutAction = (
		authSystem: AuthSystem,
		redirectTo?: string
	) => {
		return async function logout({ request }: ActionFunctionArgs) {
			// Retrieve the session
			let session = await getSession(request.headers.get("Cookie"));
			const keyCards = await session.get("keyCards");
			const headers = new Headers();

			// call the auth system method
			const authState = await authSystem.logout(keyCards);

			// Option A
			// Destroy the session and get a new cookie
			// Destroy or set the AuthState to null?
			// headers.append("Set-Cookie", await destroySession(session));
			// console.log("Session destroyed!");

			// Option B
			session.set("keyCards", authState.keyCards);
			session.set("user", authState.user);
			session.set("authenticated", authState.authenticated);
			headers.append("Set-Cookie", await commitSession(session));

			// Handle redirect with Set-Cookie header
			if (redirectTo) {
				return redirect(redirectTo, {
					headers,
				});
			}

			// Return JSON response with the Set-Cookie header
			return new Response(JSON.stringify({ ...authState }), {
				headers,
			});
		};
	};
	const createSignupAction = (
		authSystem: AuthSystem,
		redirectTo?: string
	) => {
		return async function signup({ request }: ActionFunctionArgs) {
			// get the form data
			const formData = await request.formData();
			const { email, password } = Object.fromEntries(formData);

			if (typeof email !== "string" && typeof password !== "string") {
				console.error(
					"Expected email and password to be strings, but received non-string values."
				);
			}

			// create the user
			const authState = await authSystem.signup({
				email: email as string,
				password: password as string,
			});

			if (!authState.authenticated) {
				return new Response(JSON.stringify({ ...authState }), {});
			}
			// Get or create a session
			let session = await getSession(request.headers.get("Cookie"));
			console.log("session", session);

			// Store the keycards array in session
			session.set("keyCards", authState.keyCards); // Can be any JSON array

			// Commit session and set cookie header
			const cookie = await destroySession(session);

			// needs session storage

			// If redirectTo is provided, redirect and set cookie
			if (redirectTo) {
				return redirect(redirectTo, {
					headers: {
						"Set-Cookie": cookie, // Properly set headers
					},
				});
			}

			// Otherwise, return a response and still set the cookie
			return new Response(
				JSON.stringify(authState), // Response body
				{
					headers: {
						"Set-Cookie": cookie, // Properly set headers
					},
				}
			);
		};
	};

	/*
        The Job is to get and supply (and validate) the AuthState to cookies and AuthProvider
    */
	const authLoader = async ({ request }: LoaderFunctionArgs) => {
		// Step 1 - load the session data
		const session = await getSession(request.headers.get("Cookie"));
		const headers = new Headers();
		// initial state
		const remixAuthState: RemixAuthState = {
			authState: {
				user: null,
				authenticated: false,
				keyCards: null,
			},
			csrf: null,
		};

		// Step 2: CSFR Protection -
		// Step 2a: Get CSRF Token or create one if not present
		let csrf = session.get("csrf");
		// Step 2b: Check if csrf is present
		if (!csrf) {
			csrf = await authSystem.generateCsrfToken();
			// session.set("csrf", csrf);
			headers.append("Set-Cookie", await commitSession(session));
		}

		// This was my bug - needed to return the csrf in early exit
		remixAuthState.csrf = csrf;

		// Step 3: Validate the keyCards
		const keyCards = session.get("keyCards");
		console.log("RootLoader - keyCards: ", keyCards);

		if (!keyCards) {
			// return Response.json(authStatus, { headers });
			return new Response(JSON.stringify(remixAuthState), {
				headers,
			});
		}
		console.log("this wont show on non-logged in yet");

		// Step 4: Get the auth status and set the status and return object accordingly
		// Or should we not bother doing validation? And just leave it routes to be protected manually
		const authState = await authSystem.validate(keyCards);
		remixAuthState.authState = authState;
		remixAuthState.csrf = csrf;
		session.set("keyCards", authState.keyCards);
		session.set("user", authState.user);
		session.set("authenticated", authState.authenticated);
		headers.append("Set-Cookie", await commitSession(session));

		// theres no handler to return so just the state
		// Make sure cookie is actually set must return headers
		return new Response(JSON.stringify(remixAuthState), {
			headers,
		});
	};

	const withValidation = <T>(
		handler: HandlerFunction<T>,
		options: WithValidationOptions = { csrf: true }
	): LoaderFunction | ActionFunction => {
		return async function ({
			request,
		}: ActionFunctionArgs | LoaderFunctionArgs) {
			console.log("withValidation - options: ", options);
			// Step 1 - load the session data
			const session = await getSession(request.headers.get("Cookie"));
			const headers = new Headers();
			const remixAuthState: RemixAuthState = {
				authState: {
					user: null,
					authenticated: false,
					keyCards: null,
				},
				csrf: null,
			};

			// Step 2: CSFR Protection -
			// Step 2a: Get CSRF Token or create one if not present
			let csrf = session.get("csrf");
			console.log("withValidation - session csrf: ", csrf);

			// Step 2b: Check if csrf is present
			if (!csrf) {
				csrf = await authSystem.generateCsrfToken();
				session.set("csrf", csrf);
				headers.append("Set-Cookie", await commitSession(session));
			}

			// This was my bug - needed to return the csrf in early exit
			remixAuthState.csrf = csrf;

			// Read the body once
			let formData = undefined;
			if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
				formData = await request.formData();
			}
			console.log("withValidation - formData: ", formData);

			// Step 2c: Verify CSRF Token - if wanted csrfMiddleware
			const csrfCheck = options.csrf;
			if (csrfCheck) {
				// will throw error if not valid csrf
				await csrfMiddleware(request, csrf, formData);
			}

			// Step 3: Validate the keyCards
			const keyCards = session.get("keyCards");
			console.log("withValidation - keyCards: ", keyCards);

			if (!keyCards) {
				// return Response.json(authStatus, { headers });
				console.log(
					"withValidation - no keyCards -- exiting -- remixAuthState: ",
					remixAuthState
				);
				return new Response(JSON.stringify(remixAuthState), {
					headers,
				});
			}
			console.log("this wont show on non-logged in");

			// Step 4: Get the auth status and set the status and return object accordingly
			const authState = await authSystem.validate(keyCards);
			remixAuthState.authState = authState;
			remixAuthState.csrf = csrf;
			session.set("keyCards", authState.keyCards);
			session.set("user", authState.user);
			session.set("authenticated", authState.authenticated);
			headers.append("Set-Cookie", await commitSession(session));

			// Call the handler with user and CSRF data

			const data = await handler({ request, authState, csrf, formData });

			// console.log("withValidation - data: ", data);
			const withValidationData: WithValidationData<T> = {
				authState,
				csrf,
				data,
			};

			// TO-DO - Role based access checks
			// return data;
			// Make sure cookie is actually set must return headers
			return new Response(JSON.stringify(withValidationData), {
				headers,
			});
		};
	};

	return {
		authSystem,
		login: createLoginAction(authSystem, config.redirectAfterLogin),
		logout: createLogoutAction(authSystem, config.redirectAfterLogout),
		signup: createSignupAction(authSystem, config.redirectAfterLogin),
		authLoader,
		withValidation,
	};
};

export const withCsrf = (handler: Function) => {
	return async function (args: ActionFunctionArgs | LoaderFunctionArgs) {
		const session = await getSession(args.request.headers.get("Cookie"));
		const csrf = session.get("csrf");

		// Read the body once
		let formData = null;
		if (!["GET", "HEAD", "OPTIONS"].includes(args.request.method)) {
			formData = await args.request.formData();
		}
		console.log("with csrf - form data", formData);
		// test it by setting it different
		if (csrf && formData) {
			await csrfMiddleware(args.request, csrf, formData);
		}

		return handler({ ...args, formData });
	};
};

export const getSessionData = async (request: Request) => {
	const session = await getSession(request.headers.get("Cookie"));
	// console.log("GETSESSIONDATA - session: ", session);
	const user = session.get("user");
	// console.log("getSessionData - user: ", user);
	const authenticated = session.get("authenticated");
	return { user, authenticated };
};

export default RemixAuth;
