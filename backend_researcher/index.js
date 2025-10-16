import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import authRouter from "./router/auth/authRouter.js";
import repositoryRouter from "./router/repository/repositoryRouter.js";

import "./queue/sendWorker.js";
import "./queue/draftWorker.js";
import "./queue/followUpWorker.js";
import "./queue/sendWithAttachmentsWorker.js";
import "./queue/followUpDraftWorker.js"
import "./queue/followUpWithAttachmentsWorker.js"

dotenv.config();
const app = express();
const port = 8080;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cookie');
  next();
});

//Rate Limit
app.use(cookieParser());
//Make this lower
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

app.use("/auth", authRouter);
app.use("/repository", repositoryRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
