import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

// Mock supabase module
const mockUpdate = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockImplementation(() => ({ data: null, error: null, then: (r) => r({ data: null, error: null }) }));

jest.unstable_mockModule("../../../supabase/supabase.js", () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    }),
  },
}));

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  decryptToken: jest.fn().mockReturnValue("decrypted-tracking-id"),
  encryptToken: jest.fn((t) => `enc-${t}`),
  verifyToken: jest.fn((req, res, next) => next()),
}));

const { default: engagementRouter } = await import("../../../router/engagement/engagementRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/engagement", engagementRouter]);

describe("GET /engagement/hi.png", () => {
  it("returns a PNG image with valid analyticId", async () => {
    const res = await request(app).get("/engagement/hi.png?analyticId=test-encrypted-id");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
  });

  it("returns PNG even without analyticId", async () => {
    const res = await request(app).get("/engagement/hi.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
  });

  it("returns PNG even when decryptToken throws", async () => {
    const authServices = await import("../../../services/authServices.js");
    authServices.decryptToken.mockImplementationOnce(() => { throw new Error("bad"); });
    const res = await request(app).get("/engagement/hi.png?analyticId=bad-data");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
  });

  it("sets cache-control headers to prevent caching", async () => {
    const res = await request(app).get("/engagement/hi.png?analyticId=test-id");
    expect(res.headers["cache-control"]).toContain("no-cache");
  });
});
