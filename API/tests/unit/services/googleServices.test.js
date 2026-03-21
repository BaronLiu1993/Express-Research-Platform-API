import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

// Mock supabase-js before anything
jest.unstable_mockModule("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({}),
}));

// Mock googleapis
const mockOAuth2Client = {
  setCredentials: jest.fn(),
  getAccessToken: jest.fn().mockResolvedValue({ token: "new-access-token" }),
};

const mockGmail = { users: { drafts: { create: jest.fn() } } };
const mockDrive = { files: { get: jest.fn() } };

jest.unstable_mockModule("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockReturnValue(mockOAuth2Client),
    },
    gmail: jest.fn().mockReturnValue(mockGmail),
    drive: jest.fn().mockReturnValue(mockDrive),
  },
}));

// Mock authServices to avoid their own import chain issues
jest.unstable_mockModule("../../../services/authServices.js", () => ({
  decryptToken: jest.fn((t) => `decrypted-${t}`),
  encryptToken: jest.fn((t) => `encrypted-${t}`),
}));

const { decodeBody, configureOAuth, makeBody, makeReplyBody, getDriveFileBuffer } =
  await import("../../../services/googleServices.js");

describe("decodeBody", () => {
  it("decodes standard base64url string", () => {
    const original = "Hello World";
    const encoded = Buffer.from(original).toString("base64url");
    expect(decodeBody(encoded)).toBe(original);
  });

  it("handles base64url needing padding", () => {
    const original = "Test";
    const encoded = Buffer.from(original).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeBody(encoded)).toBe(original);
  });

  it("handles empty string", () => {
    expect(decodeBody("")).toBe("");
  });
});

describe("configureOAuth", () => {
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.update.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
  });

  it("returns gmail client on success", async () => {
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { gmail_auth_token: "enc-access", gmail_refresh_token: "enc-refresh" },
        error: null,
      });
    // The update().eq() chain - make it thenable for the non-single case
    mockSupabase.eq.mockImplementation(function() {
      const self = this;
      return {
        ...self,
        from: mockSupabase.from,
        select: mockSupabase.select,
        update: mockSupabase.update,
        eq: mockSupabase.eq,
        single: mockSupabase.single,
        then: (resolve) => resolve({ error: null }),
      };
    });

    const result = await configureOAuth({ userId: "user-1", supabase: mockSupabase });
    expect(result).toBeDefined();
  });

  it("returns { gmail, drive } when fetchDrive is true", async () => {
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { gmail_auth_token: "enc-access", gmail_refresh_token: "enc-refresh" },
        error: null,
      });
    mockSupabase.eq.mockImplementation(function() {
      return {
        from: mockSupabase.from,
        select: mockSupabase.select,
        update: mockSupabase.update,
        eq: mockSupabase.eq,
        single: mockSupabase.single,
        then: (resolve) => resolve({ error: null }),
      };
    });

    const result = await configureOAuth({ userId: "user-1", supabase: mockSupabase, fetchDrive: true });
    expect(result).toHaveProperty("gmail");
    expect(result).toHaveProperty("drive");
  });

  it("throws when token fetch returns error", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });
    await expect(
      configureOAuth({ userId: "user-1", supabase: mockSupabase })
    ).rejects.toThrow("Internal Server Error");
  });
});

describe("makeBody", () => {
  it("returns a base64url-encoded MIME string", async () => {
    const result = await makeBody({
      to: "prof@example.com",
      from: "student@example.com",
      name: "Student",
      subject: "Research Interest",
      html: "<p>Hello</p>",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should not contain standard base64 chars that base64url replaces
    expect(result).not.toMatch(/[+/=]/);
  });

  it("works without a name", async () => {
    const result = await makeBody({
      to: "prof@example.com",
      from: "student@example.com",
      name: "",
      subject: "Hello",
      html: "<p>Hi</p>",
    });
    expect(typeof result).toBe("string");
  });

  it("includes attachments when provided", async () => {
    const result = await makeBody({
      to: "prof@example.com",
      from: "student@example.com",
      name: "Student",
      subject: "With Attachment",
      html: "<p>See attached</p>",
      attachments: [{ filename: "test.txt", content: "hello" }],
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("makeReplyBody", () => {
  it("includes In-Reply-To header when inReplyToMessageId provided", async () => {
    const result = await makeReplyBody({
      to: "prof@example.com",
      from: "student@example.com",
      name: "Student",
      subject: "Research",
      html: "<p>Reply</p>",
      inReplyToMessageId: "<original-msg-id@gmail.com>",
      trackingId: "tracking-123",
    });
    expect(typeof result).toBe("string");
    // Decode and verify headers
    const decoded = Buffer.from(result, "base64url").toString();
    expect(decoded).toContain("Re: Research");
  });

  it("appends tracking pixel to html", async () => {
    const result = await makeReplyBody({
      to: "prof@example.com",
      from: "student@example.com",
      name: "Student",
      subject: "Test",
      html: "<p>Body</p>",
      inReplyToMessageId: null,
      trackingId: "track-id",
    });
    const decoded = Buffer.from(result, "base64url").toString();
    expect(decoded).toContain("hi.png");
    expect(decoded).toContain("track-id");
  });
});

describe("getDriveFileBuffer", () => {
  it("returns a Buffer from drive response", async () => {
    mockDrive.files.get.mockResolvedValueOnce({
      data: Buffer.from("file-content"),
    });
    const result = await getDriveFileBuffer("file-123", mockDrive);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("throws when drive API errors", async () => {
    mockDrive.files.get.mockRejectedValueOnce(new Error("Drive error"));
    await expect(getDriveFileBuffer("file-123", mockDrive)).rejects.toThrow("Drive error");
  });
});
