import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

let workerProcessor;

const mockGmail = {
  users: {
    watch: jest.fn().mockResolvedValue({ data: { historyId: "789" } }),
  },
};

const mockChain = {
  from: jest.fn(),
  update: jest.fn(),
  eq: jest.fn(),
};
Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });
mockChain.then = (resolve) => resolve({ data: null, error: null });

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: mockChain.from,
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

await import("../../../queue/watch/watchWorker.js");

describe("watchWorker processor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refreshes watch successfully", async () => {
    const job = { id: "j1", data: { userId: "u1" } };
    await expect(workerProcessor(job)).resolves.toBeUndefined();
    expect(mockGmail.users.watch).toHaveBeenCalled();
  });

  it("throws when history update fails", async () => {
    mockChain.then = (resolve) => resolve({ data: null, error: { message: "update err" } });
    const job = { id: "j2", data: { userId: "u1" } };
    await expect(workerProcessor(job)).rejects.toThrow();
  });
});
