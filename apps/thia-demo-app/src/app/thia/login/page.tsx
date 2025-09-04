// import { authManager } from "@/auth";
// import type { DisplayProvider } from "@pete_keen/authentication-core";
import { getProviders } from "./getProviders";
// import type { DisplayProvider } from "@pete_keen/authentication-core";
import LoginForm from "./login";

export default async function Login() {
	const providers = await getProviders();
	return <LoginForm providers={providers} />;
}
