import { thia } from "@/thia";

export async function getProviders() {
	const providers = thia.listProviders();
	return providers;
}
