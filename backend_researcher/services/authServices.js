//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

//Initialise OpenAI Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

export async function generateEmbeddings(research_input_embeddings) {
    const embeddings = await OPEN_AI.embeddings.create({
        model: "text-embedding-3-large",
        input: research_input_embeddings,
    });
    return embeddings
}



