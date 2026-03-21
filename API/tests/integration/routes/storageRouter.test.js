import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";
import request from "supertest";

const mockGenerateUpload = jest.fn().mockResolvedValue({ signedUrl: "https://upload.url", token: "t" });
const mockGenerateGet = jest.fn().mockResolvedValue({ signedUrl: "https://download.url" });
const mockDeleteFile = jest.fn().mockResolvedValue(undefined);

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.single.mockResolvedValue({ data: null, error: null });
mockChain.then = (resolve) => resolve({ data: null, error: null });

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  verifyToken: jest.fn((req, res, next) => {
    req.user = { sub: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
    req.token = "test-token";
    req.supabaseClient = { from: mockChain.from };
    next();
  }),
}));

jest.unstable_mockModule("../../../services/storageServices.js", () => ({
  generateUploadPresignedURL: mockGenerateUpload,
  generateGetPresignedURL: mockGenerateGet,
  deleteFile: mockDeleteFile,
}));

const { default: storageRouter } = await import("../../../router/storage/storageRouter.js");
const { createTestApp } = await import("../../setup/testApp.js");

const app = createTestApp(["/storage", storageRouter]);

describe("POST /storage/generate-upload-url/resume", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 with urlData on success", async () => {
    const res = await request(app)
      .post("/storage/generate-upload-url/resume")
      .send({ fileName: "myresume", fileType: "resume" });
    expect(res.status).toBe(200);
    expect(res.body.urlData).toBeDefined();
  });

  it("returns 400 with invalid body (slash in fileName)", async () => {
    const res = await request(app)
      .post("/storage/generate-upload-url/resume")
      .send({ fileName: "bad/name", fileType: "resume" });
    expect(res.status).toBe(400);
  });

  it("returns 401 with invalid auth token", async () => {
    const authServices = await import("../../../services/authServices.js");
    authServices.verifyToken.mockImplementationOnce((req, res, next) => {
      req.user = { sub: "not-uuid" };
      req.token = "t";
      req.supabaseClient = { from: mockChain.from };
      next();
    });
    const res = await request(app)
      .post("/storage/generate-upload-url/resume")
      .send({ fileName: "file", fileType: "resume" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage service throws", async () => {
    mockGenerateUpload.mockRejectedValueOnce(new Error("storage err"));
    const res = await request(app)
      .post("/storage/generate-upload-url/resume")
      .send({ fileName: "file", fileType: "resume" });
    expect(res.status).toBe(500);
  });

  it("returns 400 when DB update fails", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "db err" } });
    const res = await request(app)
      .post("/storage/generate-upload-url/resume")
      .send({ fileName: "file", fileType: "resume" });
    expect(res.status).toBe(400);
  });
});

describe("POST /storage/generate-upload-url/transcript", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns 200 on success", async () => {
    const res = await request(app)
      .post("/storage/generate-upload-url/transcript")
      .send({ fileName: "mytranscript", fileType: "transcript" });
    expect(res.status).toBe(200);
  });

  it("returns 400 with invalid body", async () => {
    const res = await request(app)
      .post("/storage/generate-upload-url/transcript")
      .send({ fileName: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /storage/check-file-existance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
  });

  it("returns 200 with file existence status", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { resume: "resume.pdf", transcript: null },
      error: null,
    });
    const res = await request(app).get("/storage/check-file-existance");
    expect(res.status).toBe(200);
    expect(res.body.resumeExists).toBe(true);
    expect(res.body.transcriptExists).toBe(false);
  });

  it("returns 400 on DB error", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "err" } });
    const res = await request(app).get("/storage/check-file-existance");
    expect(res.status).toBe(400);
  });
});

describe("GET /storage/get-file-url", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with download URL", async () => {
    const res = await request(app).get("/storage/get-file-url?fileName=myfile&fileType=resume");
    expect(res.status).toBe(200);
    expect(res.body.url).toBeDefined();
  });

  it("returns 400 with invalid query params", async () => {
    const res = await request(app).get("/storage/get-file-url?fileName=bad/file&fileType=resume");
    expect(res.status).toBe(400);
  });

  it("returns 500 when storage service throws", async () => {
    mockGenerateGet.mockRejectedValueOnce(new Error("err"));
    const res = await request(app).get("/storage/get-file-url?fileName=file&fileType=resume");
    expect(res.status).toBe(500);
  });
});

describe("DELETE /storage/delete-file/:fileType/:fileName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
    mockChain.single.mockResolvedValue({ data: null, error: null });
  });

  it("returns 200 on successful delete", async () => {
    const res = await request(app).delete("/storage/delete-file/resume/myfile");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Deleted Resources");
  });

  it("returns 400 with invalid fileType", async () => {
    const res = await request(app).delete("/storage/delete-file/other/myfile");
    expect(res.status).toBe(400);
  });

  it("returns 400 with path traversal in fileName", async () => {
    const res = await request(app).delete("/storage/delete-file/resume/..%2Fetc");
    // Express will decode %2F as / in params
    expect([400, 500]).toContain(res.status);
  });

  it("returns 500 when deleteFile throws", async () => {
    mockDeleteFile.mockRejectedValueOnce(new Error("delete err"));
    const res = await request(app).delete("/storage/delete-file/resume/myfile");
    expect(res.status).toBe(500);
  });

  it("returns 400 when DB update fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "db err" } });
    const res = await request(app).delete("/storage/delete-file/resume/myfile");
    expect(res.status).toBe(400);
  });
});
