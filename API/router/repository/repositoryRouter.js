import express from "express";

import OpenAI from "openai";
import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";
import { z } from "zod";

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const router = express.Router();


router.get("/taishan", verifyToken, async (req, res) => {
  const LIMIT = 20;
  const MAX_LIST_ITEMS = 30;
  const MAX_STRING_LEN = 100;

  const SAFE_TEXT_RE = /^[a-zA-Z0-9 .,'"\-()!?/&+:@#%]*$/;
  const SAFE_TOKEN_RE = /^[a-zA-Z0-9 .,'"\-()&/]+$/;

  const normalize = (s) =>
    String(s ?? "")
      .normalize("NFKC")
      .trim();
  const clamp = (s, max = MAX_STRING_LEN) =>
    s.length > max ? s.slice(0, max) : s;

  const toTokenList = (val) => {
    const arr = Array.isArray(val) ? val : String(val ?? "").split(",");
    const cleaned = arr
      .map((v) => clamp(normalize(v)))
      .filter(Boolean)
      .filter((v) => SAFE_TOKEN_RE.test(v));

    return [...new Set(cleaned)].slice(0, MAX_LIST_ITEMS);
  };

  const TaishanQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    search: z
      .string()
      .optional()
      .transform((v) => clamp(normalize(v)))
      .refine((v) => v === "" || SAFE_TEXT_RE.test(v), {
        message: "Invalid characters in search.",
      })
      .default(""),
    school: z.any().optional().transform(toTokenList).default([]),
    faculty: z.any().optional().transform(toTokenList).default([]),
    department: z.any().optional().transform(toTokenList).default([]),
  });

  const parsed = TaishanQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid query parameters.",
    });
  }

  const { page, search, school, faculty, department } = parsed.data;

  const from = (page - 1) * LIMIT;
  const to = from + LIMIT - 1;

  try {
    if (search) {
      const embeddingResult = await OPEN_AI.embeddings.create({
        model: "text-embedding-3-large",
        input: search,
      });

      const embedding = embeddingResult?.data?.[0]?.embedding;
      if (!embedding) {
        return res.status(500).json({ message: "Embedding failed." });
      }

      const { data, error } = await req.supabaseClient.rpc(
        "find_similar_professors_by_vector",
        {
          student_embedding: embedding,
          match_threshold: 0.2,
          page_size: 200,
          page_offset: 0,
        }
      );

      if (error) {
        return res.status(400).json({ message: "Failed to retrieve" });
      }

      const hasSchool = school.length > 0;
      const hasFaculty = faculty.length > 0;
      const hasDepartment = department.length > 0;

      const filtered = (data || []).filter((row) => {
        const okSchool =
          !hasSchool || (row.school && school.includes(row.school));
        const okFaculty =
          !hasFaculty || (row.faculty && faculty.includes(row.faculty));
        const okDept =
          !hasDepartment ||
          (row.department && department.includes(row.department));
        return okSchool && okFaculty && okDept;
      });

      const tableCount = filtered.length;
      const pageSlice = filtered.slice(from, to + 1);

      return res.status(200).json({ tableData: pageSlice, tableCount });
    }

    let query = req.supabaseClient
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    if (school.length) query = query.in("school", school);
    if (faculty.length) query = query.in("faculty", faculty);
    if (department.length) query = query.in("department", department);

    query = query.order("name", { ascending: true }).range(from, to);

    const { data: tableData, count: tableCount, error } = await query;
    if (error) throw error;

    return res.status(200).json({ tableData, tableCount: tableCount ?? 0 });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/match-professors", verifyToken, async (req, res) => {
  const match_count = 20;
  const match_threshold = 0.2;
  const AuthSchema = z.object({
    sub: z.string().min(1).max(128),
  });

  const authParsed = AuthSchema.safeParse(req.user);
  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token payload.",
    });
  }

  const userId = authParsed.data.sub;

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
