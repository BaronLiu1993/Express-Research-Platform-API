import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";

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

  console.log(draft)

  //Parsing the payload and breaking it down
  const payload = draft.data.message.payload;
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const htmlBody = extractHtmlOrPlainText(payload);
  const finalHtmlBody = htmlBody + trackingPixel;

  //Send the draft
  console.log(body.professorEmail)
  const raw = makeBody(body.professorEmail, userName, userEmail, subject, finalHtmlBody);
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

  console.log(sendResponse)

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

export async function scheduleFollowUpEmail({userId, userEmail, userName, body}) {
  
}