// brands.ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export const asUserId = (s: string) => s as UserId;

export type AccountId = Brand<string, "AccountId">;
export const asAccountId = (s: string) => s as AccountId;

export type Provider = Brand<string, "Provider">;
export const asProvider = (s: string) => s as Provider;

export type ProviderAccountId = Brand<string, "ProviderAccountId">;
export const asProviderAccountId = (s: string) => s as ProviderAccountId;
