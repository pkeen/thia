import { User } from "entities";

export type AugmentUserData<Extra> = (userId: string) => Promise<Extra>;

export interface AuthNCallbacks<Extra = {}> {
	augmentUserData: AugmentUserData<Extra>;
	onUserCreated?: (user: User) => Promise<void>;
	onUserUpdated?: (user: User) => Promise<void>;
	onUserDeleted?: (user: User) => Promise<void>;
}
