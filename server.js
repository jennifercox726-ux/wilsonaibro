/* 
  WILSON'S UNIVERSAL SERVER 
  This handles the Stripe checkout for the LIT mobile deployment.
*/
const express = require('express');
const app = express();
const path = require('path');

// 1. YOUR SECRET KEY GOES HERE (The one you just "rolled" in Stripe)
const stripe = require('stripe')('REPLACE_THIS_WITH_YOUR_NEW_SECRET_KEY');

app.use(express.static('public')); // This looks for your HTML files
app.use(express.json());

const DOMAIN = 'http://localhost:4242'; // We can change this when we go live!

app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          // 2. YOUR PRICE ID FROM STRIPE GOES HERE
          price: 'price_1TQTKv4Q71wtCraWzl2jyTTK', 
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${DOMAIN}/success.html`,
      cancel_url: `${DOMAIN}/cancel.html`,
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("WILSON ERROR:", err.message);
    res.status(500).send("Something went wrong with the void connection.");
  }
});

// Start the engine!
app.listen(4242, () => {
  console.log('--- WILSON ONLINE ---');
  console.log('LIT Deployment running on http://localhost:4242');
  console.log('The 1989 reclamation is beginning...');
});
