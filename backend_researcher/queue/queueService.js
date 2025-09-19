import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeReplyBody } from "../services/googleServices.js";
import { makeBody } from "../services/googleServices.js";
import { extractHtmlOrPlainText } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { configureOAuth } from "../services/googleServices.js";
import { getDriveFileBuffer } from "../services/googleServices.js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export async function generateDraftFromSnippetEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail, toName } = body;
  const trackingId = uuidv4();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  try {
    const gmail = await configureOAuth({ userId, supabase });
    console.log(gmail)
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

    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
        sent: false,
        type: "draft",
        thread_id: draft.data.message.threadId,
        tracking_id: trackingId,
        professor_email: to,
        professor_name: toName,
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
  console.log(userEmail);
  console.log(userName);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  console.log(userEmail);
  console.log(userName);

  try {
    const gmail = await configureOAuth({ userId, supabase });

    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .eq("type", "draft")
      .single();

    if (draftFetchError) {
      throw new Error("Failed to Fetch Drafts");
    }

    //build tracking pixel
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    const payload = draft.data.message.payload;
    const parentMessageIdHeader = payload.headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;
    const headers = payload.headers;
    const subject = headers.find((h) => h.name === "Subject")?.value;
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

    console.log(sendResponse);

    const { error: insertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "first",
        message_id: sendResponse.data.id,
        thread_id: sendResponse.data.threadId,
        message_id: parentMessageIdHeader,
      })
      .eq("draft_id", draftData.draft_id);

    if (insertionError) {
      throw new Error("Insertion Draft Error");
    }

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
  accessToken,
}) {
  const TAG = "[sendSnippetEmailWithAttachments]";

  console.log(`${TAG} INPUTS`, JSON.stringify({
    userId, userEmail, userName, hasBody: !!body, accessToken: !!accessToken
  }, null, 2));

  if (!userId || !userEmail || !userName || !body?.professorId || !body?.professorEmail || !accessToken) {
    const err = new Error("Missing required inputs");
    console.error(`${TAG} ERROR at validate-inputs:`, err);
    return { message: "Internal Server Error", step: "validate-inputs", error: String(err.message) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    console.log(`${TAG} oauth-start`, JSON.stringify({ fetchDrive: true }, null, 2));
    const googleClients = await configureOAuth({ userId, supabase, fetchDrive: true });
    const gmail = googleClients.gmail;
    const drive = googleClients.drive; // FIX
    console.log(`${TAG} oauth-success`, JSON.stringify({ hasGmail: !!gmail, hasDrive: !!drive }, null, 2));

    // --- Fetch draft row
    console.log(`${TAG} fetch-draft-row`);
    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .eq("type", "draft")
      .single();

    if (draftFetchError || !draftData?.draft_id) {
      const err = draftFetchError || new Error("No draft row found");
      console.error(`${TAG} ERROR at fetch-draft-row:`, err);
      return { message: "Internal Server Error", step: "fetch-draft-row", error: String(err.message) };
    }
    console.log(`${TAG} fetch-draft-row-success`, JSON.stringify(draftData, null, 2));

    // --- Fetch user files
    console.log(`${TAG} fetch-user-files`);
    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileDataError || !fileData) {
      const err = fileDataError || new Error("No Files Found");
      console.error(`${TAG} ERROR at fetch-user-files:`, err);
      return { message: "Internal Server Error", step: "fetch-user-files", error: String(err.message) };
    }
    console.log(`${TAG} fetch-user-files-success`, JSON.stringify(fileData, null, 2));

    // --- Build attachments
    const attachments = /** @type {Array<{ filename: string; mimeType: string; content: Buffer }>} */ ([]);

    if (fileData.resume) {
      try {
        console.log(`${TAG} resume-buffer-start`, JSON.stringify({ fileId: fileData.resume }, null, 2));
        const buffer = await getDriveFileBuffer(fileData.resume, drive);
        const metadata = await drive.files.get({ fileId: fileData.resume, fields: "name, mimeType" });
        attachments.push({ filename: metadata.data.name, mimeType: metadata.data.mimeType, content: buffer });
        console.log(`${TAG} resume-buffer-success`, JSON.stringify({
          name: metadata.data.name, mimeType: metadata.data.mimeType, size: buffer?.length
        }, null, 2));
      } catch (err) {
        console.error(`${TAG} ERROR at resume-buffer:`, err);
        return { message: "Internal Server Error", step: "resume-buffer", error: String(err.message || err) };
      }
    }

    if (fileData.transcript) {
      try {
        console.log(`${TAG} transcript-buffer-start`, JSON.stringify({ fileId: fileData.transcript }, null, 2));
        const buffer = await getDriveFileBuffer(fileData.transcript, drive);
        const metadata = await drive.files.get({ fileId: fileData.transcript, fields: "name, mimeType" });
        attachments.push({ filename: metadata.data.name, mimeType: metadata.data.mimeType, content: buffer });
        console.log(`${TAG} transcript-buffer-success`, JSON.stringify({
          name: metadata.data.name, mimeType: metadata.data.mimeType, size: buffer?.length
        }, null, 2));
      } catch (err) {
        console.error(`${TAG} ERROR at transcript-buffer:`, err);
        return { message: "Internal Server Error", step: "transcript-buffer", error: String(err.message || err) };
      }
    }

    // --- Tracking pixel
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;
    console.log(`${TAG} tracking-pixel-built`, JSON.stringify({ trackingId: draftData.tracking_id }, null, 2));

    // --- Get draft from Gmail
    console.log(`${TAG} gmail-get-draft-start`, JSON.stringify({ draftId: draftData.draft_id }, null, 2));
    const draft = await gmail.users.drafts.get({ userId: "me", id: draftData.draft_id });
    console.log(`${TAG} gmail-get-draft-success`, JSON.stringify({ found: !!draft?.data?.message?.id }, null, 2));

    const payload = draft?.data?.message?.payload;
    if (!payload) {
      const err = new Error("Draft payload missing");
      console.error(`${TAG} ERROR at draft-payload-missing:`, err);
      return { message: "Internal Server Error", step: "draft-payload-missing", error: String(err.message) };
    }

    const headers = /** @type {Array<{ name?: string; value?: string }>} */ (payload.headers || []);
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(no subject)";
    const parentMessageIdHeader = headers.find((h) => h.name?.toLowerCase() === "message-id")?.value || null;

    console.log(`${TAG} payload-headers`, JSON.stringify({ subject, parentMessageIdHeader }, null, 2));

    // --- Extract body
    let htmlBody;
    try {
      htmlBody = extractHtmlOrPlainText(payload);
      if (typeof htmlBody !== "string") htmlBody = String(htmlBody || "");
      console.log(`${TAG} extract-body-success`, JSON.stringify({ length: htmlBody.length }, null, 2));
    } catch (err) {
      console.error(`${TAG} ERROR at extract-body:`, err);
      return { message: "Internal Server Error", step: "extract-body", error: String(err.message || err) };
    }

    const finalHtmlBody = htmlBody + trackingPixel;

    // --- Build raw MIME
    console.log(`${TAG} makeBody-start`, JSON.stringify({
      to: body.professorEmail, fromName: userName, fromEmail: userEmail, attachmentsCount: attachments.length
    }, null, 2));

    const raw = await makeBody({
      to: body.professorEmail,
      from: userEmail,     // email address
      name: userName,      // display name
      subject,
      html: finalHtmlBody,
      attachments,
    });

    if (!raw) {
      const err = new Error("makeBody returned empty raw");
      console.error(`${TAG} ERROR at makeBody-empty:`, err);
      return { message: "Internal Server Error", step: "makeBody-empty", error: String(err.message) };
    }
    console.log(`${TAG} makeBody-success`, JSON.stringify({ rawLength: raw?.length }, null, 2));

    // --- Update draft
    console.log(`${TAG} gmail-update-draft-start`);
    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw } },
    });
    console.log(`${TAG} gmail-update-draft-success`);

    // --- Send draft
    console.log(`${TAG} gmail-send-draft-start`);
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftData.draft_id },
    });
    console.log(`${TAG} gmail-send-draft-success`, JSON.stringify({
      id: sendResponse?.data?.id, threadId: sendResponse?.data?.threadId
    }, null, 2));

    // --- Update Emails row
    console.log(`${TAG} supabase-update-emails-start`);
    const { error: insertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "first",
        message_id: sendResponse.data.id,
        thread_id: sendResponse.data.threadId,
        message_id: parentMessageIdHeader
      })
      .eq("draft_id", draftData.draft_id);

    if (insertionError) {
      console.error(`${TAG} ERROR at supabase-update-emails:`, insertionError);
      return { message: "Internal Server Error", step: "supabase-update-emails", error: String(insertionError.message || insertionError) };
    }
    console.log(`${TAG} supabase-update-emails-success`);

    // --- Move InProgress ➜ Completed
    console.log(`${TAG} supabase-fetch-inprogress`);
    const { data: inProgressData, error: inProgErr } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .single();

    if (inProgErr && inProgErr.code !== "PGRST116") {
      console.log(`${TAG} supabase-fetch-inprogress-warn`, JSON.stringify({ inProgErr }, null, 2));
    }

    if (inProgressData) {
      console.log(`${TAG} supabase-move-completed-start`);
      const { error: insertCompletedErr } = await supabase.from("Completed").insert(inProgressData);
      if (insertCompletedErr) {
        console.error(`${TAG} ERROR at supabase-insert-completed:`, insertCompletedErr);
        return { message: "Internal Server Error", step: "supabase-insert-completed", error: String(insertCompletedErr.message || insertCompletedErr) };
      }

      const { error: deleteInProgErr } = await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", body.professorId);
      if (deleteInProgErr) {
        console.error(`${TAG} ERROR at supabase-delete-inprogress:`, deleteInProgErr);
        return { message: "Internal Server Error", step: "supabase-delete-inprogress", error: String(deleteInProgErr.message || deleteInProgErr) };
      }
      console.log(`${TAG} supabase-move-completed-success`);
    } else {
      console.log(`${TAG} supabase-no-inprogress`);
    }

    // --- Insert Messages row
    console.log(`${TAG} supabase-insert-messages-start`);
    const { error: insertMsgErr } = await supabase.from("Messages").insert({
      user_id: userId,
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: draftData.tracking_id,
      type: "first",
    });
    if (insertMsgErr) {
      console.error(`${TAG} ERROR at supabase-insert-messages:`, insertMsgErr);
      return { message: "Internal Server Error", step: "supabase-insert-messages", error: String(insertMsgErr.message || insertMsgErr) };
    }
    console.log(`${TAG} supabase-insert-messages-success`);

    console.log(`${TAG} DONE`);
    return { message: "Successfully Sent!" };
  } catch (err) {
    console.error(`${TAG} ERROR at top-level:`, err);
    return { message: "Internal Server Error", step: "top-level", error: String(err?.message || err) };
  }
}


