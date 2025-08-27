import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";

export default defineConfig({
	input: ["src/index.ts"],
	output: {
		dir: "dist",
		format: "esm",
		preserveModules: true,
		preserveModulesRoot: "src",
		entryFileNames: "[name].mjs",
		// sourcemap: true,
	},
	plugins: [
		typescript({
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
