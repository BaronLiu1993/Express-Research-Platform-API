import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockDraftQueue = { addBulk: jest.fn().mockResolvedValue([]) };
const mockSendQueue = { addBulk: jest.fn().mockResolvedValue([]) };
const mockVariablelessQueue = { addBulk: jest.fn().mockResolvedValue([]) };
const mockSendAttachmentsQueue = { addBulk: jest.fn().mockResolvedValue([]) };

const mockGmail = {
  users: {
    drafts: {
      get: jest.fn().mockResolvedValue({
        data: {
          message: {
            payload: {
              parts: [{}, { body: { data: Buffer.from("<p>Hello</p>").toString("base64url") } }],
              headers: [{ name: "Subject", value: "Test Subject" }],
            },
          },
        },
      }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  },
};

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  range: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.then = (resolve) => resolve({ data: [{ id: 1, draft_id: "d1" }], error: null });
mockChain.single.mockResolvedValue({ data: null, error: null });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "00000000-0000-0000-0000-000000000001" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
}));

jest.unstable_mockModule("../../../queue/draft/draftQueue.js", () => ({ default: mockDraftQueue }));
jest.unstable_mockModule("../../../queue/send/sendQueue.js", () => ({ default: mockSendQueue }));
jest.unstable_mockModule("../../../queue/variablelessDrafts/variablelessQueue.js", () => ({ default: mockVariablelessQueue }));
jest.unstable_mockModule("../../../queue/sendAttachments/sendAttachmentsQueue.js", () => ({ default: mockSendAttachmentsQueue }));

jest.unstable_mockModule("../../../services/googleServices.js", () => ({
  configureOAuth: jest.fn().mockResolvedValue(mockGmail),
  makeBody: jest.fn().mockResolvedValue("base64url-body"),
}));

const { default: sendRouter } = await import("../../../router/send/sendRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/email", sendRouter]);

describe("POST /email/create-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 and queues draft jobs", async () => {
    const res = await request(app)
      .post("/email/create-draft")
      .send({
        professorData: [{ id: 1, email: "p@e.com", name: "Prof", dynamicFields: {} }],
        baseBody: { snippetId: "s1", fromName: "S", fromEmail: "s@e.com" },
      });
    expect(res.status).toBe(200);
    expect(mockDraftQueue.addBulk).toHaveBeenCalled();
  });

  it("returns 400 when professorData exceeds 5", async () => {
    const profs = Array(6).fill({ id: 1, email: "p@e.com", name: "Prof", dynamicFields: {} });
    const res = await request(app)
      .post("/email/create-draft")
      .send({ professorData: profs, baseBody: {} });
    expect(res.status).toBe(400);
  });
});

describe("POST /email/create-variableless-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 and queues jobs", async () => {
    const res = await request(app)
      .post("/email/create-variableless-draft")
      .send({
        html: "<p>Hi</p>",
        subject: "Hello",
        baseBody: {},
        professorData: [{ id: 1, email: "p@e.com", name: "Prof" }],
      });
    expect(res.status).toBe(200);
    expect(mockVariablelessQueue.addBulk).toHaveBeenCalled();
  });

  it("returns 400 when professorData exceeds 5", async () => {
    const profs = Array(6).fill({ id: 1, email: "p@e.com", name: "Prof" });
    const res = await request(app)
      .post("/email/create-variableless-draft")
      .send({ html: "<p>Hi</p>", subject: "Hi", baseBody: {}, professorData: profs });
    expect(res.status).toBe(400);
  });
});