//Create One Draft for Each and Then Dynamically Send All Of Them Create Snippet Same Logic as Above
export async function generateFollowUpDraftSnippetEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const {
    snippetId,
    dynamicFields,
    to,
    fromName,
    fromEmail,
    threadId,
    messageId,
  } = body;
  const trackingId = uuidv4();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const gmail = await configureOAuth({ userId, supabase });

    // Fetch Snippet
    const { data: snippetData, error: snippetError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId.snippetId)
      .single();

    if (snippetError) {
      throw new Error("Snippet Fetching Error");
    }

    const snippetHTML = snippetData.snippet_html;
    const snippetSubject = snippetData.snippet_subject;

    const subject = Mustache.render(snippetSubject, dynamicFields);
    const html = Mustache.render(snippetHTML, dynamicFields);
    const raw = await makeReplyBody({
      to,
      from: fromEmail,
      name: fromName,
      subject,
      html,
      inReplyToMessageId: messageId,
    });

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
        thread_id: threadId,
        sent: false,
        type: "followupdraft",
        tracking_id: trackingId,
      },
    ]);

    if (insertionError) {
      throw new Error("Email Insertion Error");
    }

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
  accessToken,
}) {
  try {
    console.log("sendFollowUpEmail called with:", {
      userId,
      userEmail,
      userName,
      body,
      accessToken,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    console.log("Supabase client initialized");

    const gmail = await configureOAuth({ userId, supabase });
    console.log("Gmail OAuth configured");

    let draftData = null;
    let draftError = null;
  

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Fetching draftData attempt ${attempt}/3`);

      const { data, error } = await supabase
        .from("Emails")
        .select("draft_id, tracking_id")
        .eq("professor_id", parseInt(body.professorId))
        .eq("type", "followupdraft")
        .eq("sent", false)
        .single();

      draftData = data;
      draftError = error;

      if (!error && data) {
        console.log("draftData fetched successfully:", draftData);
        break;
      }

      console.warn("Draft fetch failed:", error);

      if (attempt < 3) {
        console.log("Retrying after 1 second...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!draftData) {
      console.error("Failed to fetch draftData after 3 attempts");
      throw new Error("Failed to fetch draftData after 3 attempts");
    }

    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData?.tracking_id}" width="1" height="1" style="display:none;" />`;
    console.log("Tracking pixel generated:", trackingPixel);

    // Get draft from Gmail
    console.log("Fetching Gmail draft with id:", draftData.draft_id);
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });
    console.log("Draft fetched:", draft.data);

    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    console.log("Extracted subject:", subject);

    const htmlBody = extractHtmlOrPlainText(payload);
    console.log("Extracted body length:", htmlBody.length);

    const finalHtmlBody = htmlBody + trackingPixel;
    console.log("Final HTML body length:", finalHtmlBody.length);

    const raw = await makeReplyBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject: subject,
      html: finalHtmlBody,
      inReplyToMessageId: body.messageId,
    });
    console.log("Raw email generated");

    console.log("Updating Gmail draft...");
    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw, threadId: body.threadId } },
    });
    console.log("Draft updated successfully");

    // Send the draft
    console.log("Sending Gmail draft...");
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftData.draft_id, // existing draft ID
      },
    });

    console.log("Draft sent:", sendResponse.data);

    // Update Emails table
    console.log("Updating Emails table for draft:", sendResponse.data.id);
    const { error: emailInsertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "followup",
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        professor_name: body.professorName,
        professor_email: body.professorEmail,
      })
      .eq("draft_id", draftData.draft_id);

    if (emailInsertionError) {
      console.error("Emails Insertion Error:", emailInsertionError);
      throw new Error("Emails Insertion Error");
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        tracking_id: draftData?.tracking_id,
        type: "followup",
      });

    if (messageInsertionError) {
      console.error("Message Insertion Error:", messageInsertionError);
      throw new Error("Message Insertion Error");
    }

    console.log("Follow-up email successfully sent!");
    return { message: "Successfully Sent!" };
  } catch (err) {
    console.error("sendFollowUpEmail error:", err);
    return { message: "Failed to send follow-up email" };
  }
}

