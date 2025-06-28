require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const decoded = Buffer.from(process.env.FB_SERVICE_KEY , 'base64').toString('utf8');

const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.decoded = userInfo.uid;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.psjt8aa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const foodsCollection = client.db("share_and_care").collection("foods");
    const foodRequestCollection = client
      .db("share_and_care")
      .collection("foodRequests");

    app.get("/foods", async (req, res) => {
      const query = { status: "Available" };
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/myAddedFoods",verifyFirebaseToken, async (req, res) => {
      const query = req.query;
      if (req.query.uid !== req.decoded) {
        return res.status(403).message({ message: "forbidden access" });
      }
      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/sortByExpireDate", async (req, res) => {
      const result = await foodsCollection
        .find()
        .sort({ expireDate: 1, _id: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/featuredFood", async (req, res) => {
      const result = await foodsCollection
        .aggregate([
          {
            $addFields: {
              quantity: { $toInt: "$quantity" },
            },
          },
          {
            $sort: { quantity: -1, _id: -1 },
          },
          {
            $limit: 6,
          },
        ])
        .toArray();

      res.send(result);
    });

    app.get("/foods/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.findOne(query);
      res.send(result);
    });

    app.get("/foodRequest/:id", async (req, res) => {
      const id = req.params.id;
      const query = { uid: id };
      const requests = await foodRequestCollection.find(query).toArray();

      const foodPromises = requests.map(async (request) => {
        const requestedAt = request.requestedAt;
        const requestData = { requestedAt };
        const foodId = request.foodId;
        const foodQuery = { _id: new ObjectId(foodId) };
        const foodData = await foodsCollection.findOne(foodQuery);
        return { foodData, requestData };
      });

      const result = await Promise.all(foodPromises);
      res.send(result);
    });

    app.post("/foods", async (req, res) => {
      const newFoodData = req.body;
      const result = await foodsCollection.insertOne(newFoodData);
      res.send(result);
    });

    app.post("/foodRequest", async (req, res) => {
      const requestData = req.body;
      const result = await foodRequestCollection.insertOne(requestData);
      res.send(result);
    });

    app.patch("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const newFoodData = req.body;
      const updateDoc = {
        $set: newFoodData,
      };
      const result = await foodsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/foods/:id", async (req, res) => {
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Share & Care!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
