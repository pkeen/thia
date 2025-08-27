import { Login } from "./login";

export function AuthComponent({ loaderData }: { loaderData: any }) {
	const providers = loaderData.providers;
	console.log("PROVIDERS:", providers);

	switch (loaderData.page) {
		case "login":
			return <Login providers={providers} />;
		case "error":
			return (
				<div>
					<h1>Error</h1>
					<p>{loaderData.error}</p>
				</div>
			);
		default:
			return (
				<div>
					<h1>Auth</h1>
				</div>
			);
	}
}
