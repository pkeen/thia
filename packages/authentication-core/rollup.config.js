import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import multi from "@rollup/plugin-multi-entry";

export default defineConfig({
	input: [
		"src/index.ts",
		"src/adapters/index.ts",
		"src/core/providers/index.ts",
        "src/authorization/index.ts",
	],
	output: {
		dir: "dist",
		format: "esm",
		preserveModules: true,
		preserveModulesRoot: "src",
		entryFileNames: "[name].mjs",
		// sourcemap: true,
	},
	external: [
		"react",
		"react-dom",
		// Ensure all Next.js imports are treated as external
		// "next",
		// "next/*",
		// /^next\/.*/,
		// Add any other dependencies that should be external
	],
	plugins: [
		// preserveDirectives(), // not needed
		typescript({
			// tsconfig: "tsconfig.json",
			// declaration: true,
			// rootDir: "src",
			// outDir: "dist",
			// jsx: "react-jsx", // not needed no react
			tsconfig: "tsconfig.json",
			declaration: true,
			declarationDir: "dist",
			rootDir: "src",
			// sourceMap: true,
			inlineSources: true,
			noEmitOnError: false, // Temporarily allow TS errors
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
