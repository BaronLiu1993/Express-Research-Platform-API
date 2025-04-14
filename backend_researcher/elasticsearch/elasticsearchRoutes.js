import express from 'express';
import elasticsearchService from './elasticsearchService'
const router = express.Router();

router.post('/index', async (req, res) => {
  const { index, id, document } = req.body;
  try {
    await elasticsearchService.indexDocument(index, id, document);
    res.status(200).send('Document indexed successfully');
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

router.get('/search', async (req, res) => {
  const { index, query } = req.query;
  try {
    const results = await elasticsearchService.searchDocuments(index, JSON.parse(query));
    res.status(200).json(results);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

module.exports = router;