import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";
import "./queue/send/sendWorker.js";
import "./queue/draft/draftWorker.js";
import "./queue/variablelessDrafts/variablelessWorker.js"
import "./queue/sendAttachments/sendAttachmentsWorker.js"
import "./queue/inbox/inboxWorker.js"
import "./queue/watch/watchWorker.js"

import authRouter from "./router/auth/authrouter.js";
import repositoryRouter from "./router/repository/repositoryRouter.js";
import savedRouter from "./router/saved/savedRouter.js";
import snippetRouter from "./router/snippet/snippetRouter.js";
import sendRouter from "./router/send/sendRouter.js";
import inboxRouter from "./router/inbox/inboxRouter.js";
import engagementRouter from "./router/engagement/engagementRouter.js";
import replyRouter from "./router/reply/replyRouter.js";
import storageRouter from "./router/storage/storageRouter.js"

dotenv.config();
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  })
);


app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,  
  max: 200,                
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use("/auth", authRouter);
app.use("/repository", repositoryRouter);
app.use("/saved", savedRouter);
app.use("/snippets", snippetRouter);
app.use("/email", sendRouter);
app.use("/inbox", inboxRouter);
app.use("/engagement", engagementRouter);
app.use("/reply", replyRouter);
app.use("/storage", storageRouter)

app.listen(process.env.PORT, () => {
  console.log(`Server Started`);
});
