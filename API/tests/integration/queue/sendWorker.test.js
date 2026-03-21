import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

const mockSendSnippetEmail = jest.fn().mockResolvedValue({ message: "Successfully Sent!" });
let workerProcessor;

jest.unstable_mockModule("../../../services/emailServices.js", () => ({
  sendSnippetEmail: mockSendSnippetEmail,
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

await import("../../../queue/send/sendWorker.js");

describe("sendWorker processor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls sendSnippetEmail with correct job data", async () => {
    const job = {
      id: "job-1",
      data: {
        userId: "u1", userEmail: "s@e.com", userName: "Student",
        body: { professorId: 1, professorEmail: "p@e.com", id: "e1" },
        accessToken: "tok", labelId: "L1",
      },
    };
    await workerProcessor(job);
    expect(mockSendSnippetEmail).toHaveBeenCalledWith({
      userId: "u1", userEmail: "s@e.com", userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", id: "e1" },
      accessToken: "tok", labelId: "L1",
    });
  });

  it("throws when service function throws", async () => {
    mockSendSnippetEmail.mockRejectedValueOnce(new Error("send failed"));
    const job = {
      id: "job-2",
      data: { userId: "u1", userEmail: "s@e.com", userName: "S", body: {}, accessToken: "t", labelId: "L" },
    };
    await expect(workerProcessor(job)).rejects.toThrow("send failed");
  });
});
