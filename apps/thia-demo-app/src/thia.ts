import { createAuthManager } from "@pete_keen/thia-n-core";
import { DrizzleAdapter } from "@pete_keen/thia-n-core";

// export const thia = createAuthManager({
// 	strategy: "jwt",
// 	jwtConfig: {
// 		access: {
// 			name: "access", // for now the names NEED to be access and refresh
// 			secretKey: "asfjsdkfj",
// 			algorithm: "HS256",
// 			expiresIn: "30 minutes",
// 			fields: ["id", "email"], // TODO: this currently does nothing
// 		},
// 		refresh: {
// 			name: "refresh",
// 			secretKey: "jldmff",
// 			algorithm: "HS256",
// 			expiresIn: "30 days",
// 			fields: ["id"],
// 		},
// 	},
// 	adapter: DrizzleAdapter(db),
// });
