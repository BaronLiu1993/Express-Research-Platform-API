import express from "express";
import { google } from "googleapis";
import {
  configureOAuth,
  extractHtmlOrPlainText,
} from "../../services/googleServices.js";
import { makeReplyBody } from "../../services/googleServices.js";
import { makeBody } from "../../services/googleServices.js";

import { v4 as uuidv4 } from "uuid";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();

router.post(
  "/create-follow-up-draft/:professorId/:threadId",
  verifyToken,
  async (req, res) => {
    const { professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, message } = req.body;
    const userId = req.user.sub;

    // Log the incoming parameters and body
    console.log("Received parameters:", { professorId, threadId });
    console.log("Received body:", {
      to,
      fromName,
      fromEmail,
      subject,
      message,
    });
    console.log("User ID:", userId);

    // Validate required fields
    if (!to || !fromName || !fromEmail) {
      console.log("Missing required fields"); // Log if any required field is missing
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Configure OAuth
    console.log("Configuring OAuth...");
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    try {
      // Fetch the thread using Gmail API
      console.log("Fetching thread...");
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
      });

      console.log("Thread data fetched:", thread.data);

      const messages = thread.data.messages;
      const lastMessage = messages[messages.length - 1];
      console.log("Last message in the thread:", lastMessage);

      // Extract Message-ID for the reply
      const messageIdHeader = lastMessage.payload.headers.find(
        (h) => h.name === "Message-ID"
      );
      const inReplyTo = messageIdHeader?.value;
      console.log("In-Reply-To message ID:", inReplyTo);

      // Generate tracking ID
      const trackingId = uuidv4();
      console.log("Generated tracking ID:", trackingId);

      // Prepare raw message body
      console.log("Creating raw message body...");
      const raw = await makeReplyBody({
        to,
        from: fromEmail,
        name: fromName,
        subject,
        html: message,
        inReplyToMessageId: inReplyTo,
      });

      // Create draft using Gmail API
      console.log("Creating draft...");
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId } },
      });

      console.log("Draft created:", draft.data);

      // Insert into Supabase
      console.log("Inserting draft info into Supabase...");
      const { error: insertionError } = await req.supabaseClient
        .from("Emails")
        .insert({
          user_id: userId,
          thread_id: threadId,
          professor_id: parseInt(professorId),
          draft_id: draft.data.id,
          type: "replydraft",
          tracking_id: trackingId,
        });

      if (insertionError) {
        console.log("Error inserting into Supabase:", insertionError);
        return res.status(400).json({ message: "Insertion Error" });
      }

      // Respond with the draft ID
      console.log("Draft creation successful. Draft ID:", draft.data.id);
      return res.status(200).json({ draftId: draft.data.id });
    } catch (error) {
      console.error("Error processing request:", error);
      return res.status(500).json({ message: "Internal Server Error", error });
    }
  }
);

router.post(
  "/send-follow-up/:draftId/:trackingId",
  verifyToken,
  async (req, res) => {
    const { draftId, trackingId } = req.params;
    const userId = req.user.sub;
    try {
      const gmail = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
      });

      const sendResponse = await gmail.users.drafts.send({
        userId: "me",
        requestBody: {
          id: draftId,
        },
      });

      const { threadId, id: messageId } = sendResponse.data;

      await req.supabaseClient
        .from("Emails")
        .update({
          thread_id: threadId,
          sent_at: new Date().toISOString(),
          sent: true,
        })
        .eq("draft_id", draftId);

      await req.supabaseClient.from("Messages").insert({
        thread_id: threadId,
        message_id: messageId,
        tracking_id: trackingId,
        type: "reply",
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed To Send" });
    }
  }
);

router.get(
  "/resume-follow-up-draft/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;

    const { data: draftData, error: draftFetchError } = await req.supabaseClient
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "replydraft")
      .eq("sent", false)
      .single();

    if (draftFetchError) {
      return res.status(400).json({ message: "Failed to Fetch Draft" });
    }

    try {
      const gmail = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
      });

      const draft = await gmail.users.drafts.get({
        userId: "me",
        id: draftData.draft_id,
      });

      const payload = draft.data.message.payload;
      const headers = payload.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const htmlBody = extractHtmlOrPlainText(payload);

      return res.status(200).json({
        tracking_id: draftData.tracking_id,
        draft_id: draftData.draft_id,
        draftExists: true,
        subject,
        body: htmlBody,
      });
    } catch (error) {
      if (error.response?.data?.error?.code === 401) {
        return res
          .status(401)
          .json({ draftExists: false, error: "Unauthorized" });
      }
      return res
        .status(500)
        .json({ draftExists: false, error: "Internal Server Error" });
    }
  }
);

