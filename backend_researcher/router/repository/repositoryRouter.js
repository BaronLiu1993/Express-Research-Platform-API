import { supabase } from "../../supabase/supabase.js";
import express from "express";

//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

//Initialise OpenAI Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const router = express.Router();

router.get("/taishan/filter", async (req, res) => {
  const { page = 1, ...filters } = req.query;
  const pageNumber = parseInt(page);
  const limit = 20;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = supabase
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "page") continue;
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const cleanValues = values.map((v) => v.trim()).filter(Boolean);
      if (cleanValues.length > 0) {
        query = query.in(key, cleanValues);
      }
    }

    query = query.range(from, to);
    const { data: tableData, error } = await query;

    if (error) {
      console.error(error);
      return res.status(400).json({ message: "Failed To Fetch Filtered Data" });
    }

    return res.status(200).json({ tableData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/taishan", async (req, res) => {
  const { page, search } = req.query;
  const pageNumber = parseInt(page) || 1;
  const limit = 20;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;
  const pageOffset = (pageNumber - 1) * limit;

  if (typeof search === "string" && search.trim() !== "") {
    try {
      let cleanedSearch = search.trim().replace(/\s+/g, " ");

      if (/[^a-zA-Z0-9.,!?()'\s]/.test(search)) {
        return res
          .status(400)
          .json({ message: "Search contains invalid characters." });
      }

      if (cleanedSearch.length > 40) {
        return res.status(400).json({ message: "Invalid or too long input" });
      }

      const embeddingResult = await OPEN_AI.embeddings.create({
        model: "text-embedding-3-large",
        input: cleanedSearch,
      });

      const embedding = embeddingResult.data[0].embedding;

      const { data: tableData, error: semanticSearchError } =
        await supabase.rpc("find_similar_professors_by_vector", {
          student_embedding: embedding,
          match_threshold: 0.2,
          page_size: limit,
          page_offset: pageOffset,
        });

      if (semanticSearchError) {
        return res.status(400).json({ message: "Supabase Fetch Error" });
      }

      return res.status(200).json({
        tableData,
        tableCount: tableData.length,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  try {
    const {
      data: tableData,
      count: tableCount,
      error: tableFetchError,
    } = await supabase
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      )
      .range(from, to);

    if (tableFetchError) {
      console.error(tableFetchError);
      return res.status(400).json({ message: "Failed to Fetch Table Data" });
    }

    return res.status(200).json({ tableData, tableCount });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/match-professors", async (req, res) => {
  const { userId } = req.query;
  console.log(userId)
  const match_count = 10;
  const match_threshold = 0.2;

  try {
    const { data: matches, error: matchesFetchError } = await supabase.rpc(
      "match_professors_for_student",
      {
        student_id: userId,
        match_threshold,
        match_count,
      }
    );
    if (matchesFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }

    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
