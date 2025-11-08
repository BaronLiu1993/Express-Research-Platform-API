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
  // ---- constants / guards ----
  const LIMIT = 20;
  const MAX_LIST_ITEMS = 30;
  const MAX_STRING_LEN = 256;

  // Allow letters, numbers, spaces and common safe punctuation
  const SAFE_TEXT_RE = /^[a-zA-Z0-9 .,'"\-()!?/&+:@#%]*$/; 
  const SAFE_TOKEN_RE = /^[a-zA-Z0-9 .,'"\-()&/]+$/; // for school/faculty/department tokens

  // ---- sanitizers ----
  const clampLen = (s, max = MAX_STRING_LEN) => (s.length > max ? s.slice(0, max) : s);
  const normalize = (s) => s.normalize("NFKC").trim();

  const sanitizeText = (s) => {
    const t = clampLen(normalize(String(s || "")));
    if (!SAFE_TEXT_RE.test(t)) return null;
    return t;
  };

  const toList = (val) => {
    const arr = Array.isArray(val) ? val : (val ?? "").split(",");
    const cleaned = arr
      .map((v) => clampLen(normalize(String(v || ""))))
      .filter(Boolean)
      .filter((v) => SAFE_TOKEN_RE.test(v));
    // dedupe + cap size
    return [...new Set(cleaned)].slice(0, MAX_LIST_ITEMS);
  };

  // ---- read & sanitize inputs ----
  const pageNum = Math.max(1, Number(req.query.page) || 1);
  const from = (pageNum - 1) * LIMIT;
  const to = from + LIMIT - 1;

  const rawSearch = (req.query.search ?? "");
  const search = sanitizeText(rawSearch);
  if (rawSearch && search === null) {
    return res.status(400).json({ message: "Invalid characters in search." });
  }

  const schoolList = toList(req.query.school);
  const facultyList = toList(req.query.faculty);
  const departmentList = toList(req.query.department);

  // ---- main ----
  try {
    // SEARCH PATH (vector search + post-filter + paginate)
    if (search && search !== "") {
      // (Do not change this block)
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
          page_size: 500, // fetch a generous page so we can filter client-side
          page_offset: 0,
        }
      );
      if (error) throw error;

      // post-filter in Node (safe exact matches)
      const hasSchool = schoolList.length > 0;
      const hasFaculty = facultyList.length > 0;
      const hasDepartment = departmentList.length > 0;

      const filtered = (data || []).filter((row) => {
        const okSchool = !hasSchool || (row.school && schoolList.includes(row.school));
        const okFaculty = !hasFaculty || (row.faculty && facultyList.includes(row.faculty));
        const okDept = !hasDepartment || (row.department && departmentList.includes(row.department));
        return okSchool && okFaculty && okDept;
      });

      const tableCount = filtered.length;
      const pageSlice = filtered.slice(from, to + 1);

      return res.status(200).json({
        tableData: pageSlice,
        tableCount,
      });
    }

    // BROWSE/FILTER PATH (no search): server-side filters + pagination
    let query = req.supabaseClient
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    if (schoolList.length) query = query.in("school", schoolList);
    if (facultyList.length) query = query.in("faculty", facultyList);
    if (departmentList.length) query = query.in("department", departmentList);

    query = query.order("name", { ascending: true }).range(from, to);

    const { data: tableData, count: tableCount, error } = await query;
    if (error) throw error;

    return res.status(200).json({ tableData, tableCount: tableCount ?? 0 });
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
