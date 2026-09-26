import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	experimental: {
		// Enables forbidden()/unauthorized(), which render the app/forbidden.tsx
		// and app/unauthorized.tsx boundaries with real 403/401 statuses.
		authInterrupts: true,
	},
};

export default nextConfig;
