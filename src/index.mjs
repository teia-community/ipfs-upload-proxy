import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import { nanoid } from "nanoid";
import { mkdirSync, existsSync, createReadStream, rmSync } from 'node:fs';
import path from "path"
import { create, globSource } from 'kubo-rpc-client'
import { randomUUID } from 'node:crypto';

const pin = process.env.PIN || false;
const port = process.env.PORT || 4444;
const app = express();

app.use(cors());

// Reject any path segment that is empty, `.`, or `..` to prevent traversal.
const sanitizeUploadPath = (p) =>
  p.replace(/\\/g, '/')
   .split('/')
   .filter(part => part !== '' && part !== '.' && part !== '..')
   .join('/');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let path = './data/' + req.dest + '/';
    file.path = path;
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    cb(null, path);
  },
  filename: function (req, file, cb) {
    const safeName = sanitizeUploadPath(file.originalname);
    if (!safeName) {
      return cb(new Error('Invalid filename'));
    }
    const parsed = path.parse(safeName);
    const dest = './data/' + req.dest + '/' + parsed.dir;
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    cb(null, safeName);
  }
})

const upload = multer({
  storage,
  preservePath: true,
  limits: {
    fileSize: process.env.FILE_SIZE_LIMIT || 100000000, // 100MB
  },
});

const handle_error = (res, req, error, status = 500) => {
  const id = nanoid();
  console.error(`ERROR from ${req.hostname}@${req.ip} | ${id} -> ${error}`);
  res.status(status).send(`${id} | ${error}`);
};

const kuboClient = await create({
  host: process.env.IPFS_SERVER || '127.0.0.1',
  port: 5001,
  protocol: 'http',
})

const preuploadMiddleware = (req, _, next) => {
  req.dest = randomUUID();
  next();
};

app.post("/single", preuploadMiddleware, upload.single("asset"), async function (req, res) {
  try {
    if (req.file == null) {
      return handle_error(res, req, "Invalid request: 'file' is missing.", 400);
    }

    const { cid } = await kuboClient.add(createReadStream(req.file.path), { cidVersion: 0, rawLeaves: false, wrapWithDirectory: false, pin: pin })
    await kuboClient.routing.provide(cid, {recursive: true})
    res.json({ cid: cid.toString() });
  } catch (err) {
    handle_error(res, req, `unexpected error calling /single endpoint: ${err}${err?.cause ? ` (caused by: ${err.cause})` : ''}`);
  } finally {
    rmSync("./data/" + req.dest, { recursive: true, force: true })
  }
});

app.post("/multiple", preuploadMiddleware, upload.array("assets", 2000), async function (req, res) {
  try {
    if (req.files == null || req.files.length == 0) {
      return handle_error(res, req, "Invalid request: 'files' is missing or empty.", 400);
    }

    let cid
    for await (const file of kuboClient.addAll(globSource("./data/" + req.dest + "/", "**/*"), { cidVersion: 1, hidden: true, wrapWithDirectory: true, pin: pin })) {
      cid = file.cid
    }
    await kuboClient.routing.provide(cid, {recursive: true})
    res.json({ cid: cid.toString() });
  } catch (err) {
    handle_error(res, req, `unexpected error calling /multiple endpoint: ${err}${err?.cause ? ` (caused by: ${err.cause})` : ''}`);
  } finally {
    rmSync("./data/" + req.dest, { recursive: true, force: true })
  }
});

app.listen(port);
