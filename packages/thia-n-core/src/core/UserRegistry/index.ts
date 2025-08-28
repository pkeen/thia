import {
	UserRepository,
	CreateUserDTO,
	UpdateUserDTO,
	DatabaseUser,
} from "../types/UserRegistry";
// Abstract base class for user repositories
export abstract class BaseUserRepository<S> implements UserRepository {
	protected storage: S; // Specific storage implementation
	protected tenantId?: string;

	constructor(storage: S, tenantId?: string) {
		this.tenantId = tenantId; // tenant level functionality to be delivered later   
		this.storage = storage;
	}
	// Shared functionality - fully implemented
	protected validateEmail(email: string): void {
		if (!email.includes("@")) {
			throw new Error("Invalid email");
		}
	}

	// Abstract methods - must be implemented by child classes
	abstract findByEmail(email: string): Promise<DatabaseUser | null>;
	abstract create(data: CreateUserDTO): Promise<DatabaseUser>;
	abstract update(id: string, data: UpdateUserDTO): Promise<DatabaseUser>;
	abstract findById(id: string): Promise<DatabaseUser | null>;
	// abstract delete(id: string): Promise<void>;
}
