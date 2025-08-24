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
const scopes = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.file",
];

router.get("/signin-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/account",
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

router.post("/oauth2callback", async (req, res) => {
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

    //Perform Insertion
    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: user.id,
        student_email: user.email,
        student_name: user.user_metadata.full_name,
        gmail_auth_token: session.provider_token,
        gmail_refresh_token: session.provider_refresh_token,
      });

    if (tokenInsertionError.code == "23505") {
      return res.status(200).json({
        user_id: user.id,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        redirectURL: "repository",
      });
    }

    return res.status(200).json({
      user_id: user.id,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      redirectURL: true,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

/* 
router.get("/gmail-data/:userId", (req, res) => {
  const userId = req.params.userId;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: userId,
  });
  res.redirect(authUrl);
});

router.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) {
    return res.status(400).send({ message: "Missing authorization code or user ID" });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const { data: userData, error: fetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      console.log(fetchError)
      return res.status(500).send({ message: "Failed to fetch user data" });
    }

    const newData = {
      gmail_auth_token: tokens.access_token,
    };

    if (tokens.refresh_token) {
      newData.gmail_refresh_token = tokens.refresh_token;
    } else if (userData?.gmail_refresh_token) {
      newData.gmail_refresh_token = userData.gmail_refresh_token;
    } else {
      return res.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&response_type=code&scope=${encodeURIComponent(
          "https://www.googleapis.com/auth/drive.readonly"
        )}&access_type=offline&prompt=consent&state=${userId}`
      );
    }

    const { error: updateError } = await supabase
      .from("User_Profiles")
      .update(newData)
      .eq("user_id", userId)
      .single();
    if (updateError) {
      return res.status(500).json({ message: "Failed to update tokens" });
    }
    res.redirect("http://localhost:3000/inbox/email");
  } catch (err) {
    res.status(500).send({ message: "Authentication failed" });
  }
});*/

//Registration Method
router.post("/register-student-information", async (req, res) => {
  const {
    student_major,
    student_year,
    student_interests,
    student_acceptedterms,
  } = req.body;

  try {
    const research_input_embeddings = student_interests.join();
    const embeddings = await generateEmbeddings(research_input_embeddings);
    const userId = signUpData.user.id;

    if (authError) {
      return res.status(400).json({ message: "Failed to Register" });
    }

    //Insert into User_Profiles
    const { error: profileError } = await supabase
      .from("User_Profiles")
      .insert({
        student_major: student_major,

        student_year: student_year,
        student_interests: student_interests,
        student_acceptedterms: student_acceptedterms,
        student_embeddings: embeddings.data[0].embedding,
      });

    //Initialise Student Data
    const { error: dataError } = await supabase
      .from("Key_Performance_Indicators")
      .insert({
        user_id: userId,
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ message: "Failed to Save User Data" });
    }

    return res.status(201).json({ message: "Sucessfully Registered" });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

//Login Method
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.session) {
      return res.status(400).json({ message: "Login failed" });
    }

    return res.status(200).json({
      userId: authData.user.id,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });
  } catch (error) {
    return res.status(500).json({ message: "An error occurred" });
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
