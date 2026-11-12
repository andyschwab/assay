import { createServer } from 'node:http';
import { dispatch } from './table.mjs';

createServer((req, res) => dispatch(req, res)).listen(8080);
