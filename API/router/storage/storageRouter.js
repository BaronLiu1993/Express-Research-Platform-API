import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { generateUploadPresignedURL } from "../../services/storageServices.js";

const router = express.Router();

router.post("/generate-upload-url", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { filename, fileType } = req.body;
  try {
    const presignedURL = await generateUploadPresignedURL({ userId, filename, fileType });
    return res.status(200).json({ url: presignedURL });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
