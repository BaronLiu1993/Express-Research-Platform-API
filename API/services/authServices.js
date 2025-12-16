//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import CryptoJS from "crypto-js";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

//Initialise OpenAI Client
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

export function encryptToken(token) {
  try {
    const encryptedToken = CryptoJS.AES.encrypt(token, secretKey).toString();
    return encryptedToken;
  } catch {
    throw Error("Failed to Encrypt Token");
  }
}

//Decrypt When Making Function Calls
export function decryptToken(token) {
  try {
    const bytes = CryptoJS.AES.decrypt(token, secretKey);
    const decryptedToken = bytes.toString(CryptoJS.enc.Utf8);
    return decryptedToken;
  } catch {
    throw Error("Failed to Decrypt Token");
  }
}

// Give restrictions on what can be generated
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

export async function verifyPubSubJwt(req, res) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) {
    return res.status(401).json({message:"No Service Header"})
  };

  const token = m[1];
  const audience = process.env.PUBSUB_PUSH_AUDIENCE;
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();

  if (!payload?.email_verified) {
    return res.status(401).json({message:"Emailed Not Verfied"})
  };

  if (payload.email !== process.env.PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL) {
    return res.status(401).json({message:"Wrong Service Account"})

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
