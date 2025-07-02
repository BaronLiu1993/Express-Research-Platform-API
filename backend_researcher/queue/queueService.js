import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import followUpQueue from "./followUpQueue.js";

//Test only

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

//Gmail OAuth, Getting User Data
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

function makeReplyBody(
  to,
  fromName,
  fromEmail,
  subject,
  htmlMessage,
  inReplyToMessageId = null
) {
  const headers = [
    `To: ${to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ];

  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
    headers.push(`References: ${inReplyToMessageId}`);
  }

  const mimeMessage = [...headers, "", htmlMessage].join("\n");

  return Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function extractHtmlOrPlainText(payload) {
  if (!payload) return null;

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

function makeBody(to, fromName, fromEmail, subject, htmlMessage) {
  const mimeMessage = [
    `To: ${to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    ``,
    `${htmlMessage}`,
  ].join("\n");

  //Encode
  return Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

//Draft Generation

export async function generateDraftFromSnippetEmail({
  userId,
  professorId,
  body,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail } = body;
  const trackingId = uuidv4();
  try {
    // Fetch Gmail Tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData) throw new Error("Missing Gmail tokens");

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    await oauth2Client.getAccessToken();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch Snippet
    const { data: snippetData, error: snippetError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId)
      .single();

    if (snippetError || !snippetData) throw new Error("Snippet not found");

    const snippetHTML = snippetData.snippet_html;
    const snippetSubject = snippetData.snippet_subject;

    const subject = Mustache.render(snippetSubject, dynamicFields);
    const html = Mustache.render(snippetHTML, dynamicFields);

    const raw = makeBody(to, fromName, fromEmail, subject, html);

    // Create Gmail Draft
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
        sent: false,
        type: "draft",
        tracking_id: trackingId,
      },
    ]);

    //move from saved to inprogress now
    const { data: savedData } = await supabase
      .from("Saved")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();

    if (savedData) {
      await supabase.from("InProgress").insert(savedData);
      await supabase
        .from("Saved")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);
    }
    console.log(insertionError);

    return { message: "Draft successfully created" };
  } catch (error) {
    console.error("Draft creation failed:", error);
    return { message: "Failed to create draft" };
  }
}

//Sending Function

export async function sendSnippetEmail({ userId, userEmail, userName, body }) {
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Fetch draft id
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id, tracking_id")
    .eq("user_id", userId)
    .eq("professor_id", body.professorId)
    .eq("type", "draft")
    .single();

  //build tracking pixel
  const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

  const draft = await gmail.users.drafts.get({
    userId: "me",
    id: draftData.draft_id,
  });

  console.log(draft);

  //Parsing the payload and breaking it down
  const payload = draft.data.message.payload;
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const htmlBody = extractHtmlOrPlainText(payload);
  const finalHtmlBody = htmlBody + trackingPixel;

  //Send the draft
  console.log(body.professorEmail);
  const raw = makeBody(
    body.professorEmail,
    userName,
    userEmail,
    subject,
    finalHtmlBody
  );
  // Create Gmail Draft

  await gmail.users.drafts.update({
    userId: "me",
    id: draftData.draft_id,
    requestBody: { message: { raw } },
  });

  const sendResponse = await gmail.users.drafts.send({
    userId: "me",
    requestBody: {
      id: draftData.draft_id,
    },
  });

  console.log(sendResponse);

  const { error: insertionError } = await supabase
    .from("Emails")
    .update({
      sent: true,
      type: "first",
      thread_id: sendResponse.data.threadId,
    })
    .eq("draft_id", draftData.draft_id);

  const { data: inProgressData } = await supabase
    .from("InProgress")
    .select("*")
    .eq("user_id", userId)
    .eq("professor_id", body.professorId)
    .single();

  if (inProgressData) {
    await supabase.from("Completed").insert(inProgressData);
    await supabase
      .from("InProgress")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", body.professorId);
  }

  /*const startTime = DateTime.now()
    .setZone(timeZone)
    .plus({ days: 7 })
    .set({ hour: 12, minute: 0, second: 0 })
    .toISO();
  const endTime = DateTime.fromISO(startTime).plus({ hours: 1 }).toISO();
  const event = {
    summary: eventName,
    description,
    start: { dateTime: startTime, timeZone },
    end: { dateTime: endTime, timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 10 },
        { method: "email", minutes: 15 },
      ],
    },
  };
  await calendar.events.insert({ calendarId: "primary", resource: event }); */

  await supabase.from("Messages").insert({
    thread_id: sendResponse.data.threadId,
    message_id: sendResponse.data.id,
    tracking_id: draftData.tracking_id,
    type: "First",
  });

  return { message: "Successfully Sent!" };
}

