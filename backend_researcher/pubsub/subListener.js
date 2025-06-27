import dotenv from "dotenv"
dotenv.config()

import { PubSub } from "@google-cloud/pubsub"

//Subscriber of Messages
const pubsubclient = new PubSub({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
  });
const subscription = pubsubclient.subscription("gmail-replies-sub")

subscription.on("message", async (message) => {
    try {
        console.log("New Gmail Reply Event")
        message.ack()
    } catch {
        console.log("Failed")
    }
})
