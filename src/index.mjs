import "dotenv/config";
import { NFTStorage } from "nft.storage";
import { packToBlob } from "ipfs-car/pack/blob";
import { MemoryBlockStore } from "ipfs-car/blockstore/memory";
import express from "express";
import { Blob } from "buffer";
import multer from "multer";
import cors from "cors";

const client = new NFTStorage({ token: process.env.API_TOKEN });
const port = process.env.PORT || 4444;
const app = express();

app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/single", upload.single("asset"), async function (req, res) {
  if (req.file == null) {
    res.status(400).send('Invalid request');
    return;
  }

  const { root, car } = await packToBlob({
      input: new Blob([req.file.buffer]),
      rawLeaves: false,
      wrapWithDirectory: false,
  })
  await client.storeCar(car)
  const cid = root.toV0().toString()

  res.json({ cid });
});

app.post("/multiple", upload.array("assets", 100), async function (req, res) {
  if (req.files == null || req.files.length == 0) {
    res.status(400).send('Invalid request');
    return;
  }
  const { root, car } = await packToBlob({
    input: req.files.map((file) => ({
      path: file.originalname,
      content: file.buffer,
    })),
    blockstore: new MemoryBlockStore(),
    wrapWithDirectory: true,
  });

  await client.storeCar(car);
  const cid = root.toV0().toString();
  res.json({ cid });

});

app.listen(port);