//Create The Drafts
export async function createFollowUpEmail({
  userId,
  professorId,
  threadId,
  to,
  fromName,
  fromEmail,
  snippetSubject,
  snippetBody,
  dynamicFields,
  delayMs,
}) {
  console.log("🚀 Starting createFollowUpEmail for:", {
    userId,
    professorId,
    threadId,
    to,
    fromName,
    fromEmail,
    delayMs,
  });

  try {
    const { data: tokenData, error: fetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenData) {
      console.error("❌ Failed to fetch Gmail tokens:", fetchError);
      return;
    }

    console.log("✅ Gmail tokens fetched successfully");

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    await oauth2Client.getAccessToken();
    console.log("🔐 Access token refreshed");

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = thread.data.messages;
    const lastMessage = messages[messages.length - 1];

    console.log(`📩 Fetched thread with ${messages.length} messages`);

    const messageIdHeader = lastMessage.payload.headers.find(
      (h) => h.name === "Message-ID"
    );
    const inReplyTo = messageIdHeader?.value;

    const trackingId = uuidv4();

    const subject = Mustache.render(snippetSubject, dynamicFields);
    const message = Mustache.render(snippetBody, dynamicFields);

    console.log("🧠 Rendered mustache subject and message");

    const raw = makeReplyBody(
      to,
      fromName,
      fromEmail,
      subject,
      message,
      inReplyTo
    );

    console.log("📦 Raw MIME email body generated");

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw, threadId } },
    });

    const draftId = draft.data?.id;

    if (!draftId) {
      console.error("❌ Failed to create Gmail draft");
      return;
    }

    console.log(`✅ Draft created with ID: ${draftId}`);

    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draftId,
        type: "FollowUp",
        tracking_id: trackingId,
      },
    ]);

    if (insertionError) {
      console.error("❌ Error inserting into Emails table:", insertionError);
      return;
    }

    console.log("🗃️ Email metadata saved to Supabase");

    // Queue follow-up job
    await followUpQueue.add(
      "follow-up-email",
      {
        userId,
        draftId,
        trackingId,
      },
      {
        delay: delayMs,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    console.log("📬 Job added to queue with delay:", delayMs);
    return trackingId;
  } catch (err) {
    console.error("🔥 Error in createFollowUpEmail:", err);
  }
}


export async function sendFollowUpEmail({ userId, draftId, trackingId }) {
  console.log(`[FollowUp] Starting sendFollowUpEmail for userId=${userId}, draftId=${draftId}, trackingId=${trackingId}`);

  try {
    // Step 1: Fetch Tokens
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenFetchError || !tokenData) {
      console.error("[FollowUp] Failed to fetch tokens", tokenFetchError);
      throw new Error("Missing Gmail tokens");
    }

    console.log("[FollowUp] Retrieved tokens");

    // Step 2: Set Credentials
    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    console.log("[FollowUp] Set credentials in OAuth2 client");

    // Step 3: Refresh Access Token
    await oauth2Client.getAccessToken();
    console.log("[FollowUp] Access token refreshed");

    // Step 4: Send Draft
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftId },
    });

    console.log("[FollowUp] Gmail draft sent", sendResponse.data);

    const { threadId, id: messageId } = sendResponse.data;

    // Step 5: Update Emails table
    const updateResult = await supabase
      .from("Emails")
      .update({
        thread_id: threadId,
        sent_at: new Date().toISOString(),
        sent: true,
      })
      .eq("draft_id", draftId);

    console.log("[FollowUp] Updated Emails table", updateResult);

    // Step 6: Insert into Messages table
    const insertResult = await supabase.from("Messages").insert({
      thread_id: threadId,
      message_id: messageId,
      tracking_id: trackingId,
      type: "FollowUp",
    });

    console.log("[FollowUp] Inserted into Messages", insertResult);

    console.log("[FollowUp] Completed sendFollowUpEmail");
  } catch (err) {
    console.error("[FollowUp] Error in sendFollowUpEmail", err);
  }
}
