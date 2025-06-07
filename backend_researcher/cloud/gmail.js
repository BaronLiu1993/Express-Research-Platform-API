import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
);

//Define Scopes For What It Can Access
const scopes = ['https://www.googleapis.com/auth/gmail.readonly']

app.get('/auth/gmail', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    })
    res.redirect(authUrl)
})
