//Supabase Client Import
import { supabase } from "../../supabase/supabase";

//External Library Imports
import { google } from "googleapis";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

//Initialise Gmail oAuth Client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

//Defined Scopes
const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
];


router.get("/auth/gmail-data/:userId", (req, res) => {
  const userId = req.params.userId;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: userId,
  });
  res.redirect(authUrl);
});

router.get("/auth/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) {
    return res.status(400).send({ message: "Missing authorization code" });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const { error: insertionError } = await supabase
      .from("User_Profiles")
      .update({
        gmail_auth_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
      })
      .eq("user_id", userId)
      .select()
      .single();
    if (insertionError) {
      return res.status(500).json({ message: "Insertion Error" });
    }
    res.redirect("http://localhost:3000/inbox/email");
  } catch {
    res.status(500).send({ message: "Authentication failed" });
  }
});
