import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

const mockGenerateDraft = jest.fn().mockResolvedValue({ message: "Draft created", completed: true });
let workerProcessor;

jest.unstable_mockModule("../../../services/emailServices.js", () => ({
  generateDraftFromSnippetEmail: mockGenerateDraft,
}));

jest.unstable_mockModule("ioredis", () => ({
  default: jest.fn().mockReturnValue({ on: jest.fn().mockReturnThis() }),
}));

jest.unstable_mockModule("../../../redis/redis.js", () => ({
  Connection: { on: jest.fn().mockReturnThis() },
}));

jest.unstable_mockModule("bullmq", () => ({
  Worker: jest.fn().mockImplementation((name, processor) => {
    workerProcessor = processor;
    return { on: jest.fn().mockReturnThis(), close: jest.fn() };
  }),
  Queue: jest.fn().mockReturnValue({ add: jest.fn(), addBulk: jest.fn() }),
}));

await import("../../../queue/draft/draftWorker.js");

describe("draftWorker processor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls generateDraftFromSnippetEmail with job data", async () => {
    const job = { id: "j1", data: { userId: "u1", professorId: 1, body: { snippetId: "s1" }, accessToken: "t" } };
    await workerProcessor(job);
    expect(mockGenerateDraft).toHaveBeenCalledWith({
      userId: "u1", professorId: 1, body: { snippetId: "s1" }, accessToken: "t",
    });
  });

  it("throws on service error", async () => {
    mockGenerateDraft.mockRejectedValueOnce(new Error("fail"));
    const job = { id: "j2", data: { userId: "u1", professorId: 1, body: {}, accessToken: "t" } };
    await expect(workerProcessor(job)).rejects.toThrow("fail");
  });
});
