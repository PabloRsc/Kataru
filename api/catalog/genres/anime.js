import catalogHandler from '../../../server/catalog.js';

export default function handler(req, res) {
  req.query = { ...req.query, path: ['genres', 'anime'] };
  return catalogHandler(req, res);
}
