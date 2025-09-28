// brands.ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type AccountId = Brand<string, "AccountId">;
export type Provider = Brand<string, "Provider">;
export type ProviderAccountId = Brand<string, "ProviderAccountId">;

export const UserId = (s: string): UserId => s as UserId;
export const Provider = (s: string): Provider => s as Provider;
export const ProviderAccountId = (s: string): ProviderAccountId =>
	s as ProviderAccountId;
