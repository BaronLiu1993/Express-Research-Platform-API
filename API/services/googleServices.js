import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { decryptToken } from "../services/authServices.js";
import { encryptToken } from "../services/authServices.js";
import { google } from "googleapis";

const BACKEND_API_BASE = process.env.BACKEND_API_BASE;

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

export function decodeBody(encoded) {
  let padded = encoded;
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  padded = padded.replace(/-/g, "+").replace(/_/g, "/");
  const buffer = Buffer.from(padded, "base64");
  return buffer.toString("utf-8");
}

/**export async function configureOAuth({ email, supabase, fetchDrive = false }) {
  try {
    const { data: tokenData, error: tokenError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("student_email", email)
      .single();

    if (tokenError || !tokenData) {
      throw new Error("No tokens found for user");
    }

    const decryptedAccessToken = decryptToken(tokenData.gmail_auth_token);
    const decryptedRefreshToken = decryptToken(tokenData.gmail_refresh_token);

    if (!decryptedRefreshToken) {
      throw new Error("No valid refresh token");
    }

    oauth2Client.setCredentials({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
    });

    const accessTokenResponse = await oauth2Client.getAccessToken();
    const newAccessToken = accessTokenResponse.token;

    const encryptedAccessToken = encryptToken(newAccessToken);
    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .update({ gmail_auth_token: encryptedAccessToken })
      .eq("user_id", userId);

    if (tokenInsertionError) {
      throw new Error("Failed to Insert Token");
    }

    if (fetchDrive) {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      return { gmail, drive };
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    return gmail;
  } catch (err) {
    throw new Error("Internal Server Error");
  }
} */

export async function configureOAuth({ userId, supabase, fetchDrive = false }) {
  try {
    const { data: tokenData, error: tokenError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData) {
      throw new Error("No tokens found for user");
    }

    const decryptedAccessToken = decryptToken(tokenData.gmail_auth_token);
    const decryptedRefreshToken = decryptToken(tokenData.gmail_refresh_token);

    if (!decryptedRefreshToken) {
      throw new Error("No valid refresh token");
    }

    oauth2Client.setCredentials({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
    });

    const accessTokenResponse = await oauth2Client.getAccessToken();
    const newAccessToken = accessTokenResponse.token;

    const encryptedAccessToken = encryptToken(newAccessToken);
    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .update({ gmail_auth_token: encryptedAccessToken })
      .eq("user_id", userId);

    if (tokenInsertionError) {
      throw new Error("Failed to Insert Token");
    }

    if (fetchDrive) {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      return { gmail, drive };
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    return gmail;
  } catch (err) {
    throw new Error("Internal Server Error");
  }
}

export async function getDriveFileBuffer(fileId, drive) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}



export async function makeBody({
  to,
  from,
  name,
  subject,
  html,
  attachments = [],
}) {
  const formattedFrom = name ? `${name} <${from}>` : from;
  const textFallback = html.replace(/<[^>]*>/g, "");
  const mail = new MailComposer({
    to,
    from: formattedFrom,
    subject,
    html,
    text: textFallback,
    attachments
  });

  return new Promise((resolve, reject) => {
    mail.compile().build((err, message) => {
      if (err) {
        return reject(err);
      }

      const encodedMessage = message
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      resolve(encodedMessage);
    });
  });
}

export async function makeReplyBody({
  to,
  from,
  name,
  subject,
  html,
  inReplyToMessageId,
  trackingId,
  attachments = [],
}) {
  const formattedFrom = name ? `${name} <${from}>` : from;
  const headers = {};
  const trackingPixel = `<img src="${BACKEND_API_BASE}/engagement/hi.png?analyticId=${trackingId}" width="1" height="1" style="display:none;" />`;
  const formattedHtml = html + trackingPixel;

  if (inReplyToMessageId) {
    headers["In-Reply-To"] = inReplyToMessageId;
    headers["References"] = inReplyToMessageId;
  }

  const replySubject = `Re: ${subject}`;
  const mail = new MailComposer({
    to,
    from: formattedFrom,
    subject: replySubject,
    html: formattedHtml,
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
