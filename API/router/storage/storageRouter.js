import express from "express";
import { verifyToken } from "../../services/authServices.js";
import {
  generateGetPresignedURL,
  generateUploadPresignedURL,
} from "../../services/storageServices.js";

const router = express.Router();

async function processFileName(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\..*$/, "");
}

router.post("/generate-upload-url/resume", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { fileName, fileType } = req.body;
  if (!fileName || !fileType) {
    return res.status(400).json({ message: "Invalid File Name of File Type" });
  }

  const newFileName = await processFileName(fileName);
  try {
    const presignedURLData = await generateUploadPresignedURL({
      userId,
      fileName: newFileName,
      fileType,
    });

    const { error: insertionError } = await req.supabaseClient
      .from("User_Profiles")
      .update({ resume: newFileName })
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
        .json({ message: "Invalid File Name of File Type" });
    }

    const newFileName = await processFileName(fileName);
    try {
      const presignedURLData = await generateUploadPresignedURL({
        userId,
        fileName: newFileName,
        fileType,
      });

      const { error: insertionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({ transcript: fileName })
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
    return res
      .status(200)
      .json({
        resumeExists,
        resumeName: fileData.resume,
        transcriptExists,
        transcriptName: fileData.transcript,
      });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-file-url", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { fileType, fileName } = req.query;
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

export default router;
