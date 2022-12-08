import "dotenv/config";
import { File, NFTStorage } from "nft.storage";
import { packToBlob } from "ipfs-car/pack/blob";
import express from "express";
import { Blob } from "buffer";
import multer from "multer";
import cors from "cors";
import { nanoid } from "nanoid";

const client = new NFTStorage({ token: process.env.API_TOKEN });
const port = process.env.PORT || 4444;
const app = express();

app.use(cors());

const storage = multer.memoryStorage();
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

app.post("/single", upload.single("asset"), async function (req, res) {
  try {
    if (req.file == null) {
      return handle_error(res, req, "Invalid request: 'file' is missing.", 400);
    }

    const { root, car } = await packToBlob({
      input: new Blob([req.file.buffer]),
      rawLeaves: false,
      wrapWithDirectory: false,
    });
    await client.storeCar(car);
    const cid = root.toV0().toString();

    res.json({ cid });
  } catch (err) {
    handle_error(res, req, `unexpected error calling /single endpoint: ${err}`);
  }
});

app.post("/multiple", upload.array("assets", 2000), async function (req, res) {
  try {
    if (req.files == null || req.files.length == 0) {
      return handle_error(res, req, "Invalid request: 'files' is missing or empty.", 400);
    }
    const cid = await client.storeDirectory(req.files.map((file) => new File([file.buffer], file.originalname)));

    res.json({ cid: cid.toString() });
  } catch (err) {
    handle_error(req, res, `unexpected error calling /multiple endpoint: ${err}`);
  }
});

app.listen(port);
