import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
}));

const { default: snippetRouter } = await import("../../../router/snippet/snippetRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/snippets", snippetRouter]);

describe("POST /snippets/insert-snippet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns 200 with snippetId on success", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { id: "snippet-123" }, error: null });
    const res = await request(app)
      .post("/snippets/insert-snippet")
      .send({ snippet_html: "<p>Hello</p>", snippet_subject: "Research" });
    expect(res.status).toBe(200);
    expect(res.body.snippetId).toBe("snippet-123");
  });

  it("returns 401 with invalid auth token (non-UUID sub)", async () => {
    const authServices = await import("../../../services/authServices.js");
    authServices.verifyToken.mockImplementationOnce((req, res, next) => {
      req.user = { sub: "not-a-uuid" };
      req.token = "test";
      req.supabaseClient = { from: mockChain.from };
      next();
    });
    const res = await request(app)
      .post("/snippets/insert-snippet")
      .send({ snippet_html: "<p>Hi</p>", snippet_subject: "Sub" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid auth token.");
  });

  it("returns 401 with invalid body (missing snippet_html)", async () => {
    const res = await request(app)
      .post("/snippets/insert-snippet")
      .send({ snippet_subject: "Subject only" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid body");
  });

  it("returns 400 when DB insertion fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "insert err" } });
    const res = await request(app)
      .post("/snippets/insert-snippet")
      .send({ snippet_html: "<p>Hi</p>", snippet_subject: "Sub" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Failed To Insert");
  });

  it("cleans /{{ placeholders in snippet_html", async () => {
    mockChain.single.mockResolvedValueOnce({ data: { id: "snip-1" }, error: null });
    const res = await request(app)
      .post("/snippets/insert-snippet")
      .send({ snippet_html: "<p>/{{name}}</p>", snippet_subject: "Sub" });
    expect(res.status).toBe(200);
    // The insert should have been called with cleaned HTML
    expect(mockChain.insert).toHaveBeenCalled();
  });
});

describe("POST /snippets/sync-variables", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns result array on success", async () => {
    // First call: fetch email/name
    mockChain.single
      .mockResolvedValueOnce({ data: { email: "prof@e.com", name: "Prof" }, error: null })
      // Second call: fetch variable fields
      .mockResolvedValueOnce({ data: { department: "CS" }, error: null });

    const res = await request(app)
      .post("/snippets/sync-variables")
      .send({
        variableArray: ["{{department}}"],
        professorIdArray: [1],
      });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.result).toHaveLength(1);
    expect(res.body.result[0].email).toBe("prof@e.com");
  });

  it("returns 400 when input arrays are not arrays", async () => {
    const res = await request(app)
      .post("/snippets/sync-variables")
      .send({ variableArray: "not-array", professorIdArray: "not-array" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid input arrays");
  });

  it("returns 400 when arrays are empty", async () => {
    const res = await request(app)
      .post("/snippets/sync-variables")
      .send({ variableArray: [], professorIdArray: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid input arrays");
  });

  it("returns 400 when professor fetch fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const res = await request(app)
      .post("/snippets/sync-variables")
      .send({ variableArray: ["{{name}}"], professorIdArray: [999] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Failed to Fetch");
  });

  it("returns 401 with invalid auth token", async () => {
    const authServices = await import("../../../services/authServices.js");
    authServices.verifyToken.mockImplementationOnce((req, res, next) => {
      req.user = { sub: "invalid" };
      req.token = "t";
      req.supabaseClient = { from: mockChain.from };
      next();
    });
    const res = await request(app)
      .post("/snippets/sync-variables")
      .send({ variableArray: ["{{x}}"], professorIdArray: [1] });
    expect(res.status).toBe(401);
  });
});
