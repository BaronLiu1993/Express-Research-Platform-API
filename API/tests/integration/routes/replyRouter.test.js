import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockSendReply = jest.fn();

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "00000000-0000-0000-0000-000000000001" };
    req.token = "test-token";
    req.supabaseClient = {};
    next();
  }),
  encryptToken: jest.fn((t) => `enc-${t}`),
  decryptToken: jest.fn((t) => `dec-${t}`),
}));

jest.unstable_mockModule("../../../services/emailServices.js", () => ({
  sendReply: mockSendReply,
}));

const { default: replyRouter } = await import("../../../router/reply/replyRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/reply", replyRouter]);

describe("POST /reply/send-reply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validBody = {
    userEmail: "student@example.com",
    userName: "Student",
    professorEmail: "prof@example.com",
    professorName: "Professor",
    body: "<p>Reply body</p>",
    subject: "Re: Research",
    threadId: "thread-1",
  };

  it("returns 200 on successful reply", async () => {
    mockSendReply.mockResolvedValueOnce({ success: true, message: "Successfully Sent!" });
    const res = await request(app)
      .post("/reply/send-reply?messageId=msg-1")
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Sent Successfully!");
  });

  it("returns 400 when missing required fields", async () => {
    const res = await request(app)
      .post("/reply/send-reply?messageId=msg-1")
      .send({ userEmail: "s@e.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing Input Fields");
  });

  it("returns 400 when messageId is missing from query", async () => {
    const res = await request(app)
      .post("/reply/send-reply")
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing Input Fields");
  });

  it("returns 400 when sendReply returns success: false", async () => {
    mockSendReply.mockResolvedValueOnce({ success: false, message: "Internal Server Error" });
    const res = await request(app)
      .post("/reply/send-reply?messageId=msg-1")
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Failed To Send");
  });

  it("returns 500 when sendReply throws", async () => {
    mockSendReply.mockRejectedValueOnce(new Error("crash"));
    const res = await request(app)
      .post("/reply/send-reply?messageId=msg-1")
      .send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal Server Error");
  });
});
