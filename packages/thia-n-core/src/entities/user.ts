import { z } from "zod";

const user = z.object({
	id: z.string(),
	email: z.string(),
	emailVerified: z.date().nullable(),
	name: z.string().optional(),
	image: z.string().optional(),
});
export type User = z.infer<typeof user>;

export const userPublic = user.extend({
	emailVerified: z.never(),
});
export type UserPublic = z.infer<typeof userPublic>;
