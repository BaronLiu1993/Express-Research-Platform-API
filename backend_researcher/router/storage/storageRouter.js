import express from "express";
import { google } from "googleapis";
import { supabase } from "../../supabase/supabase.js";
import dotenv from "dotenv";
import { uploadInstance } from "./storageMiddleware.js";
import { Readable } from "node:stream";

const router = express.Router();
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.get("/get-file-links/:userId", async (req, res) => {
  const { userId } = req.params;
  const { uploadType } = req.query;
  try {
    const { data: linkData, error: fetchDataError } = await supabase
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

router.post(
  "/upload-transcript-links/:userId",
  uploadInstance.single("file"),
  async (req, res) => {
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
      console.log(response);

      const { error: insertionError } = await supabase
        .from("User_Profiles")
        .update({ transcript: response.data.id })
        .eq("user_id", userId);
      console.log(insertionError);
      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }
      return res.status(200).json({ message: "Successfully Inserted" });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//Uploading Resumes
router.post(
  "/upload-resume-links/:userId",
  uploadInstance.single("file"),
  async (req, res) => {
    const { userId } = req.params;
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    console.log(userId);

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

      const { error: insertionError } = await supabase
        .from("User_Profiles")
        .update({ resume: response.data.id })
        .eq("user_id", userId);

      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }
      return res.status(200).json({ message: "Successfully Inserted" });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.get("/get-resume/:userId", async (req, res) => {
  const { userId } = req.params;
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

    const { data: resumeData, error: resumeDataFetchError } = await supabase
      .from("User_Profiles")
      .select("resume")
      .eq("user_id", userId)
      .single();

    if (resumeDataFetchError) {
      return res
        .status(200)
        .json({ success: false, data: "Resume Fetch Error" });
    }
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const fileId = resumeData.resume;

    const response = await drive.files.get({
      fileId,
      fields: "id, name, webViewLink, webContentLink",
    });
    return res.status(200).json({ success: true, data: response.data });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-transcript/:userId", async (req, res) => {
  const { userId } = req.params;
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

    const { data: transcriptData, error: transcriptDataFetchError } = await supabase
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
