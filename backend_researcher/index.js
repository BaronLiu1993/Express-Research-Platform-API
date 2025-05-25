import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = 8080;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const GEMINI_AI = new GoogleGenAI({ apiKey: GEMINI_KEY });
// Temporary here for dev import in after from supabase.js module
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

//Temporary Endpoints Make Modular
app.post("/auth/register", async (req, res) => {
  const {
    student_email,
    student_password,
    student_major,
    student_firstname,
    student_lastname,
    student_year,
    student_interests,
    student_acceptedterms,
    student_motivation,
  } = req.body;

  try {
    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email: student_email,
      password: student_password,
    });

    const research_input_embeddings = student_interests.join();

    const embeddings = await OPEN_AI.embeddings.create({
      model: "text-embedding-3-large",
      input: research_input_embeddings,
    });

    if (authError) {
      return res.status(400).json({ message: authError.message });
    }

    const userId = signUpData.user.id;
    const { error: profileError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: userId,
        student_email: student_email,
        student_major: student_major,
        student_firstname: student_firstname,
        student_lastname: student_lastname,
        student_year: student_year,
        student_interests: student_interests,
        student_acceptedterms: student_acceptedterms,
        student_embeddings: embeddings.data[0].embedding,
        student_motivation: student_motivation,
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ message: profileError.message });
    }

    return res.status(201).json({ message: "Sucessfully Registered" });
  } catch (err) {
    return res.status(500).json({ message: `Internal server error ${err}` });
  }
});

