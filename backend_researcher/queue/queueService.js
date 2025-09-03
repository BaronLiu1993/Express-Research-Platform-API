import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeReplyBody } from "../services/googleServices.js";
import { makeBody } from "../services/googleServices.js";
import { extractHtmlOrPlainText } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "../services/authServices.js";
import { encryptToken } from "../services/authServices.js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

//Gmail OAuth, Getting User Data
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

async function configureOAuth(userId, supabase, fetchDrive = false) {
  console.log("🚀 Starting configureOAuth for user:", userId);

  try {
    // Fetch stored tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    console.log("📦 Supabase token fetch result:", { tokenData, tokenError });

    if (tokenError || !tokenData) {
      console.error("❌ No token data or error fetching tokens");
      throw new Error("No tokens found for user");
    }

    const decryptedAccessToken = decryptToken(tokenData.gmail_auth_token);
    const decryptedRefreshToken = decryptToken(tokenData.gmail_refresh_token);

    console.log("🔑 Decrypted tokens:", { decryptedAccessToken, decryptedRefreshToken });

    // Set OAuth2 credentials
    oauth2Client.setCredentials({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
    });
    console.log("🔧 OAuth2 client credentials set");

    // Get a fresh access token
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const newAccessToken = accessTokenResponse.token;

    console.log("🆕 Access token fetched:", newAccessToken);

    if (!newAccessToken) {
      console.error("❌ Failed to refresh access token");
      throw new Error("Failed to refresh access token");
    }

    // Update Supabase with the new encrypted token
    const encryptedAccessToken = encryptToken(newAccessToken);
    console.log("🔒 Encrypted new access token:", encryptedAccessToken);

    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .update({ gmail_auth_token: encryptedAccessToken })
      .eq("user_id", userId);

    if (tokenInsertionError) {
      console.warn("⚠️ Failed to update token in Supabase:", tokenInsertionError);
    } else {
      console.log("✅ Supabase updated with new access token");
    }

    // Return Gmail and/or Drive clients
    if (fetchDrive) {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      console.log("📁 Returning Gmail & Drive clients");
      return { gmail, drive };
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    console.log("📧 Returning Gmail client only");
    return gmail;

  } catch (err) {
    console.error("❌ Error in configureOAuth:", err);
    throw new Error("Internal Server Error");
  }
}


export async function generateDraftFromSnippetEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail } = body;
  const trackingId = uuidv4();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  try {
    const gmail = await configureOAuth(userId, supabase);

    const { data: snippetData, error: snippetError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId.snippetId)
      .single();

    if (snippetError) {
      return { message: "Failed fetching snippet" };
    }

    const snippetHTML = snippetData.snippet_html;
    const snippetSubject = snippetData.snippet_subject;

    const subject = Mustache.render(snippetSubject, dynamicFields);
    const html = Mustache.render(snippetHTML, dynamicFields);

    const raw = await makeBody({
      to,
      from: fromName,
      name: fromEmail,
      subject: subject,
      html,
    });

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    const { data: emailData, error: insertionError } = await supabase
      .from("Emails")
      .insert([
        {
          user_id: userId,
          professor_id: parseInt(professorId),
          draft_id: draft.data.id,
          sent: false,
          type: "draft",
          tracking_id: trackingId,
        },
      ]);

    const { data: savedData, error: savedError } = await supabase
      .from("Saved")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();

    if (savedError) {
      throw new Error("Failed to Saved");
    } else {
      await supabase.from("InProgress").insert(savedData);
      await supabase
        .from("Saved")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);
    }

    return { message: "Draft successfully created" };
  } catch {
    return { message: "Failed to create draft" };
  }
}

//Sending Function For First Initial Email
export async function sendSnippetEmail({
  userId,
  userEmail,
  userName,
  body,
  accessToken,
}) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  try {
    const gmail = await configureOAuth(userId, supabase);

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

    const raw = await makeBody({
      to: body.professorEmail,
      from: userName,
      name: userEmail,
      subject,
      html: finalHtmlBody,
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
      user_id: userId,
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: draftData.tracking_id,
      type: "first",
    });

    return { message: "Successfully Sent!" };
  } catch {
    return { message: "Internal Server Error" };
  }
}

