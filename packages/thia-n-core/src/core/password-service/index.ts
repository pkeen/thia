import bcrypt from "bcryptjs";

export interface PasswordService {
	/**
	 * Hashes a plaintext password using bcrypt.
	 * @param password - The plaintext password to hash.
	 * @returns The hashed password string.
	 */
	hash(password: string): Promise<string>;
	/**
	 * Verifies if a plaintext password matches a hashed password.
	 * @param password - The plaintext password to verify.
	 * @param hashedPassword - The hashed password stored in the database.
	 * @returns A boolean indicating whether the password is valid.
	 */
	verify(password: string, hashedPassword: string): Promise<boolean>;
}

export const DefaultPasswordService = (
	saltRounds: number = 10
): PasswordService => {
	return {
		hash: async (password: string): Promise<string> => {
			try {
				const hashedPassword = await bcrypt.hash(password, saltRounds);
				return hashedPassword;
			} catch (error) {
				console.error("Error hashing password:", error);
				throw new Error("Could not hash the password.");
			}
		},
		verify: async (
			password: string,
			hashedPassword: string
		): Promise<boolean> => {
			try {
				const isValid = await bcrypt.compare(password, hashedPassword);
				return isValid;
			} catch (error) {
				console.error("Error verifying password:", error);
				throw new Error("Could not verify the password.");
			}
		},
	};
};
