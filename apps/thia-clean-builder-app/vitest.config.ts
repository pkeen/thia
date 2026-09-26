import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL(".", import.meta.url)),
		},
	},
	test: {
		include: ["__tests__/**/*.test.ts?(x)"],
		env: {
			// next build sets this from experimental.authInterrupts in
			// next.config.ts; without it forbidden()/unauthorized() refuse to run.
			__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS: "1",
		},
	},
});
