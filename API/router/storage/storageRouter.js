import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { generateUploadPresignedURL } from "../../services/storageServices.js";

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
    return res.status(200).json({ urlData: presignedURLData });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
