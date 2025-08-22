import { supabase } from "../../supabase/supabase.js";
import express from "express";
import { google } from "googleapis";
import { generateEmbeddings } from "../../services/authServices.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

//Initialise Gmail OAuth Client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

//Defined Scopes
// Redirect user to Google OAuth
router.get("/auth/google/:stateUserId", (req, res) => {
  const userId = req.params.stateUserId; 
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", 
    scope: [
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/drive.file",
    ],
    prompt: "consent",
    state: userId, 
  });
  res.redirect(authUrl);
});

router.get("/auth/oauth2callback", async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).send({ message: "No code provided" });

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let user = await getUserByEmail(tokens.id_token); 
    if (!user) {
      const newUser = {
        email: tokens.id_token.email,
        full_name: tokens.id_token.name,
        gmail_auth_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
      };
      user = await insertNewUser(newUser);
    } else {
      await updateUserTokens(user.id, tokens.access_token, tokens.refresh_token);
    }

    res.cookie("user_id", user.id, { httpOnly: true, secure: false, sameSite: "lax" });
    res.cookie("access_token", tokens.access_token, { httpOnly: true, secure: false, sameSite: "lax" });
    res.cookie("refresh_token", tokens.refresh_token, { httpOnly: true, secure: false, sameSite: "lax" });

    const redirectUrl = user.isProfileComplete ? "/dashboard" : "/register";
    res.redirect(redirectUrl);

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "OAuth failed" });
  }
});


router.get("/get-user", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return res
        .status(401)
        .json({ error: authError?.message || "Invalid user" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("User_Profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ message: "Failed to Fetch Profile" });
    }
    return res.status(200).json({ profile });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Get Enough Info for Sidebar
router.get("/get-user-sidebar-info", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("User_Profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ message: "Failed to Fetch Profile" });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_firstname: profile.student_firstname,
      student_lastname: profile.student_lastname,
      student_email: profile.student_email,
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/verify-code", async (req, res) => {
  const { email, code } = req.body;
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ session: data.session, user: data.user });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
