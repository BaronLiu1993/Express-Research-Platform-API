import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { sendReply } from "../../services/emailServices.js";

const router = express.Router();


router.post("/send-reply", verifyToken, async (req, res) => {
  const { messageId } = req.query;
  const { userEmail, userName, professorEmail, professorName, body, subject, threadId } =
    req.body;
  const userId = req.user.sub;
  

  if (
    !userEmail ||
    !userName ||
    !professorEmail ||
    !professorName ||
    !body ||
    !messageId ||
    !subject || 
    !threadId
  ) {
    return res.status(400).json({ message: "Missing Input Fields" });
  }


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

    console.log(sendResponse)

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
