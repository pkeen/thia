// infra/id/ulid-id-generator.ts
import { monotonicFactory } from "ulid";
import { IdGenerator } from "application/ports/id-generator.port";
import { Clock } from "application/ports/clock.port";

export class UlidIdGenerator implements IdGenerator {
	private ulid = monotonicFactory();
	constructor(private clock: Clock) {}
	userId() {
		return this.ulid(this.clock.now().getTime());
	}
	jti() {
		return this.ulid(this.clock.now().getTime());
	}
}
