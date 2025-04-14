// elasticsearchService.js
import client from './elasticsearchClient';

async function indexDocument(index, id, document) {
  await client.index({
    index,
    id,
    body: document
  });

  await client.indices.refresh({ index });
}
async function searchDocuments(index, query) {
  const { body } = await client.search({
    index,
    body: query
  });

  return body.hits.hits; 
}

export { indexDocument, searchDocuments };
