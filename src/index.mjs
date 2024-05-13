import "dotenv/config";
import { NFTStorage } from "nft.storage";
import express from "express";
import multer from "multer";
import cors from "cors";
import { nanoid } from "nanoid";
import { mkdirSync, existsSync, createReadStream, rmSync } from 'node:fs';
import path from "path"
import { create, globSource } from 'kubo-rpc-client'
import { randomUUID } from 'node:crypto';
import { CarReader } from '@ipld/car'

const NFTStorageClient = new NFTStorage({ token: process.env.API_TOKEN });
const port = process.env.PORT || 4444;
const app = express();

app.use(cors());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let path = './data/' + req.dest + '/';
    file.path = path;
    if (!existsSync(path, { recursive: true })) {
      mkdirSync(path);
    }
    cb(null, path);
  },
  filename: function (req, file, cb) {
    const parsed = path.parse(file.originalname)
    const dest = './data/' + req.dest + '/' + parsed.dir
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    cb(null, file.originalname);
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

const uploadToNFTStorage = async (cid) => {
  if (process.env.API_TOKEN && process.env.USE_NFTSTORAGE) {
    try {
      console.log('uploading to nftstorage')
      const carBlob = kuboClient.dag.export(cid)
      const NFTStorageCID = await NFTStorageClient.storeCar(await CarReader.fromIterable(carBlob))
      console.log(`kubo: ${cid} nftstorage: ${NFTStorageCID}`)
    } catch (err) {
      console.log(`failed to upload to nftstorage: ${err}`)
    }
  }
}

app.post("/single", preuploadMiddleware, upload.single("asset"), async function (req, res) {
  try {
    if (req.file == null) {
      return handle_error(res, req, "Invalid request: 'file' is missing.", 400);
    }

    const { cid } = await kuboClient.add(createReadStream(req.file.path), { cidVersion: 0, rawLeaves: false, wrapWithDirectory: false })
    await uploadToNFTStorage(cid)

    res.json({ cid: cid.toString() });
  } catch (err) {
    handle_error(res, req, `unexpected error calling /single endpoint: ${err}`);
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
    for await (const file of kuboClient.addAll(globSource("./data/" + req.dest + "/", "**/*"), { cidVersion: 1, hidden: true, wrapWithDirectory: false })) {
      cid = file.cid
    }

    await uploadToNFTStorage(cid)

    res.json({ cid: cid.toString() });
  } catch (err) {
    handle_error(res, req, `unexpected error calling /multiple endpoint: ${err}`);
  } finally {
    rmSync("./data/" + req.dest, { recursive: true, force: true })
  }
});

app.listen(port);