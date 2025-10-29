import { supabase } from "../../supabase/supabase.js";
import express from "express";
import {
  generateEmbeddings,
  verifyToken,
} from "../../services/authServices.js";
import { encryptToken } from "../../services/authServices.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

//Defined Scopes
const scopes = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

router.get("/signup-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://paletteprod.vercel.app/account/register",
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
          redirectTo: "https://paletteprod.vercel.app/account/login",
          scopes: scopes.join(" "),
          queryParams: {
            access_type: "offline",
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

  try {
    const { data: tokenData, error: tokenDataError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (tokenDataError || !tokenData?.session) {
      return res
        .status(400)
        .json({ message: "Failed to exchange code for session" });
    }
    const { session } = tokenData;
    const user = session.user;

    const { error: userDoesNotExist } = await supabase
      .from("User_Profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (userDoesNotExist) {
      const { error: tokenInsertionError } = await supabase
        .from("User_Profiles")
        .insert({
          user_id: user.id,
          student_email: user.email,
          student_name: user.user_metadata?.full_name,
        });

      if (tokenInsertionError) {
        return res.status(400).json({ message: "Failed" });
      }
    }

    return res.status(200).json({
      user_id: user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      redirectURL: "/repository",
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
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
    if (tokenDataError || !tokenData?.session) {
      return res
        .status(400)
        .json({ message: "Failed to exchange code for session" });
    }

    const { session } = tokenData;
    const user = session.user;

    const { data: userExists, error: userDoesNotExist } = await supabase
      .from("User_Profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!userDoesNotExist) {
      return res.status(200).json({
        user_id: user.id,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        redirectURL: "/repository",
      });
    }

    const { error: tokenInsertionError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: user.id,
        student_email: user.email,
        student_name: user.user_metadata?.full_name,
      });

    if (tokenInsertionError) {
      return res
        .status(400)
        .json({ redirectURL: "/auth/signin", message: "User Already Exists" });
    }

    return res.status(200).json({
      user_id: user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      redirectURL: "/register",
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
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

router.post("/sign-out", async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const { error: signOutError } = await supabase.auth.admin.signOut(
      refreshToken,
      "global"
    );

    if (signOutError) {
      return res.status(400).json({ message: "Failed To Sign Out" });
    }

    return res.status(200).json({ message: "Successfully Signed Out" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/is-authenticated", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Missing token" });
    }

    const { data } = await supabase.auth.getUser(token);
    if (!data.user) {
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

router.get("/check-profile-completed", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: profileData, error: profileError } = await req.supabaseClient
      .from("User_Profiles")
      .select("finished_registration")
      .eq("user_id", userId)
      .single();
    if (profileError) {
      return res.status(400).json({ message: "Fetch Error" });
    }

    return res
      .status(200)
      .json({ isComplete: profileData.finished_registration });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Registration Method
router.post("/register", verifyToken, async (req, res) => {
  const {
    student_major,
    student_year,
    student_interests,
    student_acceptedterms,
  } = req.body;

  const userId = req.user.sub;

  if (
    !student_major ||
    !student_year ||
    !student_interests ||
    !student_acceptedterms ||
    !userId
  ) {
    return res.status(400).json({ message: "Incomplete Information" });
  }

  if (student_interests.length > 3 || student_interests.length <= 0) {
    return res.status(400).json({ message: "Invalid Interests" });
  }

  try {
    const research_input_embeddings = student_interests.join();
    const embeddings = await generateEmbeddings(research_input_embeddings);
    const { error: profileError } = await req.supabaseClient
      .from("User_Profiles")
      .update({
        student_major: student_major,
        student_year: student_year,
        student_interests: student_interests,
        student_acceptedterms: student_acceptedterms,
        student_embeddings: embeddings.data[0].embedding,
        finished_registration: true,
        gmail_auth_token: encryptToken(session.provider_token),
        gmail_refresh_token: encryptToken(session.provider_refresh_token),
      })
      .eq("user_id", userId);

    if (profileError) {
      return res.status(400).json({ message: "Failed To Update" });
    }
    return res.status(200).json({ message: "Sucessfully Completed Profile" });
  } catch (err) {
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
    const { data: userData, error: authError } =
      await req.supabaseClient.auth.getUser(accessToken);

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

    const { data: profile, error: profileError } = await req.supabaseClient
      .from("User_Profiles")
      .select("user_id, student_name, student_email")
      .eq("user_id", user.id)
      .single();
    if (profileError) {
      return res.status(500).json({ message: "Failed to Fetch Profile" });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_name: profile.student_name,
      student_email: profile.student_email,
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
