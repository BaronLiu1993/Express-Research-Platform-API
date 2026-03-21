import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

const mockStorage = {
  createSignedUploadUrl: jest.fn(),
  createSignedUrl: jest.fn(),
  remove: jest.fn(),
};

jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    storage: {
      from: jest.fn().mockReturnValue(mockStorage),
    },
  }),
}));

const { generateUploadPresignedURL, generateGetPresignedURL, deleteFile } =
  await import("../../../services/storageServices.js");

describe("generateUploadPresignedURL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns data on success", async () => {
    mockStorage.createSignedUploadUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://example.com/upload", token: "tok" },
      error: null,
    });
    const result = await generateUploadPresignedURL({
      userId: "user-1",
      fileName: "resume",
      fileType: "resume",
    });
    expect(result.signedUrl).toBe("https://example.com/upload");
  });

  it("throws when userId is missing", async () => {
    await expect(
      generateUploadPresignedURL({ fileName: "file", fileType: "resume" })
    ).rejects.toThrow("Internal Server Error");
  });

  it("throws when fileName is missing", async () => {
    await expect(
      generateUploadPresignedURL({ userId: "user-1", fileType: "resume" })
    ).rejects.toThrow("Internal Server Error");
  });

  it("throws when storage returns error", async () => {
    mockStorage.createSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "bucket not found" },
    });
    await expect(
      generateUploadPresignedURL({ userId: "u", fileName: "f", fileType: "t" })
    ).rejects.toThrow("Internal Server Error");
  });
});

describe("generateGetPresignedURL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns data on success", async () => {
    mockStorage.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://example.com/download" },
      error: null,
    });
    const result = await generateGetPresignedURL({
      userId: "user-1",
      fileType: "resume",
      fileName: "myfile",
    });
    expect(result.signedUrl).toBe("https://example.com/download");
  });

  it("throws when params are missing", async () => {
    await expect(
      generateGetPresignedURL({ userId: "user-1" })
    ).rejects.toThrow("Internal Server Error");
  });

  it("throws when storage returns error", async () => {
    mockStorage.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });
    await expect(
      generateGetPresignedURL({ userId: "u", fileType: "t", fileName: "f" })
    ).rejects.toThrow("Internal Server Error");
  });
});

describe("deleteFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("succeeds without error", async () => {
    mockStorage.remove.mockResolvedValueOnce({ error: null });
    await expect(
      deleteFile({ userId: "user-1", fileType: "resume", fileName: "myfile" })
    ).resolves.toBeUndefined();
  });

  it("throws when params are missing", async () => {
    await expect(deleteFile({ userId: "user-1" })).rejects.toThrow("Internal Server Error");
  });

  it("throws when storage remove returns error", async () => {
    mockStorage.remove.mockResolvedValueOnce({
      error: { message: "delete failed" },
    });
    await expect(
      deleteFile({ userId: "u", fileType: "t", fileName: "f" })
    ).rejects.toThrow("Internal Server Error");
  });
});
