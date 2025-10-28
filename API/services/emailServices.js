import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeBody } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { configureOAuth } from "../services/googleServices.js";
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
    throw new Error("Missing required inputs");
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

    const trackingPixel = `<img src="https://test-q97b.onrender.com/engagement/pixel.png?analyticId=${draftData.tracking_id}" width="1" height="1" style="display:none;" />`;

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
