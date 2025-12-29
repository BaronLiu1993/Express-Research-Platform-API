import { supabase } from "../../supabase/supabase.js";
import express from "express";
import {
  generateEmbeddings,
  verifyToken,
  verifyServerlessCron,
} from "../../services/authServices.js";
import { encryptToken } from "../../services/authServices.js";
import dotenv from "dotenv";
import { configureOAuth } from "../../services/googleServices.js";
import watchQueue from "../../queue/watch/watchQueue.js";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const router = express.Router();

const scopes = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
];

const supabaseServerSide = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.get("/signup-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://trypalette.app/account/register",
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
          redirectTo: "https://trypalette.app/account/login",
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

router.post("/oauth2callback/login", async (req, res) => {
  console.log("[LOGIN] Incoming request");
  console.log("[LOGIN] Body:", req.body);

  const code = req.body?.code;
  if (!code) {
    console.log("[LOGIN] ❌ No code provided");
    return res.status(400).json({ message: "No code provided" });
  }

  try {
    console.log("[LOGIN] Exchanging code for session...");

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[LOGIN] ❌ exchangeCodeForSession error:", error);
    }

    if (error || !data?.session) {
      console.log("[LOGIN] ❌ No session returned");
      return res
        .status(400)
        .json({ message: "Failed to exchange code for session" });
    }

    const { session } = data;
    const user = session.user;

    console.log("[LOGIN] ✅ Session received");
    console.log("[LOGIN] User ID:", user.id);
    console.log("[LOGIN] User email:", user.email);
    console.log("[LOGIN] Provider token exists:", !!session.provider_token);
    console.log(
      "[LOGIN] Provider refresh token exists:",
      !!session.provider_refresh_token
    );

    console.log("[LOGIN] Looking up user profile...");

    const { data: profile, error: lookupErr } = await supabaseServerSide
      .from("User_Profiles")
      .select("user_id")
      .eq("user_id", user.id);

    if (lookupErr) {
      console.error("[LOGIN] ❌ Profile lookup error:", lookupErr);
      return res.status(500).json({ message: "Profile lookup failed" });
    }

    console.log("[LOGIN] Profile lookup result:", profile);

    // ⚠️ NOTE: profile will be an array
    if (!profile || profile.length === 0) {
      console.log("[LOGIN] No profile found → creating new profile");

      const insertPayload = {
        user_id: user.id,
        student_email: user.email,
        student_name: user.user_metadata?.full_name ?? null,
        gmail_auth_token: session.provider_token
          ? encryptToken(session.provider_token)
          : null,
        gmail_refresh_token: session.provider_refresh_token
          ? encryptToken(session.provider_refresh_token)
          : null,
      };

      console.log("[LOGIN] Insert payload:", {
        ...insertPayload,
        gmail_auth_token: insertPayload.gmail_auth_token ? "[ENCRYPTED]" : null,
        gmail_refresh_token: insertPayload.gmail_refresh_token
          ? "[ENCRYPTED]"
          : null,
      });

      const { error: insertErr } = await supabaseServerSide
        .from("User_Profiles")
        .insert(insertPayload);

      if (insertErr) {
        console.error("[LOGIN] ❌ Profile insert failed:", insertErr);
        return res.status(400).json({ message: "Failed to create profile" });
      }

      console.log("[LOGIN] ✅ Profile created successfully");
    } else {
      console.log("[LOGIN] ✅ Profile already exists");
    }

    console.log("[LOGIN] Setting cookies...");

    res.cookie("access_token", session.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 60 * 60 * 1000,
    });

    res.cookie("refresh_token", session.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/auth/refresh",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    console.log("[LOGIN] ✅ Cookies set");
    console.log("[LOGIN] Responding with redirect");

    return res.status(200).json({ ok: true, redirectURL: "/repository" });
  } catch (err) {
    console.error("[LOGIN] ❌ Uncaught error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

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

    const { error: userDoesNotExist } = await supabaseServerSide
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

    if (session.provider_refresh_token) {
      const { error: tokenInsertionError } = await supabaseServerSide
        .from("User_Profiles")
        .insert({
          user_id: user.id,
          student_email: user.email,
          student_name: user.user_metadata?.full_name,
          gmail_auth_token: encryptToken(session.provider_token),
          gmail_refresh_token: encryptToken(session.provider_refresh_token),
        });
      if (tokenInsertionError) {
        return res.status(400).json({ message: "Failed" });
      }
    } else {
      const { error: tokenInsertionError } = await supabaseServerSide
        .from("User_Profiles")
        .insert({
          user_id: user.id,
          student_email: user.email,
          student_name: user.user_metadata?.full_name,
          gmail_auth_token: encryptToken(session.provider_token),
        });
      if (tokenInsertionError) {
        return res.status(400).json({ message: "Failed" });
      }
    }

    res.cookie("access_token", session.access_token, {
      httpOnly: true,
      secure: true, // Replace with is prod
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 1000,
    });

    res.cookie("refresh_token", session.refresh_token, {
      httpOnly: true,
      secure: true, // Replace with is prod
      sameSite: "lax",
      path: "/auth/refresh",
      maxAge: 14 * 24 * 60 * 60 * 1000,
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
  const { data: profileData, error: profileError } = await req.supabaseClient
    .from("User_Profiles")
    .select("finished_registration")
    .eq("user_id", userId)
    .single();

  if (profileError) {
    return res.status(400).json({ message: "Failed To Fetch" });
  }

  if (profileData.finished_registration) {
    return res.status(429).json({
      message: "You can only register Once.",
    });
  }

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
        label_id: "Label_3",
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

router.get("/get-user-sidebar-info", verifyToken, async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not Authenticated" });
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
      .select("user_id, student_name, student_email, label_id")
      .eq("user_id", user.id)
      .single();
    if (profileError) {
      return res.status(400).json({ message: "Failed to Fetch Profile" });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_name: profile.student_name,
      student_email: profile.student_email,
      label_id: profile.label_id,
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/fetch-info", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: profile, error: profileError } = await req.supabaseClient
      .from("User_Profiles")
      .select("student_interests, student_year, student_name, student_major")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ message: "Fetch Error" });
    }

    return res.status(200).json({ profile });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/update-profile", verifyToken, async (req, res) => {
  const { student_major, student_year, student_interests } = req.body;
  const userId = req.user.sub;

  const { data: profile, error: profileError } = await req.supabaseClient
    .from("User_Profiles")
    .select("updated_profile")
    .eq("user_id", userId)
    .single();

  if (profileError) {
    return res.status(400).json({ message: "Fetch Error" });
  }
  if (profile && profile.updated_profile) {
    const lastUpdate = new Date(profile.updated_profile);
    const now = new Date();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    const diffMs = now - lastUpdate;

    if (diffMs < ONE_WEEK) {
      const nextAllowedUpdate = new Date(lastUpdate.getTime() + ONE_WEEK);

      return res.status(429).json({
        message: "You can only update your profile once per week.",
        next_allowed_update: nextAllowedUpdate,
      });
    }
  }

  if (!student_major || !student_year || !student_interests || !userId) {
    return res.status(400).json({ message: "Incomplete Information" });
  }

  if (student_interests.length > 3 || student_interests.length <= 0) {
    return res.status(400).json({ message: "Invalid Interests" });
  }

  try {
    const research_input_embeddings = student_interests.join();

    const embeddings = await generateEmbeddings(research_input_embeddings);

    const { error: updateError } = await req.supabaseClient
      .from("User_Profiles")
      .update({
        student_major,
        student_year,
        student_interests,
        student_embeddings: embeddings.data[0].embedding,
        updated_profile: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: "Failed To Update" });
    }

    return res.status(200).json({ message: "Successfully Completed Profile" });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/register/watch/queue", verifyServerlessCron, async (req, res) => {
  const { watchData } = req.body;
  try {
    if (watchData.length <= 0) {
      return res.status(200).json({ message: "Nothing to queue" });
    }

    console.log(watchData);
    const jobs = watchData.map((watch) => ({
      name: "refresh-watch-job",
      data: {
        userId: watch.user_id,
      },
    }));
    await watchQueue.addBulk(jobs);
    return res.status(200).json({ message: "Queued" });
  } catch {
    return res.status(500).json({ message: "internal server error" });
  }
});

router.post("/register/watch", verifyToken, async (req, res) => {
  const userId = req.user.sub;

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const watchStatus = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: "projects/uoftresearch/topics/research-gmail-topic",
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      },
    });

    const newLabel = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: "[Outreach]",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });

    console.log(newLabel);

    const outreachLabelId = newLabel.data.id;

    const currentTime = new Date().toISOString();
    const { error: historyUpdateError } = await req.supabaseClient
      .from("User_Profiles")
      .update({
        history_id: watchStatus.data.historyId,
        updated_watch: currentTime,
        label_id: outreachLabelId,
      })
      .eq("user_id", userId);

    if (historyUpdateError) {
      return res.status(400).json({ message: "Failed to update history" });
    }

    return res.status(200).json({ message: "success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "internal server error" });
  }
});

export default router;
