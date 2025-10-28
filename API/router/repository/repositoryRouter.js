import express from "express";

//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";

dotenv.config();

//Initialise OpenAI Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const router = express.Router();

router.get("/taishan", verifyToken, async (req, res) => {
  const { page = 1, search, school, faculty, department } = req.query;
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    if (search && search.trim() !== "") {
      const cleaned = search.trim().replace(/\s+/g, " ");
      if (/[^a-zA-Z0-9.,!?()'\s]/.test(cleaned)) {
        return res.status(400).json({ message: "Invalid characters." });
      }

      const embeddingResult = await OPEN_AI.embeddings.create({
        model: "text-embedding-3-large",
        input: cleaned,
      });

      const embedding = embeddingResult.data[0].embedding;

      const { data, error } = await req.supabaseClient.rpc(
        "find_similar_professors_by_vector",
        {
          student_embedding: embedding,
          match_threshold: 0.2,
          page_size: limit,
          page_offset: from,
        }
      );

      if (error) throw error;
      return res.status(200).json({ tableData: data, tableCount: data.length });
    }

    let query = req.supabaseClient
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    const filters = { school, faculty, department };
    for (const [key, val] of Object.entries(filters)) {
      if (val) {
        const values = Array.isArray(val)
          ? val
          : String(val)
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean);
        query = query.in(key, values.map((v) => v.trim()).filter(Boolean));
      }
    }

    query = query.range(from, to);

    const { data: tableData, count: tableCount, error } = await query;
    if (error) throw error;

    return res.status(200).json({ tableData, tableCount });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/match-professors", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const match_count = 10;
  const match_threshold = 0.2;
  try {
    const { data: matches, error: matchesFetchError } =
      await req.supabaseClient.rpc("match_professors_for_student", {
        student_id: userId,
        match_threshold,
        match_count,
      });
    if (matchesFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }
    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
