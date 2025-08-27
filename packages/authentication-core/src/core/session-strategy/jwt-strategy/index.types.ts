import type { JwtOptions } from "./token-service/index.types";

export interface JwtConfig {
	access: JwtOptions;
	refresh: JwtOptions;
}
