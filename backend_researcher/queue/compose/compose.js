import NodeMailer from "nodemailer";

import { google } from "googleapis";

const { OAuth2 } = google.auth;

export async function sendEmail(
  clientId,
  clientSecret,
  fromName,
  fromEmail,
  to,
  subject,
  html,
  refreshToken
) {
  // 1) Create an OAuth2 client with your credentials
  const oAuth2Client = new OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground" 
  );

  // 2) Give it the refresh token
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  // 3) Request a fresh access token
  const { token: accessToken } = await oAuth2Client.getAccessToken();

  // 4) Create the SMTP transport
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: fromEmail,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
    },
  });

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
  });
}