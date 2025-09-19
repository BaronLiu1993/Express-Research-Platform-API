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

    if (insertionError) {
      throw new Error("Failed to Insert into Emails (FIRST)");
    }

    const { data: savedData, error: savedError } = await supabase
      .from("Saved")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();

    if (savedData) {
      const { error: inProgressInsertionError } = await supabase
        .from("InProgress")
        .insert(savedData);
      const { error: savedDeleteError } = await supabase
        .from("Saved")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (inProgressInsertionError || savedDeleteError) {
        throw new Error("Failed to Insert into Emails (FIRST)");
      }
    } else {
      throw new Error("Failed to Saved");
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
  if (
    !userId ||
    !userEmail ||
    !userName ||
    !body?.professorId ||
    !body?.professorEmail ||
    !accessToken
  ) {
    throw new Error("Missing required inputs");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

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
      throw new Error("Failed to Insert into Database");
    }

    const { data: inProgressData } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .single();

    if (inProgressData) {
      const { error: completedInsertionError } = await supabase
        .from("Completed")
        .insert(inProgressData);
      const { error: inProgressionDeletionError } = await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", body.professorId);

      if (completedInsertionError || inProgressionDeletionError) {
        throw new Error("Failed to Insert or Delete from Database");
      }
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        tracking_id: draftData.tracking_id,
        type: "first",
      });

    if (messageInsertionError) {
      throw new Error("Failed to Insert into Database");
    }

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
  if (
    !userId ||
    !userEmail ||
    !userName ||
    !body?.professorId ||
    !body?.professorEmail ||
    !accessToken
  ) {
    throw new Error("Missing required inputs");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    const googleClients = await configureOAuth({
      userId,
      supabase,
      fetchDrive: true,
    });
    const gmail = googleClients.gmail;
    const drive = googleClients.drive;
    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .eq("type", "draft")
      .single();

    if (draftFetchError || !draftData?.draft_id) {
      throw new Error("No draft row found");
    }

    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileDataError || !fileData) {
      throw new Error("No Files Found");
    }

    const attachments = [];

    if (fileData.resume) {
      try {
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
      } catch (err) {
        throw new Error("No Files Found");
      }
    }

    if (fileData.transcript) {
      try {
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
      } catch (err) {
        throw new Error("No Files Found");
      }
    }
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    const payload = draft?.data?.message?.payload;
    if (!payload) {
      throw Error("Draft payload missing");
    }

    const headers = payload.headers;

    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value ||
      "(no subject)";

    const parentMessageIdHeader =
      headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ||
      null;

    let htmlBody;
    try {
      htmlBody = extractHtmlOrPlainText(payload);
      if (typeof htmlBody !== "string") htmlBody = String(htmlBody || "");
    } catch (err) {
      throw new Error("No HTML Found");
    }

    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = await makeBody({
      to: body.professorEmail,
      from: userEmail,
      name: userName,
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
      requestBody: { id: draftData.draft_id },
    });

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
      throw new Error("Failed to Insert");
    }

    const { data: inProgressData, error: inProgErr } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .single();

    if (inProgErr && inProgErr.code !== "PGRST116") {
      throw new Error("Failed INprogress Insertion");
    }

    if (inProgressData) {
      const { error: insertCompletedErr } = await supabase
        .from("Completed")
        .insert(inProgressData);

      const { error: deleteInProgErr } = await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", body.professorId);

      if (deleteInProgErr || insertCompletedErr) {
        throw new Error("No Files Found");
      }
    } else {
      throw new Error("Insertion Failed");
    }

    if (insertMsgErr) {
      throw new Error("Nessage Insertion Error");
    }

    return { message: "Successfully Sent!" };
  } catch (err) {
    throw new Error(err);
  }
}

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
  } catch (err) {
    throw new Error(err);
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
    if (
      !userId ||
      !userEmail ||
      !userName ||
      !body?.professorId ||
      !body?.professorEmail ||
      !accessToken
    ) {
      throw new Error("Missing required inputs");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const gmail = await configureOAuth({ userId, supabase });

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
        break;
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!draftData) {
      throw new Error("Failed to fetch draftData after 3 attempts");
    }

    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData?.tracking_id}" width="1" height="1" style="display:none;" />`;

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

    const raw = await makeReplyBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject: subject,
      html: finalHtmlBody,
      inReplyToMessageId: body.messageId,
    });

    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw, threadId: body.threadId } },
    });

    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftData.draft_id,
      },
    });

    // Update Emails table
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
      throw new Error("Message Insertion Error");
    }
  } catch (err) {
    throw new Error(err);
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
    if (
      !userId ||
      !userEmail ||
      !userName ||
      !body?.professorId ||
      !body?.professorEmail ||
      !accessToken
    ) {
      throw new Error("Missing required inputs");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

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
        break;
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!draftData) {
      throw new Error("Failed to fetch draftData after 3 attempts");
    }

    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftData?.tracking_id}" width="1" height="1" style="display:none;" />`;
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });
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

    const raw = await makeReplyBody({
      to: body.professorEmail,
      name: userName,
      from: userEmail,
      subject: subject,
      html: finalHtmlBody,
      attachments,
      inReplyToMessageId: body.messageId,
    });

    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw, threadId: body.threadId } },
    });

    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftData.draft_id,
      },
    });

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
      throw new Error("Message Insertion Error");
    }
  } catch (err) {
    throw new Error(err);
  }
}
