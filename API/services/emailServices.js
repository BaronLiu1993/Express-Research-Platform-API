import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeBody, makeReplyBody } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { configureOAuth } from "../services/googleServices.js";
import { simpleParser } from "mailparser";
import { generateGetPresignedURL } from "./storageServices.js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BACKEND_API_BASE = process.env.BACKEND_API_BASE;

async function getHeader(headers = [], name) {
  return (
    headers.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())
      ?.value || null
  );
}

export async function generateDraftFromSnippetEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail, toName } = body;

  if (!snippetId || !to || !fromName || !fromEmail || !toName) {
    return { message: "Missing Inputs", completed: false };
  }

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
      .eq("id", snippetId)
      .single();

    if (snippetError) {
      return { message: "Snippet Error", completed: false };
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
      html: html,
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
      return { message: "Insertion Error", completed: true };
    }

    return { message: "Draft successfully created", completed: true };
  } catch (err) {
    return { message: "Failed to create draft", completed: false };
  }
}

export async function generateDraftEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const { to, fromName, fromEmail, toName, html, subject } = body;

  if (!to || !fromName || !fromEmail || !toName || !html || !subject) {
    return { message: "Missing Inputs", completed: false };
  }
  const trackingId = uuidv4();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    const gmail = await configureOAuth({ userId, supabase });

    const raw = await makeBody({
      to,
      from: fromName,
      name: fromEmail,
      subject,
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
      return { message: "Insertion Error", completed: true };
    }

    return { message: "Draft successfully created", completed: true };
  } catch (err) {
    return { message: "Failed to create draft", completed: false };
  }
}

