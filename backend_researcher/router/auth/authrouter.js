import { supabase } from "../../supabase/supabase.js";
import express from "express";
import { google } from "googleapis";
import {
  generateEmbeddings,
  verifyToken,
} from "../../services/authServices.js";
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
const scopes = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.file",
];

router.get("/signup-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/account/register",
          scopes: scopes.join(" "),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
    if (authError) {
      return res.status(400).json({ message: "Authentication Error" });
    }

    if (callbackData.url) {
      res.redirect(callbackData.url);
    }
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/signin-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/account/register", //Change later
          scopes: scopes.join(" "),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
    if (authError) {
      return res.status(400).json({ message: "Authentication Error" });
    }

    if (callbackData.url) {
      res.redirect(callbackData.url);
    }
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//login
router.post("/oauth2callback/login", async (req, res) => {
  const code = req.body.code;
  if (!code) {
    return res.status(400).json({ message: "No code provided" });
  }

  try {
    const { data: tokenData, error: tokenDataError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (tokenDataError || !tokenData.session) {
      return res.status(400).json({
        message: "Failed to exchange code for session",
        redirectURL: "/login",
      });
    }

    const { session, user } = tokenData;

    return res.status(200).json({
      user_id: user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      redirectURL: "/repository",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//Registration
router.post("/oauth2callback/register", async (req, res) => {
  const code = req.body.code;
  if (!code) {
    return res.status(400).json({ message: "No code provided" });
  }

  try {
    const { data: tokenData, error: tokenDataError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (tokenDataError || !tokenData.session) {
      return res
        .status(400)
        .json({ message: "Failed to exchange code for session" });
    }

    const { session, user } = tokenData;

    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: user.id,
        student_email: user.email,
        student_name: user.user_metadata.full_name,
        gmail_auth_token: session.provider_token,
        gmail_refresh_token: session.provider_refresh_token,
      });

    if (tokenInsertionError) {
      return res.status(400).json({ message: "User Already Exists" });
    }

    return res.status(200).json({
      user_id: user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      redirectURL: "/register",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const { data: tokenData, error: tokenDataError } =
      await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

    if (tokenDataError || !tokenData) {
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh token" });
    }

    return res.status(200).json({
      accessToken: tokenData.session.access_token,
      refreshToken: tokenData.session.refresh_token,
    });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/is-authenticated", async (req, res) => {
  console.log("check auth");
  try {
    const authHeader = req.headers.authorization;
    console.log(authHeader)

    if (!authHeader) {
      return res.status(401).json({ message: "Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ success: false, message: "Missing token" });
    }

    const { data: userData, error: userDataError } =
      supabase.auth.getUser(token);

    if (userDataError || !userData) {
      return res
        .status(400)
        .json({ success: false, message: "Failed to Get User Data" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Successfully Entered" });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

router.get("check-profile-completed", verifyToken, async (req, res) => {
  console.log("check profile");
  const userId = req.user.sub;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from("User_Profiles")
      .select("profile_completed")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ message: "Fetch Error" });
    }

    return res.status(200).json({ isComplete: profileData.profile_completed });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Registration Method
router.post("/register", verifyToken, async (req, res) => {
  console.log("fired");
  const {
    student_major,
    student_year,
    student_interests,
    student_acceptedterms,
  } = req.body;

  const userId = req.user.sub;

  console.log(userId)
  if (
    !student_major ||
    !student_year ||
    !student_interests ||
    !student_acceptedterms ||
    !userId
  ) {
    return res.status(400).json({ message: "Incomplete Information" });
  }

  try {
    const research_input_embeddings = student_interests.join();
    const embeddings = await generateEmbeddings(research_input_embeddings);

    //Insert into User_Profiles
    const { error: profileError } = await supabase
      .from("User_Profiles")
      .update({
        student_major: student_major,
        student_year: student_year,
        student_interests: student_interests,
        student_acceptedterms: student_acceptedterms,
        student_embeddings: embeddings.data[0].embedding,
        finished_registration: true,
      })
      .eq("user_id", userId)
      .single();

    if (profileError) {
      console.log(profileError)
      return res.status(400).json({ message: "Failed To Insert," });
    }
    console.log("done")
    return res.status(201).json({ message: "Sucessfully Completed Profile" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/get-user", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const { data: userData, error: authError } = await supabase.auth.getUser(
      accessToken
    );

    if (authError || !userData) {
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
    return res.status(200).json({ profile });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Get Enough Info for Sidebar
router.get("/get-user-sidebar-info", verifyToken, async (req, res) => {
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
