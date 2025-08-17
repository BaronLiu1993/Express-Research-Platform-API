import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import MailComposer from "nodemailer/lib/mail-composer/index.js";

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

async function getDriveFileBuffer(fileId, drive) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
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

function makeBodyWithAttachment({
  to,
  from,
  name,
  subject,
  html,
  attachments,
}) {
  const formattedFrom = name ? `"${name}" <${from}>` : from;
  console.log(to, from, name, subject, html, attachments);
  const mail = new MailComposer({
    to,
    from: formattedFrom,
    subject,
    html,
    text: "",
    attachments,
  });
  console.log(mail);

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

function makeBody(to, userName, fromEmail, subject, htmlMessage) {
  const mimeMessage = [
    `Content-Type: text/html; charset="UTF-8"`,
    `To: ${to}`,
    `From: ${userName} <${fromEmail}>`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    ``,
    `${htmlMessage}`,
  ].join("\n");

  return Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

//buffer stream

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

  //Parsing the payload and breaking it down
  const payload = draft.data.message.payload;
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const htmlBody = extractHtmlOrPlainText(payload);
  const finalHtmlBody = htmlBody + trackingPixel;

  //Send the draft
  const raw = makeBody(
    body.professorEmail,
    userName,
    userEmail,
    subject,
    finalHtmlBody
  );

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

  await supabase.from("Messages").insert({
    thread_id: sendResponse.data.threadId,
    message_id: sendResponse.data.id,
    tracking_id: draftData.tracking_id,
    type: "First",
  });

  return { message: "Successfully Sent!" };
}

export async function sendSnippetEmailWithAttachments({
  userId,
  userEmail,
  userName,
  body,
}) {
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id, tracking_id")
    .eq("user_id", userId)
    .eq("professor_id", body.professorId)
    .eq("type", "draft")
    .single();

  const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

  const draft = await gmail.users.drafts.get({
    userId: "me",
    id: draftData.draft_id,
  });

  const { data: fileData, error: fileDataError } = await supabase
    .from("User_Profiles")
    .select("resume, transcript")
    .eq("user_id", userId)
    .single();

  let attachments = [];

  if (fileData.resume) {
    const buffer = await getDriveFileBuffer(fileData.resume, drive);
    const metadata = await drive.files.get({
      fileId: fileData.resume,
      fields: "name, mimeType",
    });
    attachments.push({
      filename: metadata.data.name,
      mimeType: metadata.data.mimeType,
      content: buffer,
    });
  }

  if (fileData.transcript) {
    const buffer = await getDriveFileBuffer(fileData.transcript, drive);
    const metadata = await drive.files.get({
      fileId: fileData.transcript,
      fields: "name, mimeType",
    });

    attachments.push({
      filename: metadata.data.name,
      mimeType: metadata.data.mimeType,
      content: buffer,
    });
  }

  const payload = draft.data.message.payload;
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const htmlBody = extractHtmlOrPlainText(payload);
  const finalHtmlBody = htmlBody + trackingPixel;

  const raw = await makeBodyWithAttachment({
    to: body.professorEmail,
    name: userName,
    from: userEmail,
    subject,
    html: finalHtmlBody,
    attachments,
  });

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

  await supabase
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

  await supabase.from("Messages").insert({
    thread_id: sendResponse.data.threadId,
    message_id: sendResponse.data.id,
    tracking_id: draftData.tracking_id,
    type: "First",
  });

  return { message: "Successfully Sent!" };
}

//Create One Draft for Each and Then Dynamically Send All Of Them Create Snippet Same Logic as Above
export async function generateFollowUpDraftSnippetEmail({
  userId,
  professorId,
  body,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail } = body;
  console.log("Starting draft generation with params:", {
    userId,
    professorId,
    snippetId,
    dynamicFields,
    to,
    fromName,
    fromEmail,
  });

  try {
    // Fetch Gmail Tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData) {
      console.error("Failed to fetch Gmail tokens:", tokenError);
      throw new Error("Missing Gmail tokens");
    }

    const trackingId = uuidv4();
    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    await oauth2Client.getAccessToken();
    console.log("OAuth2 access token refreshed");

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch Snippet
    const { data: snippetData, error: snippetError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId)
      .single();

    if (snippetError || !snippetData) {
      console.error("Failed to fetch snippet:", snippetError);
      throw new Error("Snippet not found");
    }

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
        type: "followupdraft",
        tracking_id: trackingId,
      },
    ]);

    if (insertionError) {
      console.error("Failed to insert draft metadata:", insertionError);
      throw new Error("Supabase insert failed");
    }

    console.log("Draft metadata inserted into Supabase");

    return { message: "Draft successfully created" };
  } catch (err) {
    return { message: "Failed to create draft" };
  }
}

//Sending Function

