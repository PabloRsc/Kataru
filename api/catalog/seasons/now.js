import catalogHandler from '../../../server/catalog.js';

export default function handler(req, res) {
  return catalogHandler(req, res, ['seasons', 'now']);
}
