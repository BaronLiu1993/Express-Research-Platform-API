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
  console.log(`[Scraper] Calling Firecrawl extract for ${url}...`);
  const result = await firecrawl.extract({
    urls: [url],
    prompt: EXTRACT_PROMPT,
    schema: PROFESSOR_EXTRACT_SCHEMA,
  });

  if (!result.success) {
    console.log(`[Scraper] Firecrawl FAILED for ${url}:`, result.error || "unknown error");
    throw new Error(`Firecrawl failed for ${url}: ${result.error || "unknown error"}`);
  }

  const professors = result.data?.professors || [];
  console.log(`[Scraper] Firecrawl returned ${professors.length} professors from ${url}`);
  if (professors.length > 0) {
    console.log(`[Scraper] Sample:`, JSON.stringify(professors[0], null, 2));
  }

  return professors;
}

export async function dedupe(professors) {
  if (!professors.length) {
    console.log(`[Scraper] No professors to dedupe, skipping`);
    return [];
  }
  const withEmail = professors.filter((p) => p.email && p.email.includes("@"));
  console.log(`[Scraper] ${withEmail.length}/${professors.length} professors have valid emails`);
  if (!withEmail.length) return [];

  const emails = withEmail.map((p) => p.email);
  console.log(`[Scraper] Checking ${emails.length} emails against existing Taishan records...`);
  const { data: existingRows, error: existingError } = await supabase
    .from("Taishan")
    .select("email")
    .in("email", emails);

  if (existingError) {
    console.log(`[Scraper] Existing email lookup FAILED:`, existingError.message);
    throw new Error(`Existing email lookup failed: ${existingError.message}`);
  }

  const existingEmails = new Set((existingRows || []).map((r) => r.email));
  console.log(`[Scraper] Found ${existingEmails.size} existing emails (duplicates)`);

  const newProfessors = withEmail.filter((p) => !existingEmails.has(p.email));
  console.log(`[Scraper] ${newProfessors.length} new professors after dedupe`);

  return newProfessors;
}

export async function generateBatchEmbeddings(professors) {
  if (!professors.length) return professors;

  console.log(`[Scraper] Generating embeddings for ${professors.length} professors...`);
  const textsToEmbed = professors.map(
    (p) => p.research_interests || p.bio || p.name
  );

  const embeddingResult = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: textsToEmbed,
  });
  console.log(`[Scraper] Embeddings generated (${embeddingResult.data.length} vectors)`);

  return professors.map((prof, i) => ({
    ...prof,
    embedding: embeddingResult.data[i].embedding,
  }));
}

export async function insertNewProfessors(professors) {
  if (!professors.length) return { inserted: 0 };

  console.log(`[Scraper] Inserting ${professors.length} new professors into Taishan...`);
  const { data, error } = await supabase.from("Taishan").insert(professors);

  if (error) {
    console.log(`[Scraper] Taishan insert FAILED:`, error.message);
    throw new Error(`Taishan insert failed: ${error.message}`);
  }

  console.log(`[Scraper] Taishan insert OK — ${professors.length} records`);
  return { inserted: professors.length };
}

export async function runScrapeJob({ school, faculty, department, url }) {
  console.log(`\n[Scraper] ========================================`);
  console.log(`[Scraper] Starting: ${school} / ${department}`);
  console.log(`[Scraper] URL: ${url}`);
  console.log(`[Scraper] ========================================`);

  const rawProfessors = await scrapePage(url);
  if (!rawProfessors.length) {
    console.log(`[Scraper] No professors found, skipping`);
    return { url, scraped: 0, inserted: 0, skipped: 0 };
  }

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
  console.log(`[Scraper] Mapped ${professors.length} professors with metadata`);

  const deduped = await dedupe(professors);
  const skipped = professors.filter((p) => p.email && p.email.includes("@")).length - deduped.length;

  const newProfessors = deduped.filter((p) => {
    const hasName = p.name && p.name.trim().length > 1;
    const hasEmail = p.email && p.email.includes("@");
    const hasContent = (p.research_interests && p.research_interests.trim().length > 0) ||
                       (p.bio && p.bio.trim().length > 0);
    return hasName && hasEmail && hasContent;
  });

  const rejected = deduped.length - newProfessors.length;
  if (rejected > 0) {
    console.log(`[Scraper] Rejected ${rejected} professors with insufficient data`);
    const rejectedProfs = deduped.filter((p) => !newProfessors.includes(p));
    rejectedProfs.forEach((p) => {
      console.log(`[Scraper]   REJECTED: ${p.name || "(no name)"} <${p.email || "(no email)"}> — missing: ${!p.research_interests && !p.bio ? "bio+interests" : !p.name ? "name" : "email"}`);
    });
  }

  if (!newProfessors.length) {
    console.log(`[Scraper] No valid professors to insert after validation`);
    return { url, scraped: professors.length, inserted: 0, skipped: skipped + rejected };
  }

  console.log(`[Scraper] ${newProfessors.length} valid professors to insert:`);
  newProfessors.forEach((p, i) => {
    console.log(`[Scraper]   ${i + 1}. ${p.name} <${p.email}> — ${p.research_interests || p.bio.slice(0, 50) + "..."}`);
  });

  // const withEmbeddings = await generateBatchEmbeddings(newProfessors);
  // const result = await insertNewProfessors(withEmbeddings);
  console.log(`[Scraper] DRY RUN — skipping embeddings + insert`);

  return {
    url,
    scraped: professors.length,
    inserted: 0, 
    skipped: skipped + rejected,
  };
}
