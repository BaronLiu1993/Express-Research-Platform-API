import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

// Mock dependencies before importing
jest.unstable_mockModule("openai", () => {
  const mockCreate = jest.fn().mockResolvedValue({
    data: [{ embedding: [0.1, 0.2, 0.3] }],
  });
  return {
    default: jest.fn().mockImplementation(() => ({
      embeddings: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

jest.unstable_mockModule("google-auth-library", () => {
  const mockVerifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

const {
  encryptToken,
  decryptToken,
  generateEmbeddings,
  verifyServerlessCron,
  verifyPubSubJwt,
  verifyToken,
} = await import("../../../services/authServices.js");

const openaiModule = await import("openai");
const googleAuthModule = await import("google-auth-library");

function createMockReqRes(overrides = {}) {
  const req = {
    headers: {},
    get: jest.fn((name) => req.headers[name.toLowerCase()]),
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe("encryptToken / decryptToken", () => {
  it("round-trips a token successfully", () => {
    const original = "my-secret-token-12345";
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(0);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext each call (AES random IV)", () => {
    const token = "same-token";
    const a = encryptToken(token);
    const b = encryptToken(token);
    // CryptoJS AES uses random salt, so ciphertexts differ
    expect(a).not.toBe(b);
  });

  it("decryptToken returns empty string for wrong ciphertext gracefully", () => {
    // CryptoJS returns empty on bad decrypt rather than throwing
    const result = decryptToken("totally-invalid-ciphertext");
    expect(typeof result).toBe("string");
  });
});

describe("generateEmbeddings", () => {
  beforeEach(() => {
    openaiModule.__mockCreate.mockClear();
  });

  it("returns embeddings on success", async () => {
    openaiModule.__mockCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.5, 0.6] }],
    });
    const result = await generateEmbeddings("machine learning,AI");
    expect(result.data[0].embedding).toEqual([0.5, 0.6]);
    expect(openaiModule.__mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-large",
      input: "machine learning,AI",
    });
  });

  it("throws 'Failed to Embed' when OpenAI fails", async () => {
    openaiModule.__mockCreate.mockRejectedValueOnce(new Error("API Error"));
    await expect(generateEmbeddings("test")).rejects.toThrow("Failed to Embed");
  });
});

describe("verifyServerlessCron", () => {
  it("calls next() with valid secret and fresh timestamp", async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const { req, res, next } = createMockReqRes({
      headers: { "x-cron-secret": "test-cron-secret", "x-cron-ts": ts },
    });
    await verifyServerlessCron(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when x-cron-secret is missing", async () => {
    const { req, res, next } = createMockReqRes({
      headers: { "x-cron-ts": Math.floor(Date.now() / 1000).toString() },
    });
    await verifyServerlessCron(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
  });

  it("returns 403 when secret is wrong", async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const { req, res, next } = createMockReqRes({
      headers: { "x-cron-secret": "wrong-secret", "x-cron-ts": ts },
    });
    await verifyServerlessCron(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for stale timestamp (>300s skew)", async () => {
    const staleTs = (Math.floor(Date.now() / 1000) - 400).toString();
    const { req, res, next } = createMockReqRes({
      headers: { "x-cron-secret": "test-cron-secret", "x-cron-ts": staleTs },
    });
    await verifyServerlessCron(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Stale request" });
  });

  it("returns 403 for missing timestamp", async () => {
    const { req, res, next } = createMockReqRes({
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    await verifyServerlessCron(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("verifyPubSubJwt", () => {
  const mockVerify = googleAuthModule.__mockVerifyIdToken;

  it("returns payload with valid token", async () => {
    mockVerify.mockResolvedValueOnce({
      getPayload: () => ({
        email_verified: true,
        email: "test@test.iam.gserviceaccount.com",
      }),
    });
    const { req, res } = createMockReqRes({
      headers: { authorization: "Bearer valid-jwt-token" },
    });
    const result = await verifyPubSubJwt(req, res);
    expect(result.email_verified).toBe(true);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { req, res } = createMockReqRes({ headers: {} });
    await verifyPubSubJwt(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "No Service Header" });
  });

  it("returns 401 when email is not verified", async () => {
    mockVerify.mockResolvedValueOnce({
      getPayload: () => ({
        email_verified: false,
        email: "test@test.iam.gserviceaccount.com",
      }),
    });
    const { req, res } = createMockReqRes({
      headers: { authorization: "Bearer valid-token" },
    });
    await verifyPubSubJwt(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Emailed Not Verfied" });
  });

  it("returns 401 when service account email is wrong", async () => {
    mockVerify.mockResolvedValueOnce({
      getPayload: () => ({
        email_verified: true,
        email: "wrong@wrong.iam.gserviceaccount.com",
      }),
    });
    const { req, res } = createMockReqRes({
      headers: { authorization: "Bearer valid-token" },
    });
    await verifyPubSubJwt(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Wrong Service Account" });
  });
});

describe("verifyToken", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { req, res, next } = createMockReqRes({ headers: {} });
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Missing Authorization header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is missing after Bearer", async () => {
    const { req, res, next } = createMockReqRes({
      headers: { authorization: "Bearer " },
    });
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for invalid/expired token", async () => {
    const { req, res, next } = createMockReqRes({
      headers: { authorization: "Bearer invalid-jwt-token" },
    });
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid or expired token" });
  });

  it("calls next() and sets req.user for valid JWT", async () => {
    // Create a real JWT signed with our test secret
    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { sub: "00000000-0000-0000-0000-000000000001", role: "authenticated" },
      process.env.SUPABASE_JWT_SECRET,
      { algorithm: "HS256" }
    );
    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    });
    await verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.sub).toBe("00000000-0000-0000-0000-000000000001");
    expect(req.token).toBe(token);
    expect(req.supabaseClient).toBeDefined();
  });
});
