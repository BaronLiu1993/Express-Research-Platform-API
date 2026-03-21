import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import "../../../tests/setup/globalSetup.js";

// Mock all external dependencies
const mockGmail = {
  users: {
    drafts: {
      create: jest.fn().mockResolvedValue({
        data: { id: "draft-1", message: { threadId: "thread-1" } },
      }),
      get: jest.fn().mockResolvedValue({
        data: {
          id: "draft-1",
          message: {
            payload: {
              parts: [
                {},
                { body: { data: Buffer.from("<p>Hello</p>").toString("base64url") } },
              ],
              headers: [
                { name: "Subject", value: "Test Subject" },
                { name: "Message-Id", value: "<msg-id@gmail.com>" },
              ],
            },
          },
        },
      }),
      update: jest.fn().mockResolvedValue({}),
      send: jest.fn().mockResolvedValue({
        data: { id: "sent-1", threadId: "thread-1" },
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    messages: {
      get: jest.fn().mockResolvedValue({
        data: {
          payload: {
            headers: [{ name: "Message-Id", value: "<orig-msg@gmail.com>" }],
          },
        },
      }),
      send: jest.fn().mockResolvedValue({
        data: { id: "reply-1", threadId: "thread-1" },
      }),
      modify: jest.fn().mockResolvedValue({}),
    },
  },
};

jest.unstable_mockModule("googleapis", () => ({
  google: {
    auth: { OAuth2: jest.fn().mockReturnValue({ setCredentials: jest.fn(), getAccessToken: jest.fn().mockResolvedValue({ token: "tok" }) }) },
    gmail: jest.fn().mockReturnValue(mockGmail),
    drive: jest.fn().mockReturnValue({}),
  },
}));

jest.unstable_mockModule("@supabase/supabase-js", () => {
  const chain = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  chain.single.mockResolvedValue({ data: null, error: null });
  chain.then = (resolve) => resolve({ data: null, error: null });

  return {
    createClient: jest.fn().mockReturnValue({
      from: chain.from,
      auth: { getUser: jest.fn() },
      _chain: chain,
    }),
    __chain: chain,
  };
});

jest.unstable_mockModule("../../../services/googleServices.js", () => ({
  configureOAuth: jest.fn().mockResolvedValue(mockGmail),
  makeBody: jest.fn().mockResolvedValue("base64url-encoded-body"),
  makeReplyBody: jest.fn().mockResolvedValue("base64url-reply-body"),
}));

jest.unstable_mockModule("../../../services/storageServices.js", () => ({
  generateGetPresignedURL: jest.fn().mockResolvedValue({ signedUrl: "https://storage.com/file" }),
}));

jest.unstable_mockModule("../../../services/authServices.js", () => ({
  encryptToken: jest.fn((t) => `encrypted-${t}`),
  decryptToken: jest.fn((t) => `decrypted-${t}`),
}));

jest.unstable_mockModule("uuid", () => ({
  v4: jest.fn().mockReturnValue("test-uuid-1234"),
}));

const {
  generateDraftFromSnippetEmail,
  generateDraftEmail,
  sendSnippetEmail,
  sendSnippetEmailWithAttachments,
  sendReply,
} = await import("../../../services/emailServices.js");

const supabaseModule = await import("@supabase/supabase-js");
const googleServicesModule = await import("../../../services/googleServices.js");

describe("generateDraftFromSnippetEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the chain mocks
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) {
        fn.mockReturnValue(chain);
      }
    });
    chain.single.mockResolvedValue({ data: null, error: null });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns Missing Inputs when snippetId is missing", async () => {
    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: { to: "prof@example.com", fromName: "Student", fromEmail: "s@e.com", toName: "Prof" },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Missing Inputs", completed: false });
  });

  it("returns Missing Inputs when to is missing", async () => {
    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: { snippetId: "snip-1", fromName: "Student", fromEmail: "s@e.com", toName: "Prof" },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Missing Inputs", completed: false });
  });

  it("returns snippet error when snippet fetch fails", async () => {
    const chain = supabaseModule.__chain;
    chain.single
      .mockResolvedValueOnce({ data: { snippet_html: "<p>Hi</p>", snippet_subject: "Sub" }, error: { message: "err" } });

    googleServicesModule.configureOAuth.mockResolvedValueOnce(mockGmail);

    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: { snippetId: "snip-1", to: "prof@e.com", fromName: "S", fromEmail: "s@e.com", toName: "P", dynamicFields: {} },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Snippet Error", completed: false });
  });

  it("returns success when all inputs are valid", async () => {
    const chain = supabaseModule.__chain;
    // First single() call: snippet fetch
    chain.single.mockResolvedValueOnce({
      data: { snippet_html: "<p>Hi {{name}}</p>", snippet_subject: "Hello {{name}}" },
      error: null,
    });
    // After insert, the chain.then resolves
    chain.then = (resolve) => resolve({ data: null, error: null });

    mockGmail.users.drafts.create.mockResolvedValueOnce({
      data: { id: "draft-1", message: { threadId: "thread-1" } },
    });

    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: {
        snippetId: "snip-1",
        to: "prof@e.com",
        fromName: "Student",
        fromEmail: "s@e.com",
        toName: "Professor",
        dynamicFields: { name: "Prof Smith" },
      },
      accessToken: "token",
    });
    expect(result.completed).toBe(true);
  });
});

