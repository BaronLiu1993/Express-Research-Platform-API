import { supabase } from "../../supabase/supabase.js";
import express from "express";
import { google } from "googleapis";
import { extractHtmlOrPlainText } from "../../services/googleServices.js";
import { makeReplyBody } from "../../services/googleServices.js";
import { makeBody } from "../../services/googleServices.js";
import { decodeBody } from "../../services/googleServices.js";

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.post(
  "/create-follow-up-draft/:userId/:professorId/:threadId",
  async (req, res) => {
    const { userId, professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, message } = req.body;

    if (!to || !fromName || !fromEmail) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Fetch Gmail auth tokens
    const { data: tokenData, error: fetchError } = await supabase
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
      const { error: insertionError } = await supabase.from("Emails").insert([
        {
          user_id: userId,
          professor_id: parseInt(professorId),
          draft_id: draft.data.id,
          type: "FollowUp",
          tracking_id: trackingId,
        },
      ]);

      if (insertionError) {
        return res.status(400).json({ message: "Insertion Error" });
      }

      return res.status(200).json({ draftId: draft.data.id });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Internal Server Error", error });
    }
  }
);

router.post(
  "/send-follow-up/:userId/:draftId/:trackingId",
  async (req, res) => {
    const { userId, draftId, trackingId } = req.params;
    console.log(draftId);
    try {
      const { data: tokenData, error: tokenFetchError } = await supabase
        .from("User_Profiles")
        .select("gmail_auth_token, gmail_refresh_token")
        .eq("user_id", userId)
        .single();

      if (tokenFetchError || !tokenData) {
        return res.status(400).json({ error: "Missing or invalid tokens" });
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

      await supabase
        .from("Emails")
        .update({
          thread_id: threadId,
          sent_at: new Date().toISOString(),
          sent: true,
        })
        .eq("draft_id", draftId);

      await supabase.from("Messages").insert({
        thread_id: threadId,
        message_id: messageId,
        tracking_id: trackingId,
        type: "FollowUp",
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed To Send" });
    }
  }
);

router.get(
  "/resume-follow-up-draft/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
 
    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "FollowUp")
      .eq("sent", false)
      .single();

    if (draftFetchError) {
      console.error(`[ERROR] Fetching draft from Supabase:`, draftFetchError);
    } else {
      console.log(`[SUCCESS] Retrieved draft data from Supabase:`, draftData);
    }

    if (!draftData || !draftData.draft_id) {
      console.warn(`[INFO] No draft found for given user and professor.`);
      return res.status(200).json({ draftExists: false });
    }

    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenFetchError) {
      console.error(
        `[ERROR] Fetching Gmail tokens from Supabase:`,
        tokenFetchError
      );
    } else {
      console.log(`[SUCCESS] Retrieved Gmail tokens from Supabase.`);
    }

    if (
      !tokenData ||
      !tokenData.gmail_auth_token ||
      !tokenData.gmail_refresh_token
    ) {
      console.warn(`[INFO] Missing Gmail tokens for user.`);
      return res.status(404).json({});
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      console.log(`[INFO] Attempting to refresh Gmail access token...`);
      await oauth2Client.getAccessToken();

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      console.log(
        `[INFO] Fetching Gmail draft with id=${draftData.draft_id}...`
      );
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
        subject: subject,
        body: htmlBody,
      });
    } catch (error) {
      console.error(
        `[ERROR] Gmail API call failed:`,
        error?.response?.data || error
      );

      if (error.response?.data?.error?.code === 401) {
        return res.status(200).json({ draftExists: false });
      }

      return res.status(500).json({ draftExists: false });
    }
  }
);


router.delete(
  "/delete-follow-up-draft/:userId/:draftId",
  async (req, res) => {
    const { userId, draftId } = req.params;
    const { data: tokenData, error: tokenFetchError } = await supabase
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
      return res.status(404).json({});
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken();
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const draft = await gmail.users.drafts.delete({
        userId: "me",
        id: draftId,
      });

      const { error: draftDeleteError } = await supabase
        .from("Emails")
        .delete()
        .eq("draft_id", draftId)
        .single();

      if (draftDeleteError) {
        return res.status(400).json({ message: "Failed To Delete" });
      }
    } catch {
      return res.status(500).json({ message: "Internal Server Errors" });
    }
  }
);

router.put(
  "/update-follow-up-draft/:userId/:professorId/:threadId",
  async (req, res) => {
    const { userId, professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, body } = req.body;

    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "FollowUp")
      .eq("sent", false)
      .single();

    console.log(draftData);

    if (!draftData || draftFetchError || !draftData.draft_id) {
      return res.status(401).json({ updated: false });
    }

    const { data: tokenData, error: tokenFetchError } = await supabase
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

      console.log(thread);

      const messages = thread.data.messages;
      const lastMessage = messages[messages.length - 1];

      const messageIdHeader = lastMessage.payload.headers.find(
        (h) => h.name === "Message-ID"
      );
      const inReplyTo = messageIdHeader?.value;
      const raw = makeReplyBody(
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

      console.log(draft);

      return res.status(200).json({ updated: true });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ updated: false });
    }
  }
);

router.post("/create-draft/:userId/:professorId", async (req, res) => {
  //Data Required
  const { userId, professorId } = req.params;
  const { to, fromName, fromEmail, subject, message } = req.body;

  if (!to || !fromName || !fromEmail || !subject || !message) {
    return res.status(400).json({});
  }

  //Get Auth Tokens
  const { data: tokenData, error: fetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  //Failed If unable to get Data
  if (fetchError || !tokenData) {
    return res.status(401).json({});
  }

  //Set credentials
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
    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
        type: "First",
        tracking_id: trackingId,
      },
    ]);

    if (insertionError) {
      return res.status(400).json({ message: "Insertion Error" });
    }

    return res.status(200).json({ draftId: draft.data.id });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Require someone to delete the workflow first and then restart again

router.get("/resume-draft/:userId/:professorId", async (req, res) => {
  //Params to get the draft data
  const { userId, professorId } = req.params;

  //Draft Data
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single();

  if (draftFetchError || !draftData || !draftData.draft_id) {
    return res.status(200).json({
      draftExists: false,
    });
  }

  const { data: tokenData, error: tokenFetchError } = await supabase
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
    return res.status(404).json({});
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

    return res.status(500).json({ draftExists: false });
  }
});

router.put("/update-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const { to, fromName, fromEmail, subject, body } = req.body;
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single();

 

  if (!draftData || draftFetchError || !draftData.draft_id) {
    return res.status(401).json({ updated: false });
  }


  const { data: tokenData, error: tokenFetchError } = await supabase
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

  const raw = makeBody(to, fromName, fromEmail, subject, body);

  try {
    await oauth2Client.getAccessToken();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const draft = await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw } },
    });

    return res.status(200).json({ updated: true });

  } catch (err) {
    return res.status(500).json({ updated: false });
  }
});


router.delete("/delete-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { error: draftDeleteError } = await supabase
      .from("Emails")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "First")
      .eq("sent", false)
      .single();

    if (draftDeleteError) {
      return res.status(400).json({ message: "Failed To Delete" });
    }
  } catch {
    return res.status(500).json({ message: "Internal Server Errors" });
  }
});

export default router