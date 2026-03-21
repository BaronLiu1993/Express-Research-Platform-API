import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

const mockSendWithAttachments = jest.fn().mockResolvedValue({ message: "Successfully Sent!" });
let workerProcessor;

jest.unstable_mockModule("../../../services/emailServices.js", () => ({
  sendSnippetEmailWithAttachments: mockSendWithAttachments,
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

await import("../../../queue/sendAttachments/sendAttachmentsWorker.js");

describe("sendAttachmentsWorker processor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls sendSnippetEmailWithAttachments with job data", async () => {
    const job = {
      id: "j1",
      data: {
        userId: "u1", userEmail: "s@e.com", userName: "S",
        body: { professorId: 1 }, accessToken: "t", labelId: "L1",
        sendResume: true, sendTranscript: false,
      },
    };
    await workerProcessor(job);
    expect(mockSendWithAttachments).toHaveBeenCalledWith({
      userId: "u1", userEmail: "s@e.com", userName: "S",
      body: { professorId: 1 }, accessToken: "t", labelId: "L1",
      sendResume: true, sendTranscript: false,
    });
  });

  it("throws on service error", async () => {
    mockSendWithAttachments.mockRejectedValueOnce(new Error("fail"));
    const job = {
      id: "j2",
      data: { userId: "u1", userEmail: "s", userName: "S", body: {}, accessToken: "t", labelId: "L", sendResume: false, sendTranscript: false },
    };
    await expect(workerProcessor(job)).rejects.toThrow("fail");
  });
});
