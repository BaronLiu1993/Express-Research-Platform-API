import { jest } from "@jest/globals";

export function createMockGmail() {
  return {
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
        update: jest.fn().mockResolvedValue({ data: { id: "draft-1" } }),
        send: jest.fn().mockResolvedValue({
          data: { id: "sent-msg-1", threadId: "thread-1" },
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      messages: {
        get: jest.fn().mockResolvedValue({
          data: {
            id: "msg-1",
            raw: Buffer.from("Subject: Test\r\n\r\nBody").toString("base64url"),
            payload: {
              headers: [
                { name: "Message-Id", value: "<msg-id@gmail.com>" },
              ],
            },
          },
        }),
        send: jest.fn().mockResolvedValue({
          data: { id: "sent-reply-1", threadId: "thread-1" },
        }),
        modify: jest.fn().mockResolvedValue({ data: {} }),
      },
      threads: {
        get: jest.fn().mockResolvedValue({
          data: {
            messages: [
              {
                id: "msg-1",
                payload: {
                  headers: [
                    { name: "From", value: "prof@example.com" },
                    { name: "Subject", value: "Re: Research" },
                    { name: "Date", value: "2025-01-01" },
                  ],
                },
              },
            ],
          },
        }),
      },
      history: {
        list: jest.fn().mockResolvedValue({
          data: { history: [], historyId: "12345" },
        }),
      },
      watch: jest.fn().mockResolvedValue({
        data: { historyId: "12345", expiration: "9999999999999" },
      }),
      labels: {
        create: jest.fn().mockResolvedValue({
          data: { id: "Label_outreach", name: "[Outreach]" },
        }),
      },
    },
  };
}

export function createMockDrive() {
  return {
    files: {
      get: jest.fn().mockResolvedValue({
        data: Buffer.from("file-content"),
      }),
    },
  };
}

export function setupGoogleApisMock(mockGmail, mockDrive) {
  const gmail = mockGmail || createMockGmail();
  const drive = mockDrive || createMockDrive();

  const mockOAuth2Client = {
    setCredentials: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue({ token: "new-access-token" }),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email_verified: true,
        email: process.env.PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL,
      }),
    }),
  };

  jest.unstable_mockModule("googleapis", () => ({
    google: {
      auth: {
        OAuth2: jest.fn().mockReturnValue(mockOAuth2Client),
      },
      gmail: jest.fn().mockReturnValue(gmail),
      drive: jest.fn().mockReturnValue(drive),
    },
  }));

  jest.unstable_mockModule("google-auth-library", () => ({
    OAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client),
  }));

  return { gmail, drive, mockOAuth2Client };
}
