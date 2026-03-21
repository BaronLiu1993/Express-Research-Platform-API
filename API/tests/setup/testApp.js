import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

export function createTestApp(...routers) {
  const app = express();
  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  for (const [path, router] of routers) {
    app.use(path, router);
  }
  return app;
}
