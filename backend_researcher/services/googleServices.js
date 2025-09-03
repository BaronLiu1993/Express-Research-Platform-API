import MailComposer from "nodemailer/lib/mail-composer/index.js";

export async function getDriveFileBuffer(fileId, drive) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

export async function extractHtmlOrPlainText(payload) {

  if (
    (payload.mimeType === "text/html" || payload.mimeType === "text/plain") &&
    payload.body?.data
  ) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const result = getLatestReply(part);
      if (result) return result;
    }
  }

  return null;
}

export async function makeReplyBody({
  to,
  from,
  name,
  subject,
  html,
  inReplyToMessageId,
  attachments = [],
}) {
  const formattedFrom = name ? `"${name}" <${from}>` : from;

  const headers = {};
  if (inReplyToMessageId) {
    headers["In-Reply-To"] = inReplyToMessageId;
    headers["References"] = inReplyToMessageId;
  }

  const mail = new MailComposer({
    to,
    from: formattedFrom,
    subject,
    html,
    text: "",
    attachments,
    headers,
  });

  return new Promise((resolve, reject) => {
    mail.compile().build((err, message) => {
      if (err) return reject(err);

      const encodedMessage = message
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      resolve(encodedMessage);
    });
  });
}

export async function makeBody({
  to,
  from,
  name,
  subject,
  html,
  attachments = [],
}) {
  const formattedFrom = name ? `"${name}" <${from}>` : from;

  const mail = new MailComposer({
    to,
    from: formattedFrom,
    subject,
    html,
    text: "",
    attachments,
  });

  return new Promise((resolve, reject) => {
    mail.compile().build((err, message) => {
      if (err) return reject(err);

      const encodedMessage = message
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      resolve(encodedMessage);
    });
  });
}

export function decodeBody(encoded) {
  let padded = encoded;
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  padded = padded.replace(/-/g, "+").replace(/_/g, "/");
  const buffer = Buffer.from(padded, "base64");
  return buffer.toString("utf-8");
}

