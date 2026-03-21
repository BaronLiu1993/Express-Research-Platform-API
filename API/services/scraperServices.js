import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROFESSOR_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    professors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          url: { type: "string" },
          bio: { type: "string" },
          labs: { type: "string" },
          lab_url: { type: "string" },
          research_interests: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["professors"],
};

const EXTRACT_PROMPT = "Extract all professors/faculty members from this page. For each person, get their name, email address, profile URL, a short bio or description, their lab name, lab URL, and research interests. If a field is not available, leave it as an empty string.";

export async function scrapePage(url) {
  const result = await firecrawl.scrapeUrl(url, {
    formats: ["extract"],
    extract: {
      schema: PROFESSOR_EXTRACT_SCHEMA,
      prompt: EXTRACT_PROMPT,
    },
  });

  if (!result.success) {
    throw new Error(`Firecrawl failed for ${url}: ${result.error || "unknown error"}`);
  }

  return result.extract?.professors || [];
}

export async function stageAndDedupe(professors) {
  if (!professors.length) return [];

  // Filter out entries without email (can't dedupe without it)
  const withEmail = professors.filter((p) => p.email && p.email.includes("@"));

  if (!withEmail.length) return [];

  // Insert into staging table
  const { error: stageError } = await supabase
    .from("Taishan_Staging")
    .insert(withEmail);

  if (stageError) {
    throw new Error(`Staging insert failed: ${stageError.message}`);
  }

  // Get existing emails from Taishan
  const emails = withEmail.map((p) => p.email);
  const { data: existingRows, error: existingError } = await supabase
    .from("Taishan")
    .select("email")
    .in("email", emails);

  if (existingError) {
    throw new Error(`Existing email lookup failed: ${existingError.message}`);
  }

  const existingEmails = new Set((existingRows || []).map((r) => r.email));

  // Filter to only new professors
  const newProfessors = withEmail.filter((p) => !existingEmails.has(p.email));

  // Clear staging
  await clearStaging(emails);

  return newProfessors;
}

export async function generateBatchEmbeddings(professors) {
  if (!professors.length) return professors;

  const textsToEmbed = professors.map(
    (p) => p.research_interests || p.bio || p.name
  );

  const embeddingResult = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: textsToEmbed,
  });

  return professors.map((prof, i) => ({
    ...prof,
    embedding: embeddingResult.data[i].embedding,
  }));
}

export async function insertNewProfessors(professors) {
  if (!professors.length) return { inserted: 0 };

  const { data, error } = await supabase.from("Taishan").insert(professors);

  if (error) {
    throw new Error(`Taishan insert failed: ${error.message}`);
  }

  return { inserted: professors.length };
}

async function clearStaging(emails) {
  if (!emails.length) return;

  const { error } = await supabase
    .from("Taishan_Staging")
    .delete()
    .in("email", emails);

  if (error) {
    throw new Error(`Staging cleanup failed: ${error.message}`);
  }
}

export async function runScrapeJob({ school, faculty, department, url }) {
  // 1. Scrape page via Firecrawl
  const rawProfessors = await scrapePage(url);

  if (!rawProfessors.length) {
    return { url, scraped: 0, inserted: 0, skipped: 0 };
  }

  // 2. Attach school/faculty/department metadata
  const professors = rawProfessors.map((p) => ({
    name: p.name || "",
    email: p.email || "",
    url: p.url || "",
    bio: p.bio || "",
    labs: p.labs || "",
    lab_url: p.lab_url || "",
    research_interests: p.research_interests || "",
    department,
    faculty,
    school,
  }));

  const newProfessors = await stageAndDedupe(professors);
  const skipped = professors.filter((p) => p.email && p.email.includes("@")).length - newProfessors.length;

  if (!newProfessors.length) {
    return { url, scraped: professors.length, inserted: 0, skipped };
  }

  const withEmbeddings = await generateBatchEmbeddings(newProfessors);
  const result = await insertNewProfessors(withEmbeddings);

  return {
    url,
    scraped: professors.length,
    inserted: result.inserted,
    skipped,
  };
}
