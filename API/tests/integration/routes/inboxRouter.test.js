import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockInboxQueue = {
  add: jest.fn().mockResolvedValue({ id: "job-1" }),
  addBulk: jest.fn().mockResolvedValue([]),
};

const mockGmail = {
  users: {
    threads: {
      get: jest.fn().mockResolvedValue({
        data: {
          messages: [
            { id: "msg-1", payload: { headers: [{ name: "From", value: "prof@e.com" }, { name: "Subject", value: "Re: Research" }, { name: "Date", value: "2025-01-01" }] } },
          ],
        },
      }),
    },
    messages: {
      get: jest.fn().mockResolvedValue({
        data: { raw: Buffer.from("Subject: Test\r\n\r\nBody text").toString("base64url") },
      }),
    },
  },
};

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  order: jest.fn(),
  range: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.then = (resolve) => resolve({ data: [], error: null, count: 0 });
mockChain.single.mockResolvedValue({ data: null, error: null });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "00000000-0000-0000-0000-000000000001" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
  verifyPubSubJwt: jest.fn().mockResolvedValue({
    email_verified: true,
    email: "test@test.iam.gserviceaccount.com",
  }),
}));

jest.unstable_mockModule("../../../services/googleServices.js", () => ({
  configureOAuth: jest.fn().mockResolvedValue(mockGmail),
}));

jest.unstable_mockModule("../../../queue/inbox/inboxQueue.js", () => ({
  default: mockInboxQueue,
}));

const { default: inboxRouter } = await import("../../../router/inbox/inboxRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/inbox", inboxRouter]);

describe("POST /inbox/mail-webhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 when valid PubSub message is received", async () => {
    const pubSubData = Buffer.from(JSON.stringify({ historyId: "123", emailAddress: "user@e.com" })).toString("base64");
    const res = await request(app)
      .post("/inbox/mail-webhook")
      .set("Authorization", "Bearer valid-token")
      .send({ message: { data: pubSubData } });
    expect(res.status).toBe(200);
    expect(mockInboxQueue.add).toHaveBeenCalled();
  });

  it("returns 400 when message.data is missing", async () => {
    const res = await request(app)
      .post("/inbox/mail-webhook")
      .set("Authorization", "Bearer valid-token")
      .send({ message: {} });
    expect(res.status).toBe(400);
  });
});

describe("POST /inbox/seen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on success", async () => {
    const res = await request(app).post("/inbox/seen?threadId=thread-1");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Seen Data");
  });

  it("returns 400 on update error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).post("/inbox/seen?threadId=thread-1");
    expect(res.status).toBe(400);
  });
});

describe("GET /inbox/get-threads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: [{ id: 1 }], error: null, count: 1 });
  });

  it("returns paginated threads", async () => {
    const res = await request(app).get("/inbox/get-threads?page=1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("defaults to page 1", async () => {
    const res = await request(app).get("/inbox/get-threads");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it("returns 400 on fetch error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" }, count: 0 });
    const res = await request(app).get("/inbox/get-threads");
    expect(res.status).toBe(400);
  });
});

describe("GET /inbox/get-email-previews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns messages for a thread", async () => {
    const res = await request(app).get("/inbox/get-email-previews?threadId=thread-1");
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("returns 500 on Gmail error", async () => {
    const googleServices = await import("../../../services/googleServices.js");
    googleServices.configureOAuth.mockRejectedValueOnce(new Error("OAuth error"));
    const res = await request(app).get("/inbox/get-email-previews?threadId=thread-1");
    expect(res.status).toBe(500);
  });
});

describe("GET /inbox/get-email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns html/text for a message", async () => {
    const res = await request(app).get("/inbox/get-email?messageId=msg-1&fromUser=false");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("text");
  });

  it("includes seenData when fromUser=true", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { opened_email: true, opened_email_at: "2025-01-01T00:00:00Z" },
      error: null,
    });
    const res = await request(app).get("/inbox/get-email?messageId=msg-1&fromUser=true");
    expect(res.status).toBe(200);
    expect(res.body.seenData).toBeDefined();
  });

  it("returns 400 when seenData fetch fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app).get("/inbox/get-email?messageId=msg-1&fromUser=true");
    expect(res.status).toBe(400);
  });
});
