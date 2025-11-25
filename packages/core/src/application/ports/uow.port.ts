import { UserRepository } from "./user-repo.port";

// core/ports/uow.port.ts
export interface UnitOfWork {
	users: UserRepository;
	commit(): Promise<void>;
	rollback(): Promise<void>;
}
