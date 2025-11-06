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
const BACKEND_API_BASE = process.env.BACKEND_API_BASE;

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
    console.log("Error: Missing required inputs");
    throw new Error("Missing required inputs");
  }

  console.log("Creating Supabase client...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  try {
    console.log("Configuring OAuth...");
    const gmail = await configureOAuth({ userId, supabase });

    console.log("Fetching draft data...");
    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", body.professorId)
      .eq("type", "draft")
      .single();

    if (draftFetchError) {
      console.log("Error fetching draft data:", draftFetchError);
      throw new Error("Failed to Fetch Drafts");
    }

    console.log("Draft data fetched:", draftData);

    const trackingPixel = `<img src="${BACKEND_API_BASE}/engagement/hi.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;
    console.log("Generated tracking pixel:", trackingPixel);

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    console.log("Fetched draft:", draft);

    const payload = draft.data.message.payload;
    let base64UrlData = draft.data.message.payload.parts[1].body.data;
    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");
    const parentMessageIdHeader = headers.find(
      (h) => h.name.toLowerCase() === "message-id"
    ).value;

    console.log("Base64 Data:", base64UrlData);
    console.log("Subject:", subject);
    console.log("Parent Message ID Header:", parentMessageIdHeader);

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      console.log("Error: Failed to parse Base64 Data");
      return res.status(400).json({ message: "Failed to Parse" });
    }

    const base64Data = base64UrlData.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");
    const parsedData = await simpleParser(buffer);
    const htmlBody = parsedData.headerLines[0].line;
    const finalHtmlBody = htmlBody + trackingPixel;

    console.log("Parsed HTML body:", parsedData.headerLines[0].line);
    console.log("Final HTML body with tracking pixel:", finalHtmlBody);

    const raw = await makeBody({
      to: body.professorEmail,
      from: userName,
      name: userEmail,
      subject,
      html: finalHtmlBody,
    });

    console.log("Generated raw email:", raw);

    await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw } },
    });

    console.log("Draft updated successfully.");

    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftData.draft_id },
    });

    console.log("Email sent successfully:", sendResponse);

    const { error: deletionError } = await supabase
      .from("Emails")
      .delete()
      .eq("draft_id", draftData.draft_id);

    if (deletionError) {
      console.log("Error deleting draft:", deletionError);
      throw new Error("Failed to Delete");
    }

    console.log("Draft deleted successfully.");

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
      console.log("Error inserting message into database:", messageInsertionError);
      throw new Error("Failed to Insert into Database");
    }

    console.log("Message inserted into database successfully.");

    return { message: "Successfully Sent!" };
  } catch (err) {
    console.log("Error:", err);
    return { message: "Internal Server Error" };
  }
}

