import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPrice, isAnswerVaultSession } from "./product.js";

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