export async function sendFollowUpWithAttachments({
  userId,
  userEmail,
  userName,
  body,
  accessToken,
}) {
  try {
    console.log("sendFollowUpEmail called with:", {
      userId,
      userEmail,
      userName,
      body,
      accessToken,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    console.log("Supabase client initialized");

    const oAuthObject = await configureOAuth({
      userId,
      supabase,
      fetchDrive: true,
    });

    const drive = oAuthObject.drive;
    const gmail = oAuthObject.gmail;
    let draftData = null;
    let draftError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Fetching draftData attempt ${attempt}/3`);

      const { data, error } = await supabase
        .from("Emails")
        .select("draft_id, tracking_id")
        .eq("professor_id", parseInt(body.professorId))
        .eq("type", "followupdraft")
        .eq("sent", false)
        .single();

      draftData = data;
      draftError = error;

      if (!error && data) {
        console.log("draftData fetched successfully:", draftData);
        break;
      }

      console.warn("Draft fetch failed:", error);

      if (attempt < 3) {
        console.log("Retrying after 1 second...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!draftData) {
      console.error("Failed to fetch draftData after 3 attempts");
      throw new Error("Failed to fetch draftData after 3 attempts");
    }

    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData?.tracking_id}" width="1" height="1" style="display:none;" />`;
    console.log("Tracking pixel generated:", trackingPixel);

    // Get draft from Gmail
    console.log("Fetching Gmail draft with id:", draftData.draft_id);
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });
    console.log("Draft fetched:", draft.data);
    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileDataError || !fileData) {
      throw new Error("Failed To Find Files To Attach and Send");
    }

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
    console.log("Extracted subject:", subject);

    const htmlBody = extractHtmlOrPlainText(payload);
    console.log("Extracted body length:", htmlBody.length);

    const finalHtmlBody = htmlBody + trackingPixel;
    console.log("Final HTML body length:", finalHtmlBody.length);

    const raw = await makeReplyBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject: subject,
      html: finalHtmlBody,
      attachments,
      inReplyToMessageId: body.messageId,
    });
    console.log("Raw email generated");

    console.log("Updating Gmail draft...");
    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw, threadId: body.threadId } },
    });

    console.log("Draft updated successfully");

    // Send the draft
    console.log("Sending Gmail draft...");
    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftData.draft_id, // existing draft ID
      },
    });

    console.log("Draft sent:", sendResponse.data);

    // Update Emails table
    console.log("Updating Emails table for draft:", sendResponse.data.id);
    const { error: emailInsertionError } = await supabase
      .from("Emails")
      .update({
        sent: true,
        type: "followup",
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        professor_name: body.professorName,
        professor_email: body.professorEmail,
      })
      .eq("draft_id", draftData.draft_id);

    if (emailInsertionError) {
      console.error("Emails Insertion Error:", emailInsertionError);
      throw new Error("Emails Insertion Error");
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        tracking_id: draftData?.tracking_id,
        type: "followup",
      });

    if (messageInsertionError) {
      console.error("Message Insertion Error:", messageInsertionError);
      throw new Error("Message Insertion Error");
    }

    console.log("Follow-up email successfully sent!");
    return { message: "Successfully Sent!" };
  } catch (err) {
    console.error("sendFollowUpEmail error:", err);
    return { message: "Failed to send follow-up email" };
  }
}
