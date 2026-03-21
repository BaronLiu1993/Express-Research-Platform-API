import { jest } from "@jest/globals";

export function setupRedisMock() {
  const mockConnection = {
    on: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
    quit: jest.fn(),
  };

  jest.unstable_mockModule("ioredis", () => {
    const IORedis = jest.fn().mockReturnValue(mockConnection);
    IORedis.default = IORedis;
    return { default: IORedis };
  });

  jest.unstable_mockModule("../../redis/redis.js", () => ({
    Connection: mockConnection,
  }));

  return mockConnection;
}


export function setupBullMQMock() {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
    addBulk: jest.fn().mockResolvedValue([{ id: "job-1" }]),
    close: jest.fn(),
    on: jest.fn(),
  };

  const mockWorker = {
    on: jest.fn().mockReturnThis(),
    close: jest.fn(),
  };

  jest.unstable_mockModule("bullmq", () => ({
    Queue: jest.fn().mockReturnValue(mockQueue),
    Worker: jest.fn().mockReturnValue(mockWorker),
  }));

  return { mockQueue, mockWorker };
}