describe("POST /email/send-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 and queues send jobs", async () => {
    const res = await request(app)
      .post("/email/send-draft")
      .send({
        userEmail: "s@e.com",
        userName: "Student",
        labelId: "L1",
        professorData: [{ professor_id: 1, email: "p@e.com", name: "Prof", id: "e1" }],
      });
    expect(res.status).toBe(200);
    expect(mockSendQueue.addBulk).toHaveBeenCalled();
  });

  it("returns 400 when professorData exceeds 5", async () => {
    const profs = Array(6).fill({ professor_id: 1, email: "p@e.com", name: "P", id: "e1" });
    const res = await request(app)
      .post("/email/send-draft")
      .send({ userEmail: "s@e.com", userName: "S", labelId: "L1", professorData: profs });
    expect(res.status).toBe(400);
  });
});

describe("POST /email/send-attachments-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with valid request", async () => {
    const res = await request(app)
      .post("/email/send-attachments-draft")
      .send({
        userEmail: "s@e.com",
        userName: "Student",
        labelId: "L1",
        sendResume: true,
        sendTranscript: false,
        professorData: [{ professor_id: 1, email: "p@e.com", name: "Prof", id: "e1" }],
      });
    expect(res.status).toBe(200);
  });

  it("returns 400 when sendResume is not boolean", async () => {
    const res = await request(app)
      .post("/email/send-attachments-draft")
      .send({
        userEmail: "s@e.com",
        userName: "Student",
        labelId: "L1",
        sendResume: "yes",
        sendTranscript: false,
        professorData: [{ professor_id: 1, email: "p@e.com", name: "Prof", id: "e1" }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing or invalid required fields");
  });

  it("returns 400 when exceeds 5 professors", async () => {
    const profs = Array(6).fill({ professor_id: 1, email: "p@e.com", name: "P", id: "e1" });
    const res = await request(app)
      .post("/email/send-attachments-draft")
      .send({
        userEmail: "s@e.com", userName: "S", labelId: "L1",
        sendResume: true, sendTranscript: false, professorData: profs,
      });
    expect(res.status).toBe(400);
  });
});

describe("GET /email/get-drafts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: [{ id: 1 }], error: null });
  });

  it("returns 200 with drafts data", async () => {
    const res = await request(app).get("/email/get-drafts");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("returns 400 on fetch error", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).get("/email/get-drafts");
    expect(res.status).toBe(400);
  });
});

describe("GET /email/get-singular-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with parsed draft", async () => {
    const res = await request(app).get("/email/get-singular-draft?draftId=draft-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("subject");
  });

  it("returns 500 on Gmail error", async () => {
    const googleServices = await import("../../../services/googleServices.js");
    googleServices.configureOAuth.mockRejectedValueOnce(new Error("err"));
    const res = await request(app).get("/email/get-singular-draft?draftId=draft-1");
    expect(res.status).toBe(500);
  });
});

describe("PUT /email/update-draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 on success", async () => {
    const res = await request(app)
      .put("/email/update-draft?draftId=draft-1")
      .send({ to: "p@e.com", fromEmail: "s@e.com", fromName: "S", subject: "Sub", body: "<p>Hi</p>" });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
  });

  it("returns 500 on error", async () => {
    const googleServices = await import("../../../services/googleServices.js");
    googleServices.configureOAuth.mockRejectedValueOnce(new Error("err"));
    const res = await request(app)
      .put("/email/update-draft?draftId=draft-1")
      .send({ to: "p@e.com", fromEmail: "s@e.com", fromName: "S", subject: "Sub", body: "<p>Hi</p>" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /email/delete-draft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on successful delete", async () => {
    const res = await request(app).delete("/email/delete-draft?draftId=draft-1");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Deleted Successfully");
  });

  it("returns 400 when DB delete fails", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "err" } });
    const res = await request(app).delete("/email/delete-draft?draftId=draft-1");
    expect(res.status).toBe(400);
  });

  it("returns 500 when Gmail delete throws", async () => {
    const googleServices = await import("../../../services/googleServices.js");
    googleServices.configureOAuth.mockRejectedValueOnce(new Error("err"));
    const res = await request(app).delete("/email/delete-draft?draftId=draft-1");
    expect(res.status).toBe(500);
  });
});
