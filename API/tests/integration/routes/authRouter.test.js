import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockWatchQueue = { addBulk: jest.fn().mockResolvedValue([]) };

const mockGmail = {
  users: {
    watch: jest.fn().mockResolvedValue({ data: { historyId: "12345" } }),
    labels: {
      create: jest.fn().mockResolvedValue({ data: { id: "Label_outreach", name: "[Outreach]" } }),
    },
  },
};

const mockSupabaseAuth = {
  signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: "https://google.com/oauth" }, error: null }),
  exchangeCodeForSession: jest.fn().mockResolvedValue({
    data: {
      session: {
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        provider_token: "prov-tok",
        provider_refresh_token: "prov-refresh-tok",
        user: { id: "00000000-0000-0000-0000-000000000001", email: "user@e.com", user_metadata: { full_name: "User" } },
      },
    },
    error: null,
  }),
  refreshSession: jest.fn().mockResolvedValue({
    data: { session: { access_token: "new-access", refresh_token: "new-refresh" } },
    error: null,
  }),
  getUser: jest.fn().mockResolvedValue({
    data: { user: { id: "00000000-0000-0000-0000-000000000001", email: "user@e.com" } },
    error: null,
  }),
  admin: {
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
};

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.single.mockResolvedValue({ data: null, error: null });
mockChain.then = (resolve) => resolve({ data: null, error: null });

jest.unstable_mockModule("../../../supabase/supabase.js", () => ({
  supabase: {
    auth: mockSupabaseAuth,
    from: mockChain.from,
  },
}));

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: mockChain.from,
    auth: { getUser: mockSupabaseAuth.getUser },
  }),
}));

const mockGenerateEmbeddings = jest.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "00000000-0000-0000-0000-000000000001" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
  verifyServerlessCron: jest.fn((req, res, next) => next()),
  generateEmbeddings: mockGenerateEmbeddings,
  encryptToken: jest.fn((t) => `enc-${t}`),
}));

jest.unstable_mockModule("../../../services/googleServices.js", () => ({
  configureOAuth: jest.fn().mockResolvedValue(mockGmail),
}));

jest.unstable_mockModule("../../../queue/watch/watchQueue.js", () => ({ default: mockWatchQueue }));

const { default: authRouter } = await import("../../../router/auth/authrouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/auth", authRouter]);

describe("GET /auth/signup-with-google", () => {
  beforeEach(() => jest.clearAllMocks());

  it("redirects to Google OAuth URL", async () => {
    const res = await request(app).get("/auth/signup-with-google");
    expect(res.status).toBe(302);
  });

  it("returns 400 on auth error", async () => {
    mockSupabaseAuth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: "err" } });
    const res = await request(app).get("/auth/signup-with-google");
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/signin-with-google", () => {
  beforeEach(() => jest.clearAllMocks());

  it("redirects to Google OAuth URL", async () => {
    mockSupabaseAuth.signInWithOAuth.mockResolvedValueOnce({ data: { url: "https://google.com" }, error: null });
    const res = await request(app).get("/auth/signin-with-google");
    expect(res.status).toBe(302);
  });
});

describe("POST /auth/oauth2callback/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 with tokens for new user", async () => {
    const res = await request(app).post("/auth/oauth2callback/login").send({ code: "auth-code" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body.redirectURL).toBe("/repository");
  });

  it("returns 200 for existing user", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { user_id: "u1" }, error: null });
    const res = await request(app).post("/auth/oauth2callback/login").send({ code: "auth-code" });
    expect(res.status).toBe(200);
  });

  it("returns 400 when exchange fails", async () => {
    mockSupabaseAuth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: { message: "bad code" } });
    const res = await request(app).post("/auth/oauth2callback/login").send({ code: "bad-code" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when insert fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "insert err" } });
    const res = await request(app).post("/auth/oauth2callback/login").send({ code: "auth-code" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/oauth2callback/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 with /register redirect for new user", async () => {
    const res = await request(app).post("/auth/oauth2callback/register").send({ code: "auth-code" });
    expect(res.status).toBe(200);
    expect(res.body.redirectURL).toBe("/register");
  });

  it("returns 200 with /repository redirect for existing user", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { user_id: "u1" }, error: null });
    const res = await request(app).post("/auth/oauth2callback/register").send({ code: "auth-code" });
    expect(res.status).toBe(200);
    expect(res.body.redirectURL).toBe("/repository");
  });

  it("returns 400 when no code provided", async () => {
    const res = await request(app).post("/auth/oauth2callback/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No code provided");
  });
});

