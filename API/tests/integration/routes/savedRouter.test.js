import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  range: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.then = (resolve) => resolve({ data: [], error: null });
mockChain.single.mockResolvedValue({ data: null, error: null });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "00000000-0000-0000-0000-000000000001" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
}));

const { default: savedRouter } = await import("../../../router/saved/savedRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/saved", savedRouter]);

describe("GET /saved/repository/get-all-savedId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: [{ professor_id: 1 }, { professor_id: 2 }], error: null });
  });

  it("returns professor IDs on success", async () => {
    const res = await request(app).get("/saved/repository/get-all-savedId");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([1, 2]);
  });

  it("returns 400 on fetch error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).get("/saved/repository/get-all-savedId");
    expect(res.status).toBe(400);
  });
});

describe("GET /saved/kanban/get-saved", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: [{ professor_id: 1, name: "Prof A" }], error: null });
  });

  it("returns paginated saved professors", async () => {
    const res = await request(app).get("/saved/kanban/get-saved?page=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("returns 400 on fetch error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).get("/saved/kanban/get-saved");
    expect(res.status).toBe(400);
  });
});

describe("PUT /saved/kanban/change-status/:professorId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: null, error: null });
  });

  it("returns 200 on successful status update", async () => {
    const res = await request(app)
      .put("/saved/kanban/change-status/123")
      .send({ status: "contacted" });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it("returns 400 on update error", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app)
      .put("/saved/kanban/change-status/123")
      .send({ status: "contacted" });
    expect(res.status).toBe(400);
  });
});

describe("POST /saved/kanban/add-saved/:professorId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: null, error: null });
  });

  it("returns 200 on successful save", async () => {
    const res = await request(app)
      .post("/saved/kanban/add-saved/123")
      .send({
        name: "Prof A", email: "p@e.com", url: "http://...", lab_url: "http://...",
        research_interests: "AI", labs: "ML Lab", department: "CS", faculty: "Engineering", school: "UofT",
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Professor saved successfully.");
  });

  it("returns 400 on insert error", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "duplicate" } });
    const res = await request(app)
      .post("/saved/kanban/add-saved/123")
      .send({ name: "Prof A", email: "p@e.com" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /saved/kanban/remove-saved/:professorId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on successful delete", async () => {
    const res = await request(app).delete("/saved/kanban/remove-saved/123");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Professor removed successfully.");
  });

  it("returns 400 on delete error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).delete("/saved/kanban/remove-saved/123");
    expect(res.status).toBe(400);
  });
});
