import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { sendReply } from "../../services/emailServices.js";
import { SendReplyBodySchema, ReplyQuerySchema } from "../../schema/replySchema.js";

const router = express.Router();


router.post("/send-reply", verifyToken, async (req, res) => {
  const queryParsed = ReplyQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ message: "Missing Input Fields" });
  }
  const { messageId } = queryParsed.data;

  const bodyParsed = SendReplyBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ message: "Missing Input Fields" });
  }
  const { userEmail, userName, professorEmail, professorName, body, subject, threadId } =
    bodyParsed.data;
  const userId = req.user.sub;


  try {
    const sendResponse = await sendReply({
      userId,
      userEmail,
      userName,
      professorEmail,
      professorName,
      body,
      subject,
      accessToken: req.token,
      messageId,
      threadId
    });


    if (sendResponse.success) {
      return res.status(200).json({ message: "Sent Successfully!" });
    } else {
      return res.status(400).json({ message: "Failed To Send" });
    }
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
