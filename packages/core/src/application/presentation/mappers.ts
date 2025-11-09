// mappers.ts
import { User } from "../../domain/entities/user";

export type UserPublicDTO = {
	id: string;
	email: string;
	name?: string;
	image?: string;
	createdAt: string;
};

export const toUserPublicDTO = (u: User): UserPublicDTO => ({
	id: u.id,
	email: u.email.value,
	name: u.name.value,
	image: u.image.value,
	createdAt: u.createdAt.toISOString(),
});
