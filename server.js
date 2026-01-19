const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 0 },
    unit: { type: String, default: "" },
    location: {
      type: String,
      enum: ["pantry", "fridge", "freezer"],
      required: true,
    },
    category: { type: String, default: "" },
    expiration: { type: String, default: "" },
    minimum: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    barcode: { type: String, default: "" },
  },
  { timestamps: true }
);

const Item = mongoose.model("Item", itemSchema);

const buildIngredientList = (items) => {
  const ingredients = new Set();
  items.forEach((item) => {
    if (item.name) {
      ingredients.add(item.name.toLowerCase().trim());
    }
    if (item.category) {
      ingredients.add(item.category.toLowerCase().trim());
    }
  });
  return Array.from(ingredients).filter(Boolean);
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", {
    title: "Pantry Atlas",
    eyebrow: "Home Inventory Control",
    lede:
      "Track pantry, fridge, and freezer items with intent. Log quantities, set minimums, and get ahead of expiring ingredients.",
    footer: "Built for quick pantry audits, meal planning, and peace of mind.",
    year: new Date().getFullYear(),
  });
});

app.get("/mobile", (req, res) => {
  res.render("mobile", {
    title: "Pantry Atlas Mobile",
    year: new Date().getFullYear(),
  });
});

app.get("/recipes", async (req, res) => {
  const items = await Item.find().sort({ createdAt: -1 });
  const ingredients = buildIngredientList(items);
  const apiKey = process.env.SPOONACULAR_API_KEY;

  if (!apiKey) {
    return res.render("recipes", {
      title: "Suggested Recipes",
      suggestions: [],
      items,
      year: new Date().getFullYear(),
      error: "Missing SPOONACULAR_API_KEY environment variable.",
    });
  }

  if (!ingredients.length) {
    return res.render("recipes", {
      title: "Suggested Recipes",
      suggestions: [],
      items,
      year: new Date().getFullYear(),
      error: "Add more items to get recipe suggestions.",
    });
  }

  try {
    const url = new URL("https://api.spoonacular.com/recipes/findByIngredients");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("ingredients", ingredients.join(","));
    url.searchParams.set("number", "8");
    url.searchParams.set("ranking", "2");
    url.searchParams.set("ignorePantry", "false");

    const response = await fetch(url);
    if (!response.ok) {
      return res.render("recipes", {
        title: "Suggested Recipes",
        suggestions: [],
        items,
        year: new Date().getFullYear(),
        error: "Spoonacular request failed. Try again later.",
      });
    }

    const suggestions = await response.json();
    return res.render("recipes", {
      title: "Suggested Recipes",
      suggestions,
      items,
      year: new Date().getFullYear(),
      error: "",
    });
  } catch (error) {
    console.error("Spoonacular lookup failed:", error.message);
    return res.render("recipes", {
      title: "Suggested Recipes",
      suggestions: [],
      items,
      year: new Date().getFullYear(),
      error: "Recipe lookup failed. Check server logs.",
    });
  }
});

app.get("/api/items", async (req, res) => {
  const items = await Item.find().sort({ createdAt: -1 });
  res.json(items);
});

app.get("/api/barcode/:code", async (req, res) => {
  const { code } = req.params;
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
    );
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to reach Open Food Facts" });
    }
    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const product = data.product;
    res.json({
      name: product.product_name || "",
      category: product.categories ? product.categories.split(",")[0].trim() : "",
      brand: product.brands || "",
      image: product.image_url || "",
      raw: product,
    });
  } catch (error) {
    console.error("Open Food Facts lookup failed:", error.message);
    res.status(502).json({ error: "Barcode lookup failed" });
  }
});

app.post("/api/items", async (req, res) => {
  const item = await Item.create(req.body);
  res.status(201).json(item);
});

app.put("/api/items/:id", async (req, res) => {
  const item = await Item.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json(item);
});

app.patch("/api/items/:id/adjust", async (req, res) => {
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta)) {
    return res.status(400).json({ error: "Invalid delta" });
  }
  const item = await Item.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  item.quantity = Math.max(0, (item.quantity || 0) + delta);
  await item.save();
  res.json(item);
});

app.delete("/api/items/:id", async (req, res) => {
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.status(204).end();
});

mongoose
  .connect(mongoUri)
  .then(() => {
    app.listen(port, () => {
      console.log(`Pantry Atlas running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  });
