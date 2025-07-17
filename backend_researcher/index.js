import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

//Router
import authRouter from "./router/auth/authRouter.js";
import googleRouter from "./router/auth/googleRouter.js";
import completedRouter from "./router/kanban/completed/completedRouter.js";
import savedRouter from "./router/kanban/saved/savedRouter.js";
import inProgressRouter from "./router/kanban/inProgress/inProgressRouter.js";
import sendRouter from "./router/send/sendRouter.js";
import repositoryRouter from "./router/repository/repositoryRouter.js";
import snippetsRouter from "./router/snippets/snippetsRouter.js";
import variablesRouter from "./router/variables/variablesRouter.js";
import inboxRouter from "./router/inbox/inboxRouter.js";
import draftRouter from "./router/inbox/draftRouter.js";

import "./queue/sendWorker.js";
import "./queue/draftWorker.js";
import "./queue/followUpWorker.js";

dotenv.config();

const app = express();
const port = 8080;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

app.use("/auth", authRouter);
app.use("/google/auth", googleRouter);
app.use("/completed", completedRouter);
app.use("/saved", savedRouter);
app.use("/inprogress", inProgressRouter);
app.use("/send", sendRouter);
app.use("/repository", repositoryRouter);
app.use("/snippets", snippetsRouter);
app.use("/variables", variablesRouter);
app.use("/draft", draftRouter);
app.use("/inbox", inboxRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