export async function sendFollowUpEmail({ userId, userEmail, userName, body }) {
  console.log("Starting sendFollowUpEmail with:", { body });
  console.log(userId);
  try {
    // Fetch Gmail Tokens
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

    // Fetch corresponding draft
    console.log(body.professorId);
    console.log(userId);

    let draftData = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase
        .from("Emails")
        .select("draft_id, tracking_id")
        .eq("user_id", userId)
        .eq("professor_id", body.professorId)
        .eq("type", "followupdraft")
        .single();

      draftData = data;
      draftFetchError = error;

      if (!error && data) {
        break; 
      } else {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 500)); 
        }
      }
    }
    // Build tracking pixel
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    // Get draft from Gmail
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });
    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const htmlBody = extractHtmlOrPlainText(payload);
    const finalHtmlBody = htmlBody + trackingPixel;

    console.log(userName);

    const raw = makeBody(
      body.professorEmail,
      userName,
      userEmail,
      subject,
      finalHtmlBody
    );

    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw } },
    });

    // Send the draft
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftData.draft_id,
      },
    });

    // Update Supabase email status
    const { error: insertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "FollowUp",
        thread_id: sendResponse.data.threadId,
      })
      .eq("draft_id", draftData.draft_id);

    await supabase.from("Messages").insert({
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: draftData.tracking_id,
      type: "followup",
    });

    return { message: "Successfully Sent!" };
  } catch (err) {
    return { message: "Failed to send follow-up email" };
  }
}

export async function sendFollowUpWithAttachments({
  userId,
  userEmail,
  userName,
  body,
}) {
  console.log("🚀 sendFollowUpWithAttachments START", { userId, body });

  // 1️⃣ Get Gmail OAuth tokens
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();
  if (tokenFetchError || !tokenData) {
    console.error("❌ Failed to fetch Gmail tokens", tokenFetchError);
    return { error: "Missing Gmail tokens" };
  }
  console.log("✅ Gmail tokens fetched");
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // 2️⃣ Retry fetching draft data
  let draftData = null;
  let draftFetchError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`📨 Fetching draft data attempt ${attempt}`);
    const { data, error } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .eq("type", "followupdraft")
      .single();
    draftData = data;
    draftFetchError = error;

    if (!error && data) {
      console.log("✅ Draft data fetched:", draftData);
      break;
    } else {
      console.warn(`⚠️ Draft fetch attempt ${attempt} failed:`, error);
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }
  }
  if (draftFetchError || !draftData) {
    console.error("❌ Failed to fetch draft after retries");
    return { error: "No draft found" };
  }

  // 3️⃣ Fetch Gmail draft content
  console.log("📩 Fetching Gmail draft:", draftData.draft_id);
  const draft = await gmail.users.drafts.get({
    userId: "me",
    id: draftData.draft_id,
  });
  console.log("✅ Gmail draft fetched");

  // 4️⃣ Fetch file data from Supabase
  console.log("📂 Fetching attachments info");
  const { data: fileData, error: fileDataError } = await supabase
    .from("User_Profiles")
    .select("resume, transcript")
    .eq("user_id", userId)
    .single();
  if (fileDataError) {
    console.error("❌ Failed to fetch file data", fileDataError);
    return { error: "Missing file data" };
  }

  // 5️⃣ Download attachments from Drive
  let attachments = [];
  if (fileData.resume) {
    console.log("⬇️ Downloading resume");
    const buffer = await getDriveFileBuffer(fileData.resume, drive);
    const metadata = await drive.files.get({
      fileId: fileData.resume,
      fields: "name, mimeType",
    });
    attachments.push({
      filename: metadata.data.name,
      mimeType: metadata.data.mimeType,
      content: buffer,
    });
    console.log("✅ Resume added:", metadata.data.name);
  }
  if (fileData.transcript) {
    console.log("⬇️ Downloading transcript");
    const buffer = await getDriveFileBuffer(fileData.transcript, drive);
    const metadata = await drive.files.get({
      fileId: fileData.transcript,
      fields: "name, mimeType",
    });
    attachments.push({
      filename: metadata.data.name,
      mimeType: metadata.data.mimeType,
      content: buffer,
    });
    console.log("✅ Transcript added:", metadata.data.name);
  }

  // 6️⃣ Prepare email body
  const payload = draft.data.message.payload;
  const headers = payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const htmlBody = extractHtmlOrPlainText(payload);
  const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;
  const finalHtmlBody = htmlBody + trackingPixel;
  console.log("📝 Email subject:", subject);

  // 7️⃣ Build raw email with attachments
  const raw = await makeBodyWithAttachment({
    to: body.professorEmail,
    name: userName,
    from: userEmail,
    subject,
    html: finalHtmlBody,
    attachments,
  });

  // 8️⃣ Update draft in Gmail
  console.log("✏️ Updating Gmail draft with attachments");
  await gmail.users.drafts.update({
    userId: "me",
    id: draftData.draft_id,
    requestBody: { message: { raw } },
  });

  // 9️⃣ Send the draft
  console.log("📤 Sending Gmail draft");
  const sendResponse = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftData.draft_id },
  });
  console.log("✅ Draft sent:", sendResponse.data);

  // 🔟 Update Supabase Email record
  await supabase
    .from("Emails")
    .update({
      sent: true,
      type: "followup",
      thread_id: sendResponse.data.threadId,
    })
    .eq("draft_id", draftData.draft_id);
  console.log("✅ Email marked as sent in Supabase");

  // 1️⃣1️⃣ Move from InProgress → Completed
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
    console.log("✅ Moved InProgress → Completed");
  }

  // 1️⃣2️⃣ Insert tracking message
  await supabase.from("Messages").insert({
    thread_id: sendResponse.data.threadId,
    message_id: sendResponse.data.id,
    tracking_id: draftData.tracking_id,
    type: "FollowUp",
  });
  console.log("✅ Tracking message inserted");

  console.log("🎉 sendFollowUpWithAttachments DONE");
  return { message: "Successfully Sent!" };
}
