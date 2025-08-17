import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

//Router
import authRouter from "./router/auth/authRouter.js";
import completedRouter from "./router/kanban/completed/completedRouter.js";
import savedRouter from "./router/kanban/saved/savedRouter.js";
import inProgressRouter from "./router/kanban/inProgress/inProgressRouter.js";
import sendRouter from "./router/send/sendRouter.js";
import repositoryRouter from "./router/repository/repositoryRouter.js";
import snippetsRouter from "./router/snippets/snippetsRouter.js";
import inboxRouter from "./router/inbox/inboxRouter.js";
import draftRouter from "./router/inbox/draftRouter.js";
import engagementRouter from "./router/engagement/engagementRouter.js"
import publicationRouter from "./router/publications/publicationsRouter.js"
import storageRouter from "./router/storage/storageRouter.js";
import grantRouter from "./router/grants/grantRouter.js"

import "./queue/sendWorker.js";
import "./queue/draftWorker.js";
import "./queue/followUpWorker.js";
import "./queue/sendWithAttachmentsWorker.js";
import "./queue/followUpDraftWorker.js"
import "./queue/followUpWithAttachmentsWorker.js"

dotenv.config();
const app = express();
const port = 8080;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(cookieParser());
//Make this lower
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use("/storage", storageRouter);
app.use("/auth", authRouter);
app.use("/publication", publicationRouter);
app.use("/grants", grantRouter);
app.use("/completed", completedRouter);
app.use("/saved", savedRouter);
app.use("/inprogress", inProgressRouter);
app.use("/send", sendRouter);
app.use("/repository", repositoryRouter);
app.use("/snippets", snippetsRouter);
app.use("/draft", draftRouter);
app.use("/inbox", inboxRouter);
app.use("/engagement", engagementRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