app.post("/match-professors", async (req, res) => {
  const { student_id, match_threshold = 0.2, match_count = 5 } = req.body;
  try {
    const { data, error } = await supabase.rpc("match_professors_for_student", {
      student_id,
      match_threshold,
      match_count,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ matches: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/auth/refresh-jwt", async (req, res) => {
  const { refreshToken } = req.body;
  try {
  } catch {}
});

app.post("/auth/verify-code", async (req, res) => {
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

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.session) {
      return res
        .status(400)
        .json({ message: authError?.message || "Login failed" });
    }

    return res
      .status(200)
      .json({
        userId: authData.user.id,
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      });
  } catch (error) {
    return res.status(500).json({ message: "An error occurred" });
  }
});

app.get("/auth/get-user", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No Bearer token provided" });
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
      return res.status(500).json({ error: profileError.message });
    }
    return res.status(200).json({ profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

app.get("/auth/get-user-id-email", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No Bearer token provided" });
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
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_email: profile.student_email,
      student_motivation: profile.student_motivation,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

app.get("/auth/get-user-id", async (req, res) => {
  const accessToken = req.cookies["accesstoken"];

  if (!accessToken) {
    return res.status(401).json({ error: "No access token provided" });
  }

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
      return res.status(500).json({ error: profileError.message });
    }

    res
      .cookie("user_id", profile.user_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24,
        path: "/",
      })
      .status(200)
      .json({ result: "Success", user_id: profile.user_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

app.post("/taishan", async (req, res) => {
  const { name, url, research_interests } = req.body;
  const { data, error } = await supabase
    .from("Taishan")
    .insert([{ name, url, research_interests }]);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ data });
});

app.get("/taishan", async (req, res) => {
  const { data, error } = await supabase.from("Taishan").select("*").limit(10);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ data });
});

app.get("/kanban/get-all-or-create/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    let { data: board, error: authError } = await supabase
      .from("Applications")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!board) {
      const { data: newBoard, error: insertError } = await supabase
        .from("Applications")
        .insert([
          {
            user_id: userId,
            in_complete: [],
            in_progress: [],
            completed: [],
            follow_up: [],
          },
        ])
        .single();
      if (insertError) {
        return res.status(400).json({ message: insertError.message });
      }
      board = newBoard;
    }
    return res.status(200).json({ data: board });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.delete("/kanban/delete-in-progress/:id/:professorId", async (req, res) => {
  const userId = req.params.id;
  const professorId = parseInt(req.params.professorId);

  try {
    const { data: currentApp, error: fetchError } = await supabase
      .from("Applications")
      .select("in_progress")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }
    const currentInProgress = currentApp.in_progress || [];
    const updatedInProgress = currentInProgress.filter(
      (prof) => prof.id !== professorId
    );
    if (updatedInProgress.length === currentInProgress.length) {
      return res
        .status(404)
        .json({ message: "Professor not found in In Progress" });
    }
    const { data, error: updateError } = await supabase
      .from("Applications")
      .update({ in_progress: updatedInProgress })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(500).json({ message: "Internal Error" });
    }

    return res.status(200).json({ data: data });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put(
  "/kanban/update-in-progress-to-completed/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);
    try {
      const { data: currentApp, error: authError } = await supabase
        .from("Applications")
        .select("in_progress, completed")
        .eq("user_id", userId)
        .single();

      if (authError) {
        return res.status(400).json({ message: "Authentication Error" });
      }
      if (!currentApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      const currentInProgress = currentApp.in_progress || [];
      const currentCompleted = currentApp.completed || [];

      const professorToMove = currentInProgress.find(
        (prof) => prof.id === professorId
      );
      if (!professorToMove) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Progress" });
      }

      const updatedInProgress = currentInProgress.filter(
        (prof) => prof.id !== professorId
      );
      const updatedCompleted = [...currentCompleted, professorToMove];
      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({
          in_progress: updatedInProgress,
          completed: updatedCompleted,
        })
        .eq("user_id", userId);

      if (updateError) {
        res.status(500).json({
          message: "Internal Server Error",
        });
      }
      return res.status(200).json({
        message: "Professor moved to completed",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

app.delete(
  "/kanban/delete-in-progress/:user_id/:professor_id",
  async (req, res) => {
    const userId = req.params.user_id;
    const professorId = parseInt(req.params.professor_id); // Ensure it's a number

    try {
      const { data, error: fetchError } = await supabase
        .from("Applications")
        .select("in_progress")
        .eq("id", userId)
        .single();

      if (fetchError) {
        console.error(fetchError);
        return res.status(500).json({ message: "Failed to fetch in_progress" });
      }

      const currentInProgress = data.in_progress || [];

      const updatedInProgress = currentInProgress.filter(
        (prof) => prof.id !== professorId
      );

      const { error: updateError } = await supabase
        .from("Applications")
        .update({ in_progress: updatedInProgress })
        .eq("id", userId);

      if (updateError) {
        console.error(updateError);
        return res
          .status(500)
          .json({ message: "Failed to update in_progress" });
      }

      return res
        .status(200)
        .json({ message: "Professor removed successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error", error: err });
    }
  }
);

// Keep this, merge it with the apply button and make it so when someone clicks it
// The data is added to is complete or if it is already saved, it moves it from saved to is complete
// and if it is completed then render back you have already applied here, do you want to follow up perhaps
// and move to follow up and then create email again with follow up and create separate llm agent for that
app.post("/kanban/add-in-progress/:id", async (req, res) => {
  const userId = req.params.id;
  const { professor_data } = req.body;

  if (!professor_data) {
    return res.status(400).json({ message: "Professor data is required." });
  }

  try {
    const { data: currentData, error: fetchError } = await supabase
      .from("Applications")
      .select("in_progress")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInProgress = currentData.in_progress || [];

    const isDuplicate = currentInProgress.some(
      (prof) => prof.id === professor_data.id
    );

    if (isDuplicate) {
      return res.status(409).json({
        message: "This professor is already in there.",
      });
    }

    const professorWithTimestamp = {
      ...professor_data,
      added_at: new Date().toISOString(),
    };

    const updatedInProgress = [...currentInProgress, professorWithTimestamp];
    const { data, error: updateError } = await supabase
      .from("Applications")
      .update({ in_progress: updatedInProgress })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    return res.status(200).json({ data: currentData });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Add In Complete / Saved Section Implementations All Here
app.get("/kanban/saved-professors/:id", async (req, res) => {
  const userId = req.params.id;
  const { data: trackingData, error: trackingError } = await supabase
    .from("User_Profiles")
    .select("saved_professors")
    .eq("user_id", userId)
    .single();

  if (trackingError) {
    return res.status(400).json({ message: trackingError.message });
  }

  return res.status({ savedData: trackingData.saved_professors || [] });
});

app.post("/kanban/add-in-complete/:id", async (req, res) => {
  const userId = req.params.id;
  const { professor_data } = req.body;

  if (!professor_data || !professor_data.id) {
    return res
      .status(400)
      .json({ message: "Professor data with ID is required." });
  }

  const professorId = professor_data.id;

  try {
    const { data: currentData, error: fetchError } = await supabase
      .from("Applications")
      .select("in_complete")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInComplete = currentData.in_complete || [];

    const isDuplicate = currentInComplete.some(
      (prof) => prof.id === professorId
    );

    if (isDuplicate) {
      return res.status(409).json({
        message: "This professor is already saved.",
      });
    }

    const professorWithTimestamp = {
      ...professor_data,
      added_at: new Date().toISOString(),
    };

    const updatedInComplete = [...currentInComplete, professorWithTimestamp];

    const { error: updateError } = await supabase
      .from("Applications")
      .update({ in_complete: updatedInComplete })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    const { data: trackingData, error: trackingError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (trackingError) {
      return res.status(400).json({ message: trackingError.message });
    }

    const saved = trackingData.saved_professors || [];
    const isAlreadySaved = saved.includes(professorId);
    const updatedSaved = isAlreadySaved ? saved : [...saved, professorId];

    const { error: trackingUpdateError } = await supabase
      .from("User_Profiles")
      .update({ saved_professors: updatedSaved })
      .eq("user_id", userId);

    if (trackingUpdateError) {
      return res.status(400).json({ message: trackingUpdateError.message });
    }

    return res.status(200).json({ message: "Professor added successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/kanban/remove-in-complete/:id", async (req, res) => {
  const userId = req.params.id;
  const { professor_id } = req.body;

  if (!professor_id) {
    return res.status(400).json({ message: "Professor ID is required." });
  }

  try {
    const { data: currentData, error: fetchError } = await supabase
      .from("Applications")
      .select("in_complete")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInComplete = currentData.in_complete || [];

    const updatedInComplete = currentInComplete.filter(
      (prof) => prof.id !== professor_id
    );

    const { error: updateError } = await supabase
      .from("Applications")
      .update({ in_complete: updatedInComplete })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ message: profileError.message });
    }

    const saved = profileData.saved_professors || [];
    const updatedSaved = saved.filter((id) => id !== professor_id);

    const { error: savedUpdateError } = await supabase
      .from("User_Profiles")
      .update({ saved_professors: updatedSaved })
      .eq("user_id", userId);

    if (savedUpdateError) {
      return res.status(400).json({ message: savedUpdateError.message });
    }

    return res.status(200).json({ message: "Professor removed successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put(
  "/kanban/update-incomplete-to-inprogress/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);
    try {
      const { data: currentApp, error: authError } = await supabase
        .from("Applications")
        .select("in_complete, in_progress")
        .eq("user_id", userId)
        .single();

      if (authError) {
        return res.status(400).json({ message: "Authentication Error" });
      }
      if (!currentApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      const currentInProgress = currentApp.in_progress || [];
      const currentInComplete = currentApp.in_complete || [];

      const professorToMove = currentInComplete.find(
        (prof) => prof.id === professorId
      );
      if (!professorToMove) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Complete" });
      }

      const updatedInComplete = currentInComplete.filter(
        (prof) => prof.id !== professorId
      );
      const updatedInProgress = [...currentInProgress, professorToMove];
      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({
          in_complete: updatedInComplete,
          in_progress: updatedInProgress,
        })
        .eq("user_id", userId);

      if (updateError) {
        res.status(500).json({
          message: "Internal Server Error",
        });
      }
      return res.status(200).json({
        message: "Professor moved to In Progress",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

//Run as a cron job, for moving things to follow up and sending email to remind them to follow up after
app.post("/kanban/maintenance/:id", async (req, res) => {
  const userId = req.params.id;
  const { force } = req.query;

  try {
    const { data: application, error: fetchError } = await supabase
      .from("Applications")
      .select("completed")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInProgress = application.in_progress || [];
    const currentFollowUp = application.follow_up || [];
    const lastMaintenance =
      application.last_maintenance || new Date(0).toISOString();
    const shouldRun =
      force || new Date() - new Date(lastMaintenance) > 24 * 60 * 60 * 1000;

    if (!shouldRun) {
      return res.status(200).json({
        message: "Maintenance not needed",
        data: application,
      });
    }
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [updatedInProgress, movedToFollowUp] = currentInProgress.reduce(
      ([inProgress, followUp], prof) => {
        const addedDate = new Date(prof.added_at);
        if (addedDate < oneWeekAgo) {
          followUp.push(prof);
        } else {
          inProgress.push(prof);
        }
        return [inProgress, followUp];
      },
      [[], [...currentFollowUp]]
    );

    const { data, error: updateError } = await supabase
      .from("Applications")
      .update({
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        last_maintenance: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    return res.status(200).json({
      message: "Maintenance completed",
      data: {
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        moved_count: movedToFollowUp.length - currentFollowUp.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