describe("POST /auth/refresh-token", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with new tokens", async () => {
    const res = await request(app).post("/auth/refresh-token").send({ refreshToken: "old-refresh" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
  });

  it("returns 401 on invalid refresh token", async () => {
    mockSupabaseAuth.refreshSession.mockResolvedValueOnce({ data: null, error: { message: "invalid" } });
    const res = await request(app).post("/auth/refresh-token").send({ refreshToken: "bad" });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/sign-out", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 on success", async () => {
    const res = await request(app).post("/auth/sign-out").send({ refreshToken: "tok" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Successfully Signed Out");
  });

  it("returns 400 on sign-out error", async () => {
    mockSupabaseAuth.admin.signOut.mockResolvedValueOnce({ error: { message: "err" } });
    const res = await request(app).post("/auth/sign-out").send({ refreshToken: "tok" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/is-authenticated", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with valid token", async () => {
    const res = await request(app)
      .get("/auth/is-authenticated")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 401 without Authorization header", async () => {
    const res = await request(app).get("/auth/is-authenticated");
    expect(res.status).toBe(401);
  });

  it("returns 401 with malformed header", async () => {
    const res = await request(app)
      .get("/auth/is-authenticated")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
  });

  it("returns 400 when user not found", async () => {
    mockSupabaseAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await request(app)
      .get("/auth/is-authenticated")
      .set("Authorization", "Bearer some-token");
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/check-profile-completed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns 200 with isComplete", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { finished_registration: true }, error: null });
    const res = await request(app).get("/auth/check-profile-completed");
    expect(res.status).toBe(200);
    expect(res.body.isComplete).toBe(true);
  });

  it("returns 400 on fetch error", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app).get("/auth/check-profile-completed");
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: { finished_registration: false }, error: null });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on successful registration", async () => {
    const res = await request(app).post("/auth/register").send({
      student_major: "CS",
      student_year: "3",
      student_interests: ["AI", "ML"],
      student_acceptedterms: true,
    });
    expect(res.status).toBe(200);
  });

  it("returns 429 when already registered", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { finished_registration: true }, error: null });
    const res = await request(app).post("/auth/register").send({
      student_major: "CS",
      student_year: "3",
      student_interests: ["AI"],
      student_acceptedterms: true,
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 with incomplete information", async () => {
    const res = await request(app).post("/auth/register").send({
      student_major: "CS",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Incomplete Information");
  });

  it("returns 400 with invalid interests (>3)", async () => {
    const res = await request(app).post("/auth/register").send({
      student_major: "CS",
      student_year: "3",
      student_interests: ["A", "B", "C", "D"],
      student_acceptedterms: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid Interests");
  });

  it("returns 500 when embedding fails", async () => {
    mockGenerateEmbeddings.mockRejectedValueOnce(new Error("embed err"));
    const res = await request(app).post("/auth/register").send({
      student_major: "CS",
      student_year: "3",
      student_interests: ["AI"],
      student_acceptedterms: true,
    });
    expect(res.status).toBe(500);
  });
});

describe("GET /auth/fetch-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns 200 with profile info", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { student_interests: ["AI"], student_year: "3", student_name: "User", student_major: "CS" },
      error: null,
    });
    const res = await request(app).get("/auth/fetch-info");
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
  });

  it("returns 400 on fetch error", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app).get("/auth/fetch-info");
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/update-profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: { updated_profile: null }, error: null });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on successful update", async () => {
    const res = await request(app).post("/auth/update-profile").send({
      student_major: "CS",
      student_year: "4",
      student_interests: ["AI", "ML"],
    });
    expect(res.status).toBe(200);
  });

  it("returns 429 when updated within 1 week", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { updated_profile: new Date().toISOString() },
      error: null,
    });
    const res = await request(app).post("/auth/update-profile").send({
      student_major: "CS",
      student_year: "4",
      student_interests: ["AI"],
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 with incomplete info", async () => {
    const res = await request(app).post("/auth/update-profile").send({ student_major: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid interests", async () => {
    const res = await request(app).post("/auth/update-profile").send({
      student_major: "CS",
      student_year: "4",
      student_interests: ["A", "B", "C", "D"],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/register/watch/queue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 and queues jobs", async () => {
    const res = await request(app)
      .post("/auth/register/watch/queue")
      .send({ watchData: [{ user_id: "u1" }, { user_id: "u2" }] });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Queued");
    expect(mockWatchQueue.addBulk).toHaveBeenCalled();
  });

  it("returns 200 with nothing to queue", async () => {
    const res = await request(app)
      .post("/auth/register/watch/queue")
      .send({ watchData: [] });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Nothing to queue");
  });
});

describe("POST /auth/register/watch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on success", async () => {
    const res = await request(app).post("/auth/register/watch");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("success");
  });

  it("returns 400 when history update fails", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).post("/auth/register/watch");
    expect(res.status).toBe(400);
  });

  it("returns 500 on Gmail error", async () => {
    const googleServices = await import("../../../services/googleServices.js");
    googleServices.configureOAuth.mockRejectedValueOnce(new Error("OAuth err"));
    const res = await request(app).post("/auth/register/watch");
    expect(res.status).toBe(500);
  });
});

describe("GET /auth/get-user-sidebar-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns 200 with user info", async () => {
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: "00000000-0000-0000-0000-000000000001" } },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { user_id: "u1", student_name: "User", student_email: "u@e.com", label_id: "L1" },
      error: null,
    });
    const res = await request(app)
      .get("/auth/get-user-sidebar-info")
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(200);
    expect(res.body.student_name).toBe("User");
  });

  it("returns 401 when user auth fails", async () => {
    mockSupabaseAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "err" } });
    const res = await request(app)
      .get("/auth/get-user-sidebar-info")
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(401);
  });
});
