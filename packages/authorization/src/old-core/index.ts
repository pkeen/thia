import { Policy } from "./types";

export class AuthorizationSystem {
	private policies: Record<string, Policy<any>> = {};
	public rules: Record<string, (context: any) => boolean> = {};

	// Add a rule
	addRule<Context>(name: string, rule: (context: Context) => boolean) {
		this.rules[name] = rule;
	}

	// Evaluate a rule
	rule(name: string, context: any): boolean {
		const rule = this.rules[name];
		if (!rule) {
			throw new Error(`Rule "${name}" not found`);
		}
		return rule(context);
	}

	// Register a policy dynamically
	addPolicy<Context>(name: string, policy: Policy<Context>) {
		this.policies[name] = policy;
	}

	// Evaluate a registered policy
	policy(name: string, context: any): boolean {
		const policy = this.policies[name];
		if (!policy) {
			throw new Error(`Policy "${name}" not found`);
		}
		return policy(context);
	}
}
