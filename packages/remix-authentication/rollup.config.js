import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import preserveDirectives from "rollup-plugin-preserve-directives";

export default defineConfig({
	input: ["src/index.ts", "src/client/index.ts", "src/components/index.ts"],
	output: {
		dir: "dist",
		format: "esm",
		preserveModules: true,
		preserveModulesRoot: "src",
		entryFileNames: "[name].mjs",
	},
	external: [
		"react",
		"react-dom",
		"@react-router/node",
		"@react-router/serve",
		"isbot",
		"react-router",
		// Add any other dependencies that should be external
	],
	plugins: [
		preserveDirectives(),
		typescript({
			tsconfig: "tsconfig.json",
			declaration: true,
			rootDir: "src",
			outDir: "dist",
			jsx: "react-jsx",
		}),
		resolve({
			// Prevent bundling node_modules
			preferBuiltins: true,
			// Only bundle source files
			moduleDirectories: ["src"],
		}),
		commonjs(),
	],
});
