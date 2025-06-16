import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";

//Test only

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  //Gmail OAuth, Getting User Data
  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  function makeBody(to, fromName, fromEmail, subject, htmlMessage) {
    const mimeMessage = [
      `To: ${to}`,
      `From: ${fromName} <${fromEmail}>`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      ``,
      `${htmlMessage}`,
    ].join("\n");
  
    //Encode
    return Buffer.from(mimeMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

export async function sendSnippetEmail({ userId, professorId, body }) {
    const { snippetId, dynamicFields, to, fromName, fromEmail } = body;
    const trackingId = uuidv4();
  
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();
  
    if (tokenFetchError || !tokenData) throw new Error("Missing Gmail tokens");
  
    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });
  
    const { data: snippetData, error: snippetFetchError } = await supabase
      .from("snippets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", snippetId)
      .single();
  
    if (!snippetData || snippetFetchError) throw new Error("Snippet not found");
  
    const snippetHTML = snippetData.snippet_html;
    const snippetSubject = snippetData.snippet_subject;
  
    const emailSubject = Mustache.render(snippetSubject, dynamicFields);
    let emailHTML = Mustache.render(snippetHTML, dynamicFields);
  
    const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${trackingId}" width="1" height="1" style="display:none;" />`;
    emailHTML += trackingPixel;
  
    const raw = makeBody(to, fromName, fromEmail, emailSubject, emailHTML);
  
    const { data: inProgressData } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();
  
    if (inProgressData) {
      await supabase.from("Completed").insert(inProgressData);
      await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);
    }
  
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const sendResponse = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
  
    await supabase.from("Emails").insert([{
      user_id: userId,
      professor_id: parseInt(professorId),
      thread_id: sendResponse.data.threadId,
      sent_at: new Date().toISOString(),
      type: "First",
      sent: true,
      tracking_id: trackingId,
    }]);
  
    await supabase.from("Messages").insert({
      thread_id: sendResponse.data.threadId,
      message_id: sendResponse.data.id,
      tracking_id: trackingId,
      type: "First",
    });
  
    return { message: "Successfully Sent!" };
  }
  