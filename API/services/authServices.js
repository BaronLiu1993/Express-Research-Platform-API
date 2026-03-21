//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import CryptoJS from "crypto-js";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_JWT_ALGORITHM = process.env.SUPABASE_JWT_ALGORITHM;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const secretKey = process.env.GMAIL_SECRET_KEY;
const client = new OAuth2Client();

const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

function safeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function encryptToken(token) {
  try {
    const encryptedToken = CryptoJS.AES.encrypt(token, secretKey).toString();
    return encryptedToken;
  } catch {
    throw Error("Failed to Encrypt Token");
  }
}

export function decryptToken(token) {
  try {
    const bytes = CryptoJS.AES.decrypt(token, secretKey);
    const decryptedToken = bytes.toString(CryptoJS.enc.Utf8);
    return decryptedToken;
  } catch {
    throw Error("Failed to Decrypt Token");
  }
}

export async function generateEmbeddings(research_input_embeddings) {
  try {
    const embeddings = await OPEN_AI.embeddings.create({
      model: "text-embedding-3-large",
      input: research_input_embeddings,
    });
    return embeddings;
  } catch {
    throw Error("Failed to Embed");
  }
}

export async function verifyServerlessCron(req, res, next) {
  const provided = req.get("x-cron-secret");
  const tsStr = req.get("x-cron-ts");
  const expected = process.env.SUPABASE_CRON_SECRET;
  try {
    const ts = Number(tsStr);
    const now = Math.floor(Date.now() / 1000);
    const MAX_SKEW = 300;
    if (!provided || !expected) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW) {
      return res.status(403).json({ message: "Stale request" });
    }
    const ok = safeEquals(provided, expected);
    if (!ok) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    return next();
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function verifyPubSubJwt(req, res) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) {
    return res.status(401).json({ message: "No Service Header" });
  }

  const token = m[1];
  const audience = process.env.PUBSUB_PUSH_AUDIENCE;
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();

  if (!payload?.email_verified) {
    return res.status(401).json({ message: "Emailed Not Verfied" });
  }

  if (payload.email !== process.env.PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL) {
    return res.status(401).json({ message: "Wrong Service Account" });
  }

  return payload;
}

//Refresh In Here
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: [SUPABASE_JWT_ALGORITHM],
    });

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    req.user = payload;
    req.token = token;
    req.supabaseClient = supabaseClient;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
