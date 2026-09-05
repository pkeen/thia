// infra/state/in-memory-state-store.ts (dev/single-process only)
import { randomBytes } from "crypto";
import {
	AuthStateStore,
	OAuthTransientState,
} from "application/ports/state-store-port";

export class InMemoryStateStore implements AuthStateStore {
	private store = new Map<string, OAuthTransientState>();

	constructor(private ttlMs: number = 10 * 60 * 1000) {}

	async issue(
		payload: Omit<OAuthTransientState, "issuedAt">
	): Promise<string> {
		const state = randomBytes(32).toString("hex");
		this.store.set(state, { ...payload, issuedAt: Date.now() / 1000 });
		return state;
	}

	async consume(
		state: string,
		now: Date = new Date()
	): Promise<OAuthTransientState | undefined> {
		const entry = this.store.get(state);
		this.store.delete(state);
		if (!entry) return undefined;
		if (entry.issuedAt * 1000 + this.ttlMs < now.getTime())
			return undefined;
		return entry;
	}
}
