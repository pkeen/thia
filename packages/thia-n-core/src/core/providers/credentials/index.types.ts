export interface Credentials {
	email: string;
	password: string;
}

export interface SignupCredentials extends Credentials {
	email: string;
	password: string;
	name?: string;
}
