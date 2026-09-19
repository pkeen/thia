/**
 * Thrown by `Authorizer.assert` when a policy denies. Carries the action name so
 * callers can log or map it to an HTTP response without parsing the message.
 */
export class ForbiddenError extends Error {
	readonly action: string;

	constructor(action: string) {
		super(`Forbidden: ${action}`);
		this.name = "ForbiddenError";
		this.action = action;
	}
}
