import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeReplyBody } from "../services/googleServices.js";
import { makeBody } from "../services/googleServices.js";
import { extractHtmlOrPlainText } from "../services/googleServices.js";
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
  console.log(fromEmail);
  console.log(fromName); //get the fromname to work and the fromemail it is not passing through for some reason
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

    console.log(draft);

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

    console.log(insertionError);

    if (insertionError) {
      throw new Error("Failed to Insert");
    }

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
    const googleClients = await configureOAuth({
      userId,
      supabase,
      fetchDrive: true,
    });
    const gmail = googleClients.gmail;
    const drive = googleClients.gmail;

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

    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileDataError || !fileData) {
      throw new Error("No Files Found");
    }

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
    const { data: fileData, error: fileDataError } = await supabase
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileDataError || !fileData) {
      throw new Error("Failed To Find Files To Attach and Send");
    }

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
