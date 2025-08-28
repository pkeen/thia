import { Adapter, AdapterUser } from "../../core/adapter";
import { SignupCredentials } from "../../core/types";

export function TestAdapter(): Adapter {
	return {
		async createUser(user: AdapterUser) {
			console.log("createUser", user);
			return user;
		},
		async getUser(id: string) {
			console.log("getUser", id);
			return null;
		},
		async getUserByEmail(email: string) {
			// for now return "pkeen7@gmail.com"
			if (email === "pkeen7@gmail.com") {
				const user: AdapterUser = {
					id: "1",
					email: "pkeen7@gmail.com",
					emailVerified: null,
					password: "password",
				};
				return user;
			}
			return null;
		},
		async createUserWithoutId(
			credentials: SignupCredentials
		): Promise<AdapterUser> {
			const user: AdapterUser = {
				id: "1",
				email: credentials.email,
				emailVerified: null,
				password: credentials.password,
				name: credentials.name,
			};
			return user;
		},
	};
}
