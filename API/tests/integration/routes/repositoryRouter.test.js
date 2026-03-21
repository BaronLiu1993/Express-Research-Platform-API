import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: [0.1, 0.2, 0.3] }],
});

jest.unstable_mockModule("openai", () => ({
  default: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbeddingsCreate },
  })),
}));

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  in: jest.fn(),
  order: jest.fn(),
  range: jest.fn(),
  eq: jest.fn(),
  rpc: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.then = (resolve) => resolve({ data: [{ id: 1, name: "Prof A" }], count: 1, error: null });
mockChain.rpc.mockResolvedValue({ data: [{ id: 1, name: "Prof A", school: "UofT" }], error: null });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
    req.token = "test-token";
    req.supabaseClient = {
      from: mockChain.from,
      rpc: mockChain.rpc,
    };
    next();
  }),
}));

const { default: repositoryRouter } = await import("../../../router/repository/repositoryRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/repository", repositoryRouter]);

describe("GET /repository/taishan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: [{ id: 1, name: "Prof A" }], count: 1, error: null });
    mockChain.rpc.mockResolvedValue({ data: [{ id: 1, name: "Prof A", school: "UofT" }], error: null });
  });

  it("returns paginated data without search", async () => {
    const res = await request(app).get("/repository/taishan?page=1");
    expect(res.status).toBe(200);
    expect(res.body.tableData).toBeDefined();
  });

  it("uses embeddings for search queries", async () => {
    const res = await request(app).get("/repository/taishan?search=machine%20learning");
    expect(res.status).toBe(200);
    expect(mockEmbeddingsCreate).toHaveBeenCalled();
  });

  it("filters by school, faculty, department", async () => {
    const res = await request(app).get("/repository/taishan?school=UofT&faculty=Engineering");
    expect(res.status).toBe(200);
  });

  it("returns 500 when embedding fails", async () => {
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: null }] });
    const res = await request(app).get("/repository/taishan?search=test");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Embedding failed.");
  });

  it("returns 400 when RPC returns error", async () => {
    mockChain.rpc.mockResolvedValueOnce({ data: null, error: { message: "rpc err" } });
    const res = await request(app).get("/repository/taishan?search=test");
    expect(res.status).toBe(400);
  });

  it("returns 500 when query throws", async () => {
    mockChain.then = () => { throw new Error("db error"); };
    const res = await request(app).get("/repository/taishan");
    expect(res.status).toBe(500);
  });

  it("defaults page to 1", async () => {
    const res = await request(app).get("/repository/taishan");
    expect(res.status).toBe(200);
  });
});

describe("GET /repository/match-professors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChain.rpc.mockResolvedValue({ data: [{ id: 1, name: "Matched Prof" }], error: null });
  });

  it("returns matches on success", async () => {
    const res = await request(app).get("/repository/match-professors");
    expect(res.status).toBe(200);
    expect(res.body.matches).toBeDefined();
  });

  it("returns 401 with invalid auth token", async () => {
    const authServices = await import("../../../services/authServices.js");
    authServices.verifyToken.mockImplementationOnce((req, res, next) => {
      req.user = { sub: "" }; // empty string fails min(1)
      req.token = "t";
      req.supabaseClient = { rpc: mockChain.rpc };
      next();
    });
    const res = await request(app).get("/repository/match-professors");
    expect(res.status).toBe(401);
  });

  it("returns 400 when RPC fails", async () => {
    mockChain.rpc.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app).get("/repository/match-professors");
    expect(res.status).toBe(400);
  });
});
