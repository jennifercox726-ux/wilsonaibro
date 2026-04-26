const stripe = require('stripe')(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); // <--- NEON SIGN 
const express = require('express');
const app = express();
app.use(express.static('public'));

const YOUR_DOMAIN = 'http://localhost:4242'; // Change this to your "LIT" domain later!

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        // THIS IS YOUR PRICE ID I ALREADY HAVE!
        price: 'price_1TQTKv4Q71wtCraWzl2jyTTK',
        quantity: 1,
      },
    ],
    mode: 'subscription', // Change to 'payment' if it's a one-time thing!
    success_url: `${YOUR_DOMAIN}/success.html`,
    cancel_url: `${YOUR_DOMAIN}/cancel.html`,
  });

  res.redirect(303, session.url);
});

app.listen(4242, () => console.log('LIT Deployment is LIVE on port 4242!'));