export async function sendSnippetEmail({
  userId,
  userEmail,
  userName,
  body,
  accessToken,
  labelId
}) {
  if (
    !userId ||
    !userEmail ||
    !userName ||
    !body?.professorId ||
    !body?.professorEmail ||
    !accessToken ||
    !labelId
  ) {
    throw new Error("Missing required inputs");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  try {
    const gmail = await configureOAuth({ userId, supabase });

    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("id", body.id)
      .single();

    if (draftFetchError) {
      throw new Error("Failed to Fetch Drafts");
    }

    const trackingPixel = `<img src="${BACKEND_API_BASE}/engagement/hi.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    let base64UrlData = draft.data.message.payload.parts[1].body.data;

    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");
    const parentMessageIdHeader = headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      throw new Error("Base 64 URL Data is not a string.");
    }

    const base64Data = base64UrlData.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");
    const parsedData = await simpleParser(buffer);
    const htmlBody = parsedData.headerLines[0].line;

    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = await makeBody({
      to: body.professorEmail,
      from: userEmail,
      name: userName,
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
      requestBody: { id: draftData.draft_id },
    });

    await gmail.users.messages.modify({
      userId: "me",
      id: sendResponse.data.id,
      requestBody: {
        addLabelIds: [labelId]  
      }
    });

    const { error: deletionError } = await supabase
      .from("Emails")
      .delete()
      .eq("draft_id", draftData.draft_id);

    if (deletionError) {
      throw new Error("Failed to Delete");
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: parentMessageIdHeader,
        tracking_id: draftData.tracking_id,
        subject: subject.value,
        type: "first",
        name: body.professorName,
        email: body.professorEmail,
        identifier_id: sendResponse.data.id,
      });

    if (messageInsertionError) {
      throw new Error("Failed to Insert into Database");
    }

    return { message: "Successfully Sent!" };
  } catch (err) {
    return { message: "Internal Server Error" };
  }
}

export async function sendSnippetEmailWithAttachments({
  userId,
  userEmail,
  userName,
  body,
  accessToken,
  labelId
}) {
  if (
    !userId ||
    !userEmail ||
    !userName ||
    !body?.professorId ||
    !body?.professorEmail ||
    !accessToken || 
    !labelId
  ) {
    throw new Error("Missing required inputs");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  try {
    const gmail = await configureOAuth({ userId, supabase });

    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("id", body.id)
      .single();

    const { data: fileData, error: fileError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript, resume_path, transcript_path")
      .eq("user_id", userId)
      .single();

    if (fileError) {
      throw new Error("Failed To Find File.");
    }

    const attachments = [];

    if (fileData.resume && fileData.resume_path) {
      try {
        const body = await generateGetPresignedURL({
          fileType: "resume",
          fileName: fileData.resume_path,
          userId,
        });
        attachments.push({
          filename: fileData.resume,
          path: body.signedUrl,
          contentType: "application/pdf",
        });
      } catch (err) {
        throw new Error("No Files Found");
      }
    }

    if (fileData.transcript && fileData.transcript_path) {
      try {
        const body = await generateGetPresignedURL({
          fileType: "transcript",
          fileName: fileData.transcript_path,
          userId,
        });

        attachments.push({
          filename: fileData.transcript,
          path: body.signedUrl,
          contentType: "application/pdf",
        });
      } catch (err) {
        throw new Error("No Files Found");
      }
    }

    if (draftFetchError) {
      throw new Error("Failed to Fetch Drafts");
    }

    const trackingPixel = `<img src="${BACKEND_API_BASE}/engagement/hi.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    let base64UrlData = draft.data.message.payload.parts[1].body.data;

    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");
    const parentMessageIdHeader = headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      throw new Error("Base 64 URL Data is not a string.");
    }

    const base64Data = base64UrlData.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");
    const parsedData = await simpleParser(buffer);
    const htmlBody = parsedData.headerLines[0].line;

    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = await makeBody({
      to: body.professorEmail,
      from: userEmail,
      name: userName,
      subject,
      html: finalHtmlBody,
      attachments: attachments,
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

    await gmail.users.messages.modify({
      userId: "me",
      id: sendResponse.data.id,
      requestBody: {
        addLabelIds: [labelId]  
      }
    });

    const { error: deletionError } = await supabase
      .from("Emails")
      .delete()
      .eq("draft_id", draftData.draft_id);

    if (deletionError) {
      throw new Error("Failed to Delete");
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: parentMessageIdHeader,
        tracking_id: draftData.tracking_id,
        subject: subject.value,
        type: "first",
        name: body.professorName,
        email: body.professorEmail,
        identifier_id: sendResponse.data.id,
      });

    if (messageInsertionError) {
      throw new Error("Failed to Insert into Database");
    }

    return { message: "Successfully Sent!" };
  } catch (err) {
    return { message: "Internal Server Error" };
  }
}

export async function sendReply({
  userId,
  userEmail,
  userName,
  professorEmail,
  professorName,
  body,
  subject,
  accessToken,
  messageId,
  threadId,
}) {
  try {
    const trackingId = uuidv4();

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });


    // Configure Gmail OAuth
    const gmail = await configureOAuth({ userId, supabase });
    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
  
    const replyId = await getHeader(message.data.payload.headers, 'Message-Id')
  
    const raw = await makeReplyBody({
      to: professorEmail,
      from: userEmail,
      name: userName,
      subject,
      html: body,
      inReplyToMessageId: replyId,
      trackingId: trackingId,
    });

    // Send email via Gmail API
    const sendResponse = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: raw,
        threadId: threadId,
      },
    });

    // Insert message into Supabase
    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: threadId,
        message_id: messageId,
        tracking_id: trackingId,
        subject: subject,
        type: "reply",
        name: professorName,
        email: professorEmail,
        identifier_id: sendResponse.data.id,
      });

    if (messageInsertionError) {
      throw new Error("Failed to Insert into Database");
    }


    return { message: "Successfully Sent!", success: true };
  } catch (error) {
    return { message: "Internal Server Error", success: false };
  }
}


export async function sendEmailWithAttachments({
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
      .eq("id", body.id)
      .single();

    if (draftFetchError) {
      throw new Error("Failed to Fetch Drafts");
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

    const trackingPixel = `<img src="${BACKEND_API_BASE}/engagement/hi.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    let base64UrlData = draft.data.message.payload.parts[1].body.data;

    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");
    const parentMessageIdHeader = headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      throw new Error("Base 64 URL Data is not a string.");
    }

    const base64Data = base64UrlData.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");
    const parsedData = await simpleParser(buffer);
    const htmlBody = parsedData.headerLines[0].line;

    const finalHtmlBody = htmlBody + trackingPixel;

    const raw = await makeBody({
      to: body.professorEmail,
      from: userName,
      name: userEmail,
      subject,
      html: finalHtmlBody,
      attachments: attachments,
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

    const { error: deletionError } = await supabase
      .from("Emails")
      .delete()
      .eq("draft_id", draftData.draft_id);

    if (deletionError) {
      throw new Error("Failed to Delete");
    }

    const { error: messageInsertionError } = await supabase
      .from("Messages")
      .insert({
        user_id: userId,
        thread_id: sendResponse.data.threadId,
        message_id: parentMessageIdHeader,
        tracking_id: draftData.tracking_id,
        subject: subject.value,
        type: "first",
        name: body.professorName,
        email: body.professorEmail,
        identifier_id: sendResponse.data.id,
      });

    return { message: "Successfully Sent!" };
  } catch (err) {
    throw new Error(err);
  }
}