export async function sendSnippetEmailWithAttachments({
  userId,
  userEmail,
  userName,
  body,
  supabase,
}) {
  try {
    const oAuthObject = await configureOAuth(userId, supabase);
    const gmail = oAuthObject.gmail;
    const drive = oAuthObject.drive;

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

    let emailAttachments = [];

    if (fileData.resume) {
      const buffer = await getDriveFileBuffer(fileData.resume, drive);
      const metadata = await drive.files.get({
        fileId: fileData.resume,
        fields: "name, mimeType",
      });
      attachments.push({
        filename: metadata.data.name,
        contentType: metadata.data.mimeType,
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

    const raw = await makeBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject,
      html: finalHtmlBody,
      attachments: emailAttachments,
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
      user_id: userId,
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: draftData.tracking_id,
      type: "first",
    });

    return { message: "Successfully Sent!" };
  } catch {
    return { message: "Failed To Send" };
  }
}

//Create One Draft for Each and Then Dynamically Send All Of Them Create Snippet Same Logic as Above
export async function generateFollowUpDraftSnippetEmail({
  userId,
  professorId,
  body,
  supabase,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail } = body;
  try {
    const gmail = await configureOAuth(userId, supabase);

    // Fetch Snippet
    const { data: snippetData, error: snippetError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId)
      .single();

    const snippetHTML = snippetData.snippet_html;
    const snippetSubject = snippetData.snippet_subject;

    const subject = Mustache.render(snippetSubject, dynamicFields);
    const html = Mustache.render(snippetHTML, dynamicFields);
    const raw = makeReplyBody(to, fromName, fromEmail, subject, html);

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

    return { message: "Draft successfully created" };
  } catch (err) {
    return { message: "Failed to create draft" };
  }
}

//Sending Function

export async function sendFollowUpEmail({
  userId,
  userEmail,
  userName,
  body,
  threadId,
  supabase,
}) {
  try {
    const gmail = await configureOAuth(userId, supabase);
    //body should have draftId

    // Build tracking pixel
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    // Get draft from Gmail
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: body.draftId,
    });

    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const htmlBody = extractHtmlOrPlainText(payload);
    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = makeReplyBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject: subject,
      html: finalHtmlBody,
      inReplyToMessageId: threadId,
    });

    await gmail.users.drafts.update({
      userId: "me",
      id: body.draftId,
      requestBody: { message: { raw } },
    });

    // Send the draft
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: body.draftId,
      },
    });

    // Update Supabase email status
    const { error: insertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "followup",
        thread_id: sendResponse.data.threadId,
      })
      .eq("draft_id", body.draftId);

    await supabase.from("Messages").insert({
      user_id: userId,
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
  threadId,
}) {
  try {
    const oAuthObject = await configureOAuth(userId, supabase, true);
    const drive = oAuthObject.drive;
    const gmail = oAuthObject.gmail;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: body.draftId,
    });

    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    let emailAttachments = [];
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

    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const htmlBody = extractHtmlOrPlainText(payload);
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;
    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = await makeReplyBody({
      to: body.professorEmail,
      from: userEmail,
      name: userName,
      subject,
      html: finalHtmlBody,
      inReplyToMessageId: threadId,
      emailAttachments: attachments,
    });

    await gmail.users.drafts.update({
      userId: "me",
      id: body.draftId,
      requestBody: { message: { raw } },
    });

    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: body.draftId },
    });

    await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "followup",
        thread_id: sendResponse.data.threadId,
      })
      .eq("draft_id", body.draftId);

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
      user_id: userId,
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: draftData.tracking_id,
      type: "followup",
    });
    return { message: "Successfully Sent!" };
  } catch {
    return { message: "Internal Server Error" };
  }
}
