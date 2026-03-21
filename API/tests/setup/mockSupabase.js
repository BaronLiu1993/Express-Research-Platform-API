import { jest } from "@jest/globals";

export function createMockSupabaseChain(resolvedValue = { data: null, error: null }) {
  const chain = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    single: jest.fn(),
    rpc: jest.fn(),
  };

  // Make all methods return chain for chaining
  Object.keys(chain).forEach((key) => {
    chain[key].mockReturnValue(chain);
  });

  // Terminal - resolves the promise
  chain.single.mockResolvedValue(resolvedValue);

  // Make chain thenable so await works on any point
  chain.then = (resolve) => resolve(resolvedValue);

  return chain;
}

export function createMockSupabaseClient(chainOverride) {
  const chain = chainOverride || createMockSupabaseChain();

  return {
    from: jest.fn().mockReturnValue(chain),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: "https://google.com/auth" }, error: null }),
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            provider_token: "provider-token",
            provider_refresh_token: "provider-refresh-token",
            user: {
              id: "00000000-0000-0000-0000-000000000001",
              email: "test@example.com",
              user_metadata: { full_name: "Test User" },
            },
          },
        },
        error: null,
      }),
      refreshSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
          },
        },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: "00000000-0000-0000-0000-000000000001",
            email: "test@example.com",
          },
        },
        error: null,
      }),
      admin: {
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    },
    storage: {
      from: jest.fn().mockReturnValue({
        createSignedUploadUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: "https://storage.example.com/upload", token: "upload-token" },
          error: null,
        }),
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: "https://storage.example.com/download" },
          error: null,
        }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
    _chain: chain,
  };
}

export function setupSupabaseMock() {
  const mockClient = createMockSupabaseClient();
  const createClient = jest.fn().mockReturnValue(mockClient);

  jest.unstable_mockModule("@supabase/supabase-js", () => ({
    createClient,
  }));

  return { createClient, mockClient };
}
