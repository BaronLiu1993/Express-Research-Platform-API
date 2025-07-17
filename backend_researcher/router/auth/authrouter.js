import { supabase } from "../../supabase/supabase";
import express from "express";
import { generateEmbeddings } from "../../services/auth/authservices";

const router = express.Router();

//Registration Method
router.post("/register", async (req, res) => {
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

    //Get all Student Data Necessary
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

app.get("/get-user", async (req, res) => {
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

//Get Just ID and Email
router.get("/get-user-id-email", async (req, res) => {
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
      student_email: profile.student_email,
      student_motivation: profile.student_motivation,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unexpected server error" });
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

router.get("/get-professor-ids/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const { data: professorArrayData, error: professorArrayError } =
      await supabase
        .from("User_Profiles")
        .select("saved_professors")
        .eq("user_id", userId)
        .single();

    if (professorArrayError) {
      return res.status(400).json({
        message: "Failed to Fetch",
      });
    }

    return res.status(200).json(professorArrayData);
  } catch {
    return res.status(500).json({
      message: "Internal Server Error. Please Try Again Later",
    });
  }
});

router.get("/get-applied-professor-ids/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const { data: professorArrayData, error: professorArrayError } =
      await supabase
        .from("User_Profiles")
        .select("applied_professors")
        .eq("user_id", userId)
        .single();

    if (professorArrayError) {
      return res.status(400).json({
        message: "Failed to Fetch",
      });
    }

    return res.status(200).json(professorArrayData);
  } catch {
    return res.status(500).json({
      message: "Internal Server Error. Please Try Again Later",
    });
  }
});

router.post("/refresh-jwt", async (req, res) => {
  const { refreshToken } = req.body;
  try {
  } catch {}
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

export default router