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

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.post(
  "/create-follow-up-draft/:userId/:professorId/:threadId",
  verifyToken,
  async (req, res) => {
    const { professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, message } = req.body;
    const userId = req.user.sub;

    if (!to || !fromName || !fromEmail) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { data: tokenData, error: fetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenData) {
      return res.status(401).json({ message: "Auth tokens not found" });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

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

      const trackingId = uuidv4();
      const raw = makeReplyBody(
        to,
        fromName,
        fromEmail,
        subject,
        message,
        inReplyTo
      );

      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId } },
      });

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
        return res.status(400).json({ message: "Insertion Error" });
      }

      return res.status(200).json({ draftId: draft.data.id });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error", error });
    }
  }
);

router.post(
  "/send-follow-up/:userId/:draftId/:trackingId",
  verifyToken,
  async (req, res) => {
    const { draftId, trackingId } = req.params;
    const userId = req.user.sub;
    try {
      const { data: tokenData, error: tokenFetchError } =
        await req.supabaseClient
          .from("User_Profiles")
          .select("gmail_auth_token, gmail_refresh_token")
          .eq("user_id", userId)
          .single();

      if (tokenFetchError || !tokenData) {
        return res.status(400).json({ message: "Missing or invalid tokens" });
      }

      oauth2Client.setCredentials({
        access_token: tokenData.gmail_auth_token,
        refresh_token: tokenData.gmail_refresh_token,
      });

      await oauth2Client.getAccessToken();
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

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
  "/resume-follow-up-draft/:userId/:professorId",
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

    if (draftFetchError || !draftData?.draft_id) {
      return res.status(200).json({ draftExists: false });
    }

    const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (
      tokenFetchError ||
      !tokenData?.gmail_auth_token ||
      !tokenData?.gmail_refresh_token
    ) {
      return res.status(401).json({ message: "Missing Gmail tokens" });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

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
  "/delete-follow-up-draft/:userId/:draftId",
  verifyToken,
  async (req, res) => {
    const { draftId } = req.params;
    const userId = req.user.sub;
    const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (
      tokenFetchError ||
      !tokenData ||
      !tokenData.gmail_auth_token ||
      !tokenData.gmail_refresh_token
    ) {
      return res.status(404).json({ message: "Tokens not found" });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

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
  "/update-follow-up-draft/:userId/:professorId/:threadId",
  async (req, res) => {
    const { professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, body } = req.body;

    const userId = req.user.sub;

    const { data: draftData, error: draftFetchError } = await req.supabaseClient
      .from("Emails")
      .select("draft_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "replydraft")
      .eq("sent", false)
      .single();

    if (!draftData || draftFetchError || !draftData.draft_id) {
      return res.status(401).json({ updated: false });
    }

    const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (!tokenData || tokenFetchError) {
      return res.status(401).json({ updated: false });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

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
      const draft = await gmail.users.drafts.update({
        userId: "me",
        id: draftData.draft_id,
        requestBody: { message: { raw, threadId } },
      });

      return res.status(200).json({ updated: true });
    } catch (err) {
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



/**
 * 
router.post(
  "/create-draft/:userId/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const { to, fromName, fromEmail, subject, message } = req.body;
    const userId = req.user.sub;

    if (!to || !fromName || !fromEmail || !message) {
      return res.status(400).json({message: "Missing Data"});
    }

    const { data: tokenData, error: fetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenData) {
      return res.status(401).json({message: ""});
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();
      //Create the body
      const trackingId = uuidv4();
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const raw = makeBody(to, fromName, fromEmail, subject, message);
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });
      const { error: insertionError } = await req.supabaseClient
        .from("Emails")
        .insert([
          {
            user_id: userId,
            professor_id: parseInt(professorId),
            draft_id: draft.data.id,
            type: "first",
            tracking_id: trackingId,
          },
        ]);

      if (insertionError) {
        return res.status(400).json({ message: "Insertion Error" });
      }

      return res.status(200).json({ draftId: draft.data.id });
    } catch {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);
 */
