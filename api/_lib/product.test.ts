import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPrice, isAnswerVaultSession } from "./product.js";
import { getPriceId } from "./stripe.js";

const AV = "price_av";

function fakeStripe(priceIds: Array<string | null>) {
  return {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: priceIds.map((id) => ({ price: id ? { id } : null })),
        }),
      },
    },
  };
}

test("hasPrice: matches only the expected price", () => {
  assert.equal(hasPrice([AV], AV), true);
  assert.equal(hasPrice(["price_findgrants_pro", AV], AV), true);
  assert.equal(hasPrice(["price_findgrants_pro"], AV), false);
  assert.equal(hasPrice([], AV), false);
  assert.equal(hasPrice([AV], ""), false);
});

test("AnswerVault checkout session is accepted", async () => {
  assert.equal(
    await isAnswerVaultSession(fakeStripe([AV]), { id: "cs_1" }, AV),
    true,
  );
});

test("FindGrants-shaped session (other price) is rejected", async () => {
  assert.equal(
    await isAnswerVaultSession(
      fakeStripe(["price_1Udcp7Ap3o9rAimXgyOuAWL9"]),
      { id: "cs_2" },
      AV,
    ),
    false,
  );
});

test("session with no line-item price (ad hoc amount) is rejected", async () => {
  assert.equal(
    await isAnswerVaultSession(fakeStripe([null]), { id: "cs_3" }, AV),
    false,
  );
});

test("CR-tainted STRIPE_PRICE_ID still matches the AnswerVault price, another product's price does not", async () => {
  const saved = process.env.STRIPE_PRICE_ID;
  process.env.STRIPE_PRICE_ID = "price_av\r\n";
  try {
    assert.equal(getPriceId(), "price_av");
    assert.equal(
      await isAnswerVaultSession(fakeStripe(["price_av"]), { id: "cs_5" }),
      true,
    );
    assert.equal(
      await isAnswerVaultSession(fakeStripe(["price_other"]), { id: "cs_6" }),
      false,
    );
  } finally {
    if (saved === undefined) delete process.env.STRIPE_PRICE_ID;
    else process.env.STRIPE_PRICE_ID = saved;
  }
});

test("whitespace-only STRIPE_PRICE_ID throws", () => {
  const saved = process.env.STRIPE_PRICE_ID;
  process.env.STRIPE_PRICE_ID = "\r";
  try {
    assert.throws(() => getPriceId(), /STRIPE_PRICE_ID is not set/);
  } finally {
    if (saved === undefined) delete process.env.STRIPE_PRICE_ID;
    else process.env.STRIPE_PRICE_ID = saved;
  }
});

test("Stripe lookup failure propagates (webhook returns 500 and Stripe retries)", async () => {
  const broken = {
    checkout: {
      sessions: {
        listLineItems: async () => {
          throw new Error("stripe down");
        },
      },
    },
  };
  await assert.rejects(
    isAnswerVaultSession(broken, { id: "cs_4" }, AV),
    /stripe down/,
  );
});
