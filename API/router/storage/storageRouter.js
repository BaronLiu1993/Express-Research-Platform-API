import express from "express";
import { verifyToken } from "../../services/authServices.js";
import {
  deleteFile,
  generateGetPresignedURL,
  generateUploadPresignedURL,
} from "../../services/storageServices.js";

import { AuthIdSchema } from "../../schema/authSchema.js";
import {
  BodySchema,
  DeleteFileParamsSchema,
} from "../../schema/storageSchema.js";

const router = express.Router();

router.post("/generate-upload-url/resume", verifyToken, async (req, res) => {
  const authParsed = AuthIdSchema.safeParse(req.user);
  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token.",
    });
  }

  const userId = authParsed.data.sub;
  const bodyParsed = BodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({
      message: "Invalid request body.",
    });
  }

  const { fileName, fileType } = bodyParsed.data;

  try {
    const presignedURLData = await generateUploadPresignedURL({
      userId,
      fileName: `${userId}-resume`,
      fileType,
    });

    const { error: insertionError } = await req.supabaseClient
      .from("User_Profiles")
      .update({
        resume: fileName,
        resume_path: `${userId}-resume`,
      })
      .eq("user_id", userId);

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Insert" });
    }

    return res.status(200).json({ urlData: presignedURLData });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post(
  "/generate-upload-url/transcript",
  verifyToken,
  async (req, res) => {
    const authParsed = AuthIdSchema.safeParse(req.user);

    if (!authParsed.success) {
      return res.status(401).json({
        message: "Invalid auth token.",
      });
    }

    const userId = authParsed.data.sub;

    const bodyParsed = BodySchema.safeParse(req.body);

    if (!bodyParsed.success) {
      return res.status(400).json({
        message: "Invalid File Name or File Type",
      });
    }

    const { fileName, fileType } = bodyParsed.data;

    try {
      const presignedURLData = await generateUploadPresignedURL({
        userId,
        fileName: `${userId}-transcript`,
        fileType,
      });

      const { error: insertionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({
          transcript: fileName,
          transcript_path: `${userId}-transcript`,
        })
        .eq("user_id", userId);

      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }

      return res.status(200).json({ urlData: presignedURLData });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.get("/check-file-existance", verifyToken, async (req, res) => {
  const authParsed = AuthIdSchema.safeParse(req.user);

  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token.",
    });
  }

  const userId = authParsed.data.sub;

  try {
    const { data: fileData, error: fileError } = await req.supabaseClient
      .from("User_Profiles")
      .select("resume, transcript")
      .eq("user_id", userId)
      .single();

    if (fileError) {
      return res.status(400).json({ message: "Failed to Retrieve Data" });
    }

    const resumeExists = Boolean(fileData?.resume);
    const transcriptExists = Boolean(fileData?.transcript);

    return res.status(200).json({
      resumeExists,
      resumeName: `${userId}-resume`,
      transcriptExists,
      transcriptName: `${userId}-transcript`,
    });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-file-url", verifyToken, async (req, res) => {
  const authParsed = AuthIdSchema.safeParse(req.user);

  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token.",
    });
  }

  const userId = authParsed.data.sub;

  const queryParsed = BodySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({
      message: "Invalid query parameters.",
    });
  }

  const { fileType, fileName } = queryParsed.data;
  try {
    const presignedURLData = await generateGetPresignedURL({
      userId,
      fileType,
      fileName,
    });

    return res.status(200).json({ url: presignedURLData });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete(
  "/delete-file/:fileType/:fileName",
  verifyToken,
  async (req, res) => {
    const authParsed = AuthIdSchema.safeParse(req.user);
    if (!authParsed.success) {
      return res.status(401).json({ message: "Invalid auth token." });
    }

    const userId = authParsed.data.sub;

    const paramsParsed = DeleteFileParamsSchema.safeParse(req.params);

    if (!paramsParsed.success) {
      return res.status(400).json({
        message: "Invalid route parameters.",
      });
    }

    const { fileType, fileName } = paramsParsed.data;

    try {
      await deleteFile({ userId, fileType, fileName });

      const update =
        fileType === "resume"
          ? { resume: null, resume_path: null }
          : { transcript: null, transcript_path: null };

      const { error: deletionError } = await req.supabaseClient
        .from("User_Profiles")
        .update(update)
        .eq("user_id", userId)
        .single();

      if (deletionError) {
        return res.status(400).json({ message: "Failed To Delete!" });
      }

      return res.status(200).json({ message: "Deleted Resources" });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router;
