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
	},
	plugins: [
		typescript({
			tsconfig: "tsconfig.build.json",
			declaration: true,
			declarationDir: "dist",
			rootDir: "src",
			inlineSources: true,
		}),
		resolve({
			preferBuiltins: true,
			moduleDirectories: ["src"],
		}),
		commonjs(),
	],
});
