import express from "express";
import { verifyToken } from "../../services/authServices.js";
import {
  deleteFile,
  generateGetPresignedURL,
  generateUploadPresignedURL,
} from "../../services/storageServices.js";

const router = express.Router();

router.post("/generate-upload-url/resume", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    return res.status(400).json({ message: "Invalid File Name of File Type" });
  }

  try {
    const presignedURLData = await generateUploadPresignedURL({
      userId,
      fileName: `${userId}-resume`,
      fileType,
    });

    const { error: insertionError } = await req.supabaseClient
      .from("User_Profiles")
      .update({ resume: fileName, resume_path: `${userId}-resume` })
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
    const userId = req.user.sub;
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ message: "Invalid File Name or File Type" });
    }
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
  const userId = req.user.sub;
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
  const userId = req.user.sub;
  const { fileType, fileName } = req.query;
  console.log(fileType);
  console.log(fileName);
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
  "/delete-file/resume/:fileName",
  verifyToken,
  async (req, res) => {
    const userId = req.user.sub;
    const { fileName } = req.params;

    try {
      await deleteFile({
        userId,
        fileType: "resume",
        fileName,
      });

      const { error: deletionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({
          resume: null,
          resume_path: null,
        })
        .eq("user_id", userId)
        .single();

      if (deletionError) {
        return res.status(400).json({ message: "Failed To Delete!" });
      }

      return res.status(200).json({ message: "Deleted Resources" });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.delete(
  "/delete-file/transcript/:fileName",
  verifyToken,
  async (req, res) => {
    const userId = req.user.sub;
    const { fileName } = req.params;

    try {
      await deleteFile({
        userId,
        fileType: "transcript",
        fileName,
      });

      const { error: deletionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({
          transcript: null,
          transcript_path: null,
        })
        .eq("user_id", userId)
        .single();

      if (deletionError) {
        return res.status(400).json({ message: "Failed To Delete!" });
      }

      return res.status(200).json({ message: "Deleted Resources" });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router;
