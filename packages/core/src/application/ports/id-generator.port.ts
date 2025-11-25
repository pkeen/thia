export interface IdGenerator {
	userId(): string; // brand if you like
	jti(): string; // for JWT IDs
}
