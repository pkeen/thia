// import { z } from "zod";
// using pure TS no zod now

export interface User {
	id: string;
	email: string;
	emailVerified: Date | null;
	name?: string;
	image?: string; // maybe change this to imageUrl (more accurate)
	createdAt: Date;
}

export type UserCreate = Omit<User, "emailVerified" | "createdAt" | "id">;

export type UserPublic = Omit<User, "emailVerified" | "createdAt">;

// const user = z.object({
// 	id: z.string(),
// 	email: z.string(),
// 	emailVerified: z.date().nullable().default(null),
// 	name: z.string().optional(),
// 	image: z.string().optional(),
// });
// export type User = z.infer<typeof user>;

// export const userCreate = user.omit({ id: true });
// export type UserCreate = z.infer<typeof userCreate>;

// export const userPublic = user.extend({
// 	emailVerified: z.never(),
// });
// export type UserPublic = z.infer<typeof userPublic>;
