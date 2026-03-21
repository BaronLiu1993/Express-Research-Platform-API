import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

let workerProcessor;

const mockGmail = {
  users: {
    history: {
      list: jest.fn().mockResolvedValue({ data: { history: [], historyId: "456" } }),
    },
  },
};

const mockChain = {
  from: jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
  rpc: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.single.mockResolvedValue({ data: { user_id: "u1", history_id: "123" }, error: null });
mockChain.rpc.mockResolvedValue({ data: false, error: null });
mockChain.then = (resolve) => resolve({ data: null, error: null });

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: mockChain.from,
    rpc: mockChain.rpc,
  }),
}));

jest.unstable_mockModule("../../../services/googleServices.js", () => ({
  configureOAuth: jest.fn().mockResolvedValue(mockGmail),
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

await import("../../../queue/inbox/inboxWorker.js");

describe("inboxWorker processor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("processes inbox sync job without errors", async () => {
    const job = { id: "j1", data: { historyId: "456", email: "user@e.com" } };
    await expect(workerProcessor(job)).resolves.toBeUndefined();
  });

  it("throws when user profile fetch fails", async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const job = { id: "j2", data: { historyId: "456", email: "bad@e.com" } };
    await expect(workerProcessor(job)).rejects.toThrow();
  });
});
