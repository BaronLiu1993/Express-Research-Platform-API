import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeBody } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { configureOAuth } from "../services/googleServices.js";
import { simpleParser } from "mailparser";

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
      headers: { Authorization: `Bearer ${accessToken}` },
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

    const trackingPixel = `<img src="https://test.com/engagement/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;
    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    const payload = draft.data.message.payload;
    let base64UrlData = draft.data.message.payload.parts[1].body.data;
    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");
    const parentMessageIdHeader = payload.headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      return res.status(400).json({ message: "Failed to Parse" });
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
        subject: subject,
        type: "first",
        name: body.professorName,
        email: body.professorEmail
      });

    if (messageInsertionError) {
      throw new Error("Failed to Insert into Database");
    }

    return { message: "Successfully Sent!" };
  } catch (err) {
    return { message: "Internal Server Error" };
  }
}