router.delete(
  "/delete-follow-up-draft/:draftId",
  verifyToken,
  async (req, res) => {
    const { draftId } = req.params;
    const userId = req.user.sub;

    try {
      const gmail = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
      });

      await gmail.users.drafts.delete({
        userId: "me",
        id: draftId,
      });

      const { error: draftDeleteError } = await req.supabaseClient
        .from("Emails")
        .delete()
        .eq("draft_id", draftId)
        .single();

      if (draftDeleteError) {
        return res.status(400).json({ message: "Failed To Delete" });
      }

      return res.status(200).json({ message: "Draft deleted successfully" });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Errors" });
    }
  }
);

router.put(
  "/update-follow-up-draft/:professorId/:threadId",
  verifyToken,
  async (req, res) => {
    const { professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, body } = req.body;
    console.log("fired");
    const userId = req.user.sub;

    const { data: draftData, error: draftFetchError } = await req.supabaseClient
      .from("Emails")
      .select("draft_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "replydraft")
      .eq("sent", false)
      .single();
    console.log(draftData);
    console.log(draftFetchError);
    if (!draftData || draftFetchError || !draftData.draft_id) {
      return res.status(401).json({ updated: false });
    }

    try {
      const gmail = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
      });

      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
      });

      const messages = thread.data.messages;
      const lastMessage = messages[messages.length - 1];

      const messageIdHeader = lastMessage.payload.headers.find(
        (h) => h.name === "Message-ID"
      );
      const inReplyTo = messageIdHeader?.value;

      const raw = await makeReplyBody(
        to,
        fromName,
        fromEmail,
        subject,
        body,
        inReplyTo
      );

      await gmail.users.drafts.update({
        userId: "me",
        id: draftData.draft_id,
        requestBody: { message: { raw, threadId } },
      });

      return res.status(200).json({ updated: true });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ updated: false });
    }
  }
);

//Require someone to delete the workflow first and then restart again

router.get("/resume-draft/:draftId", verifyToken, async (req, res) => {
  const { draftId } = req.params;
  const userId = req.user.sub;

  if (!draftId) {
    return res.status(200).json({
      draftExists: false,
    });
  }

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftId,
    });

    //Parsing the payload and breaking it down
    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const htmlBody = extractHtmlOrPlainText(payload);

    return res.status(200).json({
      draftExists: true,
      subject: subject,
      body: htmlBody,
    });
  } catch (error) {
    if (error.response?.data?.error?.code === 401) {
      return res.status(200).json({ draftExists: false });
    }
    console.log(error);
    return res.status(500).json({ draftExists: false });
  }
});

router.put("/update-draft/:draftId", verifyToken, async (req, res) => {
  const { draftId } = req.params;
  const { to, fromName, fromEmail, subject, body } = req.body;
  const userId = req.user.sub;

  if (!draftId) {
    return res.status(401).json({ updated: false });
  }

  const gmail = await configureOAuth({ userId, supabase: req.supabaseClient });

  const raw = await makeBody({
    to,
    from: fromEmail,
    name: fromName,
    subject,
    html: body,
  });

  try {
    await gmail.users.drafts.update({
      userId: "me",
      id: draftId,
      requestBody: { message: { raw } },
    });

    return res.status(200).json({ updated: true, subject, body });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ updated: false });
  }
});

router.delete("/delete-draft/:draftId", verifyToken, async (req, res) => {
  const { draftId } = req.params;
  const userId = req.user.sub;
  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });

    const { error: draftDeleteError } = await req.supabaseClient
      .from("Emails")
      .delete()
      .eq("draft_id", draftId)
      .single();

    if (draftDeleteError) {
      return res.status(400).json({ message: "Failed To Delete" });
    }

    return res.status(200).json({ message: "Deleted Successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Errors" });
  }
});

export default router;
