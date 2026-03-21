import express from "express";
import crypto from "crypto";
import { verifyToken } from "../../services/authServices.js";
import scrapeQueue from "../../queue/scrape/scrapeQueue.js";
import { UNIVERSITY_URLS } from "../../scraper/universities.js";

const router = express.Router();

function verifyScraperSecret(req, res, next) {
  const provided = req.get("x-cron-secret");
  //const tsStr = req.get("x-cron-ts");
  const expected = process.env.SCRAPER_CRON_SECRET;

  if (!provided || !expected) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  /**
   * const ts = Number(tsStr);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) {
    return res.status(403).json({ message: "Stale request" });
  }
   */

  const ok =
    Buffer.from(provided).length === Buffer.from(expected).length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!ok) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  return next();
}

router.post("/trigger", verifyScraperSecret, async (req, res) => {
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
