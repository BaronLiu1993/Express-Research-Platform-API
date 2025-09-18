import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { uploadInstance } from "./storageMiddleware.js";
import { Readable } from "node:stream";
import { decryptToken, verifyToken } from "../../services/authServices.js";
import { configureOAuth } from "../../services/googleServices.js";

const router = express.Router();
dotenv.config();

router.get("/get-file-links", verifyToken, async (req, res) => {
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

router.post(
  "/upload-transcript-links",
  verifyToken,
  uploadInstance.single("file"),
  async (req, res) => {
    const userId = req.user.sub;
    console.log(userId);
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    console.log("fired");
    try {
      const oAuthClient = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
        fetchDrive: true,
      });

      const drive = oAuthClient.drive;

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

      const { error: insertionError } = await req.supabaseClient
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
  "/upload-resume-links",
  verifyToken,
  uploadInstance.single("file"),
  async (req, res) => {
    const userId = req.user.sub;
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    try {
      
      const oAuthClient = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
        fetchDrive: true,
      });
      
      const drive = oAuthClient.drive
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

router.get("/get-resume", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: resumeData, error: resumeDataFetchError } =
      await req.supabaseClient
        .from("User_Profiles")
        .select("resume")
        .eq("user_id", userId)
        .single();

    if (resumeDataFetchError || !resumeData?.resume) {
      return res.status(200).json({
        success: false,
        message: "Transcript Fetch Error",
      });
    }

    const oAuthClient = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
      fetchDrive: true,
    });

    const drive = oAuthClient.drive;

    const fileId = resumeData.resume;
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

router.get("/get-transcript", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: transcriptData, error: transcriptDataFetchError } =
      await req.supabaseClient
        .from("User_Profiles")
        .select("transcript")
        .eq("user_id", userId)
        .single();

    if (transcriptDataFetchError) {
      return res
        .status(200)
        .json({ success: false, message: "Transcript Fetch Error" });
    }
    const oAuthClient = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
      fetchDrive: true,
    });
    const drive = oAuthClient.drive;
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
