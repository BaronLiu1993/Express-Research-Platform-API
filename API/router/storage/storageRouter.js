import express from "express";
import { verifyToken } from "../../services/authServices.js";
import {
  generateGetPresignedURL,
  generateUploadPresignedURL,
} from "../../services/storageServices.js";

const router = express.Router();

router.post("/generate-upload-url", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { fileName, fileType } = req.body;
  try {
    const presignedURLData = await generateUploadPresignedURL({
      userId,
      fileName,
      fileType,
    });

    const { error: insertionError } = await req.supabaseClient
      .from("User_Profiles")
      .update({ fileType: fileName });

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Insert" });
    }

    return res.status(200).json({ urlData: presignedURLData });
  } catch (err) {
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
    return res.status(200).json({ urlData: presignedURLData });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