describe("generateDraftEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.single.mockResolvedValue({ data: null, error: null });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns Missing Inputs when required fields are missing", async () => {
    const result = await generateDraftEmail({
      userId: "user-1",
      professorId: 1,
      body: { to: "prof@e.com" },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Missing Inputs", completed: false });
  });

  it("returns success with all valid inputs", async () => {
    mockGmail.users.drafts.create.mockResolvedValueOnce({
      data: { id: "draft-2", message: { threadId: "thread-2" } },
    });

    const result = await generateDraftEmail({
      userId: "user-1",
      professorId: 1,
      body: {
        to: "prof@e.com",
        fromName: "Student",
        fromEmail: "s@e.com",
        toName: "Prof",
        html: "<p>Hello</p>",
        subject: "Research",
      },
      accessToken: "token",
    });
    expect(result.completed).toBe(true);
  });
});

describe("sendSnippetEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.single.mockResolvedValue({
      data: { draft_id: "draft-1", tracking_id: "track-1" },
      error: null,
    });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("throws when required inputs are missing", async () => {
    await expect(
      sendSnippetEmail({ userId: "u", body: { professorId: 1 } })
    ).rejects.toThrow("Missing required inputs");
  });

  it("returns success on valid send", async () => {
    const result = await sendSnippetEmail({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
    });
    expect(result.message).toBe("Successfully Sent!");
  });
});

describe("sendSnippetEmailWithAttachments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.single.mockResolvedValue({
      data: { draft_id: "draft-1", tracking_id: "track-1", resume: "resume.pdf", resume_path: "user1-resume", transcript: "transcript.pdf", transcript_path: "user1-transcript" },
      error: null,
    });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("throws when required inputs are missing", async () => {
    await expect(
      sendSnippetEmailWithAttachments({ userId: "u", body: { professorId: 1 } })
    ).rejects.toThrow("Missing required inputs");
  });

  it("returns success with resume attachment", async () => {
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: true,
      sendTranscript: false,
    });
    expect(result.message).toBe("Successfully Sent!");
  });

  it("returns success with both resume and transcript", async () => {
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: true,
      sendTranscript: true,
    });
    expect(result.message).toBe("Successfully Sent!");
  });

  it("returns error when neither resume nor transcript selected", async () => {
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: false,
      sendTranscript: false,
    });
    expect(result.message).toBe("Internal Server Error");
  });

  it("returns error when resume selected but not found in profile", async () => {
    const chain = supabaseModule.__chain;
    chain.single
      .mockResolvedValueOnce({ data: { draft_id: "d1", tracking_id: "t1" }, error: null })
      .mockResolvedValueOnce({ data: { resume: null, resume_path: null, transcript: null, transcript_path: null }, error: null });
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: true,
      sendTranscript: false,
    });
    expect(result.message).toBe("Internal Server Error");
  });

  it("returns error when draft fetch fails", async () => {
    const chain = supabaseModule.__chain;
    chain.single
      .mockResolvedValueOnce({ data: null, error: { message: "draft not found" } })
      .mockResolvedValueOnce({ data: { resume: "r.pdf", resume_path: "p", transcript: null, transcript_path: null }, error: null });
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: false,
      sendTranscript: false,
    });
    expect(result.message).toBe("Internal Server Error");
  });

  it("returns error when file fetch errors", async () => {
    const chain = supabaseModule.__chain;
    chain.single
      .mockResolvedValueOnce({ data: { draft_id: "d1", tracking_id: "t1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "file error" } });
    const result = await sendSnippetEmailWithAttachments({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
      sendResume: true,
      sendTranscript: false,
    });
    expect(result.message).toBe("Internal Server Error");
  });
});

describe("sendSnippetEmail edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns Internal Server Error when draft fetch fails", async () => {
    const chain = supabaseModule.__chain;
    chain.single.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const result = await sendSnippetEmail({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
    });
    expect(result.message).toBe("Internal Server Error");
  });

  it("returns Internal Server Error when Gmail draft get fails", async () => {
    const chain = supabaseModule.__chain;
    chain.single.mockResolvedValueOnce({
      data: { draft_id: "draft-1", tracking_id: "track-1" },
      error: null,
    });
    mockGmail.users.drafts.get.mockRejectedValueOnce(new Error("Gmail error"));
    const result = await sendSnippetEmail({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      body: { professorId: 1, professorEmail: "p@e.com", professorName: "Prof", id: "email-1" },
      accessToken: "token",
      labelId: "Label_1",
    });
    expect(result.message).toBe("Internal Server Error");
  });
});

