import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	/* config options here */

	// Note: this silences a warning about which pnpm-lock is being used
	turbopack: {
		root: path.resolve(__dirname, "..", ".."),
	},
};

export default nextConfig;
