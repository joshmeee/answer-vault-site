import type Stripe from "stripe";
import { getPriceId } from "./stripe.js";

// The Stripe account is shared by every Palavir product, and this webhook
// receives every checkout.session.completed on it. Only a session that bought
// the AnswerVault price may mint a license.

export function hasPrice(priceIds: string[], expectedPriceId: string): boolean {
  if (!expectedPriceId) return false;
  return priceIds.includes(expectedPriceId);
}

type LineItemLister = {
  checkout: {
    sessions: {
      listLineItems(
        id: string,
        params: { limit: number },
      ): Promise<{ data: Array<{ price?: { id: string } | null }> }>;
    };
  };
};

export async function isAnswerVaultSession(
  stripe: LineItemLister,
  session: Pick<Stripe.Checkout.Session, "id">,
  expectedPriceId: string = getPriceId(),
): Promise<boolean> {
  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 10,
  });
  const ids = items.data.map((i) => i.price?.id ?? "");
  return hasPrice(ids, expectedPriceId);
}
