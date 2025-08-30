// --- Auth Manager Interface ---
export interface IAuthManager<Extra = {}> {
    login: (params: SignInParams) => Promise<AuthResult<Extra>>;
    validate: (keyCards: KeyCards) => Promise<AuthResult<Extra>>;
    signOut: (
        keyCards: KeyCards | null | undefined
    ) => Promise<AuthState<Extra>>;
    listProviders: () => DisplayProvider[];
    callbacks: AuthNCallbacks<Extra>; // ✅ expose it here
}