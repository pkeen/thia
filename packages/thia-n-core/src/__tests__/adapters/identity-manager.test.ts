import { createIdentityManager } from "../../adapters/identity-providers/identity-provider-manager";

import { describe, it, expect, test, beforeAll, vi } from "vitest";

const mockProvider = {
	createAuthorizationRequest: vi.fn(() => {
		return {
			url: "someurl.com",
			state: "sfsdfkljasdfdf",
		};
	}),
};

const mockProviderMap = {
	mock1: mockProvider,
};

// TODO: this type doesnt match up yet
const identityManager = createIdentityManager(mockProviderMap);

describe("identity manager", () => {
	beforeAll(() => {});

	test("beginOauth returns mock response", async () => {
		const result = await identityManager.beginOAuth("mock1");
		expect(result.ok).toBe(true);
	});
});
