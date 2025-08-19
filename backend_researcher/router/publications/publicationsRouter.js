import express from "express";

const router = express.Router();

router.get("/author/:authorId", async (req, res) => {
    const { authorId } = req.params;
    try {
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/author/${authorId}/papers?fields=url,title,year,authors&limit=2`
      );
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch papers list" });
      }
      const message = await response.json()
      return res.status(200).json({ message });

    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });
  

export default router;
