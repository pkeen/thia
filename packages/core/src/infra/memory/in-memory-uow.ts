// infra/memory/in-memory-uow.ts
import { UnitOfWork } from "application/ports/uow.port";
import { UserRepository } from "application/ports/user-repo.port";
import { InMemoryUserRepo } from "./in-memory-user-repo";

export class InMemoryUoW implements UnitOfWork {
	constructor(public users: UserRepository = new InMemoryUserRepo()) {}
	async commit() {} // no-op
	async rollback() {} // no-op
}
