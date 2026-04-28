import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Load config
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

// Initialize Firebase Admin
let adminApp;
if (getApps().length === 0) {
  try {
    // Initialize with the specific project ID from config
    // This ensures we target the correct Firebase project even in Cloud Run
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized for project:", firebaseConfig.projectId);
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
    // Fallback to default just in case, though config is preferred
    adminApp = initializeApp();
  }
} else {
  adminApp = getApp();
}

// Initialize Firestore with the specific database ID from config
const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
console.log("Firestore initialized with Database ID:", firebaseConfig.firestoreDatabaseId);

// Test Firestore connection
(async () => {
  try {
    console.log("Testing Firestore connection...");
    const testDoc = await db.collection("users").limit(1).get();
    console.log("Firestore connection test successful. Found", testDoc.size, "users.");
  } catch (error) {
    console.error("Firestore connection test failed:", error);
  }
})();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Lazy initialize Stripe
  let stripe: Stripe | null = null;
  const getStripe = () => {
    if (!stripe && process.env.STRIPE_SECRET_KEY) {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripe;
  };

  app.use((req, res, next) => {
    if (req.originalUrl === "/api/webhook") {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  // API Route for Stripe Checkout
  app.post("/api/create-checkout-session", async (req, res) => {
    console.log("Received request for /api/create-checkout-session", req.body);
    const { userId, userEmail } = req.body;
    const stripeClient = getStripe();

    if (!stripeClient) {
      console.error("Stripe Secret Key is missing in environment variables.");
      return res.status(500).json({ error: "Stripe is not configured. Please add STRIPE_SECRET_KEY in settings." });
    }

    try {
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "GrantPrix Pro Subscription",
                description: "Unlimited AI reviews, personalized recommendations, insider insights, and priority email support.",
              },
              unit_amount: 1000, // $10.00
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/`,
        customer_email: userEmail,
        metadata: {
          userId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/verify-session", async (req, res) => {
    const { sessionId, userId } = req.body;
    
    if (!sessionId || !userId) {
      return res.status(400).json({ error: "Missing sessionId or userId" });
    }

    const stripeClient = getStripe();

    if (!stripeClient) {
      return res.status(500).json({ error: "Stripe is not configured." });
    }

    try {
      console.log(`Verifying session ${sessionId} for user ${userId}`);
      const session = await stripeClient.checkout.sessions.retrieve(sessionId);
      console.log(`Session status: ${session.payment_status}, Metadata UserID: ${session.metadata?.userId}`);
      
      if (session.payment_status === "paid" && session.metadata?.userId === userId) {
        console.log(`Updating Firestore for user ${userId} in database ${firebaseConfig.firestoreDatabaseId}`);
        const userDocRef = db.collection("users").doc(userId);
        console.log(`User document path: ${userDocRef.path}`);
        
        await userDocRef.set({
          isPremium: true,
          aiReviewCount: 0,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`Successfully updated user ${userId} to Pro.`);
        return res.json({ success: true });
      } else {
        console.warn(`Session verification failed: status=${session.payment_status}, metadataUserId=${session.metadata?.userId}`);
        return res.status(400).json({ error: "Session not paid or user mismatch" });
      }
    } catch (error: any) {
      console.error("Verification Error Detail:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Webhook
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const stripeClient = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeClient || !sig || !webhookSecret) {
      return res.status(400).send("Webhook Error: Missing configuration");
    }

    let event;

    try {
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId) {
        try {
          console.log(`Webhook: Updating user ${userId} to Pro status.`);
          await db.collection("users").doc(userId).set({
            isPremium: true,
            aiReviewCount: 0,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`Webhook: Successfully updated user ${userId} to Pro.`);
        } catch (error: any) {
          console.error(`Webhook: Error updating user ${userId} in Firestore:`, error);
        }
      }
    }

    res.json({ received: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
