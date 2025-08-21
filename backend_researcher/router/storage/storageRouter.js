import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { uploadInstance } from "./storageMiddleware.js";
import { Readable } from "node:stream";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.get("/get-file-links/:userId", verifyToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: linkData, error: fetchDataError } = await req.supabaseClient
      .from("User_Profiles")
      .select("transcript, resume")
      .eq("user_id", userId)
      .single();

    if (fetchDataError) {
      return res.status(400).json({ message: "Data Fetch Error" });
    }
    return res.status({ data: linkData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Uploading Transcripts

router.post("/upload-transcript-links/:userId", verifyToken, uploadInstance.single("file"), async (req, res) => {
    const { userId } = req.params;
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    try {
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

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.create({
        requestBody: {
          name: file.originalname,
          mimeType: file.mimetype,
        },
        media: {
          mimeType: file.mimetype,
          body: bufferStream,
        },
      });

      const { error: insertionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({ transcript: response.data.id })
        .eq("user_id", userId);
      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }
      return res.status(200).json({ message: "Successfully Inserted" });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//Uploading Resumes
router.post("/upload-resume-links/:userId", verifyToken, uploadInstance.single("file"),
  async (req, res) => {
    const userId = req.user.sub;
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    console.log(userId);

    try {
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
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.create({
        requestBody: {
          name: file.originalname,
          mimeType: file.mimetype,
        },
        media: {
          mimeType: file.mimetype,
          body: bufferStream,
        },
      });

      const { error: insertionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({ resume: response.data.id })
        .eq("user_id", userId);

      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }
      return res.status(200).json({ message: "Successfully Inserted" });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.get("/get-resume/:userId", verifyToken, async (req, res) => {
  const userId = req.user.sub;

  try {
    const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (!tokenData || tokenFetchError || !tokenData.gmail_auth_token) {
      return res.status(401).json({
        success: false,
        reauthRequired: true,
      });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      await oauth2Client.getAccessToken(); 
    } catch {
      return res.status(401).json({
        success: false,
        reauthRequired: true,
      });
    }

    const { data: resumeData, error: resumeDataFetchError } = await req.supabaseClient
      .from("User_Profiles")
      .select("resume")
      .eq("user_id", userId)
      .single();

    if (resumeDataFetchError || !resumeData?.resume) {
      return res.status(200).json({
        success: false,
        reauthRequired: false,
      });
    }

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const fileId = resumeData.resume;

    const response = await drive.files.get({
      fileId,
      fields: "id, name, webViewLink, webContentLink",
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch {
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


router.get("/get-transcript/:userId", verifyToken, async (req, res) => {
  const userId = req.user.sub
  try {
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

    const { data: transcriptData, error: transcriptDataFetchError } =
      await req.supabaseClient
        .from("User_Profiles")
        .select("transcript")
        .eq("user_id", userId)
        .single();

    if (transcriptDataFetchError) {
      return res
        .status(200)
        .json({ success: false, data: "Transcript Fetch Error" });
    }
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const fileId = transcriptData.transcript;
    const response = await drive.files.get({
      fileId,
      fields: "id, name, webViewLink, webContentLink",
    });
    return res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

export default router;
