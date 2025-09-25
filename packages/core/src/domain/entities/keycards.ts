import { z } from "zod";

// export const keyCardType = z.enum(["access", "refresh", "session"]);

export const KEYCARD_TYPE = ["access", "refresh", "session"] as const;
export type KeycardType = (typeof KEYCARD_TYPE)[number];

export interface Keycard {
	name: string;
	value: string;
	expiresAt?: Date;
	type: KeycardType;
}

// export const keyCard = z.object({
// 	name: z.string(),
// 	value: z.string(),
// 	expiresAt: z.date().optional(), // I really dont think this is needed either
// 	type: keyCardType.optional(), // TODO: is name or this needed, i imagine only one?
// });
// export type KeyCard = z.infer<typeof keyCard>;

// export interface KeyCard {
//     name: string;
//     value: string;
//     expiresAt?: Date;
//     type?: "access" | "refresh" | "session";
//     // storageOptions?: CookieOptions; // this i dont think is neccessary
// }
