import express from "express";
import { verifyToken } from "../../services/authServices.js";
import scrapeQueue from "../../queue/scrape/scrapeQueue.js";
import { UNIVERSITY_URLS } from "../../scraper/universities.js";

const router = express.Router();

router.post("/trigger", verifyToken, async (req, res) => {
  try {
    if (!UNIVERSITY_URLS.length) {
      return res.status(200).json({ message: "No URLs configured", count: 0 });
    }

    const jobs = UNIVERSITY_URLS.map((config) => ({
      name: "scrape-professors",
      data: {
        school: config.school,
        faculty: config.faculty,
        department: config.department,
        url: config.url,
      },
    }));

    await scrapeQueue.addBulk(jobs);

    return res.status(200).json({
      message: "Scrape jobs queued",
      count: jobs.length,
      urls: UNIVERSITY_URLS.map((c) => `${c.school} / ${c.department}`),
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to queue scrape jobs" });
  }
});

router.get("/status", verifyToken, async (req, res) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      scrapeQueue.getWaitingCount(),
      scrapeQueue.getActiveCount(),
      scrapeQueue.getCompletedCount(),
      scrapeQueue.getFailedCount(),
    ]);

    return res.status(200).json({
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to get queue status" });
  }
});

export default router;
