// import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

// // Auth and CSRF wrapper
// export function withValidation(
// 	handler: Function,
// 	options: {
// 		csrf: boolean;
// 		role?: string;
// 	} = { csrf: true }
// ) {
// 	return async function ({
// 		request,
// 	}: ActionFunctionArgs | LoaderFunctionArgs) {
// 		// console.log("withRemixAuth - options: ", options);
// 		// Step 1: Get CSRF Token or create one if not present
// 		const csrf = await getCsrfTokenFromCookie(request);
// 		// console.log("withRemixAuth - csrf: ", csrf);
// 		if (!csrf) {
// 			console.log("withRemixAuth - setting csrf token");
// 			return await generateAndSetCsrfToken(request);
// 		}

// 		// Verify CSRF if wanted
// 		const csrfCheck = options.csrf;
// 		if (csrfCheck) {
// 			// will throw error if not valid csrf
// 			await csrfMiddleware(request);
// 		}

// 		// Validate auth
// 		const { user, isLoggedIn } = await authMiddleware(request);

// 		return handler({ request, user, isLoggedIn, csrf });

// 		// TO-DO - Role based access checks
// 	};
// }

// const withSession = async function ({
//     request,