describe("generateDraftFromSnippetEmail edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.single.mockResolvedValue({ data: null, error: null });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns Insertion Error when DB insert fails but draft was created", async () => {
    const chain = supabaseModule.__chain;
    chain.single.mockResolvedValueOnce({
      data: { snippet_html: "<p>Hi</p>", snippet_subject: "Sub" },
      error: null,
    });
    chain.then = (resolve) => resolve({ data: null, error: { message: "insert err" } });

    mockGmail.users.drafts.create.mockResolvedValueOnce({
      data: { id: "draft-1", message: { threadId: "thread-1" } },
    });

    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: { snippetId: "s1", to: "p@e.com", fromName: "S", fromEmail: "s@e.com", toName: "P", dynamicFields: {} },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Insertion Error", completed: true });
  });

  it("returns Failed to create draft when Gmail throws", async () => {
    const chain = supabaseModule.__chain;
    chain.single.mockResolvedValueOnce({
      data: { snippet_html: "<p>Hi</p>", snippet_subject: "Sub" },
      error: null,
    });
    googleServicesModule.configureOAuth.mockRejectedValueOnce(new Error("OAuth error"));

    const result = await generateDraftFromSnippetEmail({
      userId: "user-1",
      professorId: 1,
      body: { snippetId: "s1", to: "p@e.com", fromName: "S", fromEmail: "s@e.com", toName: "P", dynamicFields: {} },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Failed to create draft", completed: false });
  });
});

describe("generateDraftEmail edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.single.mockResolvedValue({ data: null, error: null });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns Insertion Error when insert fails", async () => {
    const chain = supabaseModule.__chain;
    chain.then = (resolve) => resolve({ data: null, error: { message: "insert err" } });
    mockGmail.users.drafts.create.mockResolvedValueOnce({
      data: { id: "draft-2", message: { threadId: "thread-2" } },
    });

    const result = await generateDraftEmail({
      userId: "user-1",
      professorId: 1,
      body: { to: "p@e.com", fromName: "S", fromEmail: "s@e.com", toName: "P", html: "<p>Hi</p>", subject: "Sub" },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Insertion Error", completed: true });
  });

  it("returns Failed to create draft when configureOAuth throws", async () => {
    googleServicesModule.configureOAuth.mockRejectedValueOnce(new Error("fail"));
    const result = await generateDraftEmail({
      userId: "user-1",
      professorId: 1,
      body: { to: "p@e.com", fromName: "S", fromEmail: "s@e.com", toName: "P", html: "<p>Hi</p>", subject: "Sub" },
      accessToken: "token",
    });
    expect(result).toEqual({ message: "Failed to create draft", completed: false });
  });
});

describe("sendReply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain = supabaseModule.__chain;
    Object.values(chain).forEach((fn) => {
      if (typeof fn === "function" && fn.mockReturnValue) fn.mockReturnValue(chain);
    });
    chain.then = (resolve) => resolve({ data: null, error: null });
  });

  it("returns success on valid reply", async () => {
    const result = await sendReply({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      professorEmail: "p@e.com",
      professorName: "Prof",
      body: "<p>Reply body</p>",
      subject: "Re: Research",
      accessToken: "token",
      messageId: "msg-1",
      threadId: "thread-1",
    });
    expect(result.success).toBe(true);
    expect(result.message).toBe("Successfully Sent!");
  });

  it("returns failure when gmail send fails", async () => {
    mockGmail.users.messages.send.mockRejectedValueOnce(new Error("Gmail error"));
    const result = await sendReply({
      userId: "user-1",
      userEmail: "s@e.com",
      userName: "Student",
      professorEmail: "p@e.com",
      professorName: "Prof",
      body: "<p>Reply</p>",
      subject: "Re: Test",
      accessToken: "token",
      messageId: "msg-1",
      threadId: "thread-1",
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Internal Server Error");
  });
});
