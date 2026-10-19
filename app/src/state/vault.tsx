import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Network } from '@/lib/cardNumber';
import { randomId } from '@/lib/crypto';
import { getJSON, remove, setJSON } from '@/lib/secure';
import { useNow } from '@/lib/useNow';
import type { CardFace } from '@/theme/tokens';
import { useAuth } from './auth';

export type Card = {
  id: string;
  nickname: string;
  network: Network;
  number: string;
  expiry: string;
  cvv?: string;
  holder?: string;
  face: CardFace;
  createdAt: string;
  /** Opaque id sent with transactions instead of anything about the card. */
  cardRef: string;
  source: 'own' | 'shared';
  /** For cards a friend shared with me. */
  sharedBy?: { userId: string; name: string; shareId: string; limitMinor: number; endsAt: string };
  demo?: boolean;
};

export type NewCard = Omit<Card, 'id' | 'createdAt' | 'cardRef' | 'source'>;

const INDEX = 'cv.cards.index.v1';
const cardKey = (id: string) => `cv.card.${id}`;

type Ctx = {
  ready: boolean;
  cards: Card[];
  own: Card[];
  sharedWithMe: Card[];
  add: (card: NewCard) => Promise<Card>;
  upsert: (card: Card) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  wipe: () => Promise<void>;
};

const VaultContext = createContext<Ctx | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [ready, setReady] = useState(false);
  const nowMs = useNow(60_000);

  useEffect(() => {
    if (status !== 'signedIn') return;
    (async () => {
      const ids = (await getJSON<string[]>(INDEX)) ?? [];
      const loaded = await Promise.all(ids.map((id) => getJSON<Card>(cardKey(id))));
      setCards(loaded.filter((c): c is Card => !!c));
      setReady(true);
    })().catch(() => setReady(true));
  }, [status]);

  const persist = useCallback(async (next: Card[]) => {
    await setJSON(INDEX, next.map((c) => c.id));
    setCards(next);
  }, []);

  const upsert = useCallback(async (card: Card) => {
    await setJSON(cardKey(card.id), card);
    setCards((prev) => {
      const next = prev.some((c) => c.id === card.id) ? prev.map((c) => (c.id === card.id ? card : c)) : [...prev, card];
      setJSON(INDEX, next.map((c) => c.id)).catch(() => {});
      return next;
    });
  }, []);

  const add = useCallback(async (input: NewCard) => {
    const id = randomId('crd');
    const card: Card = { ...input, id, cardRef: id, source: 'own', createdAt: new Date().toISOString() };
    await upsert(card);
    return card;
  }, [upsert]);

  const removeCard = useCallback(async (id: string) => {
    await remove(cardKey(id));
    await persist(cards.filter((c) => c.id !== id));
  }, [cards, persist]);

  const wipe = useCallback(async () => {
    await Promise.all(cards.map((c) => remove(cardKey(c.id))));
    await remove(INDEX);
    setCards([]);
  }, [cards]);

  const value = useMemo(() => {
    const live = cards.filter((c) => c.source === 'own' || !c.sharedBy || Date.parse(c.sharedBy.endsAt) > nowMs);
    return {
      ready,
      cards: live,
      own: live.filter((c) => c.source === 'own'),
      sharedWithMe: live.filter((c) => c.source === 'shared'),
      add,
      upsert,
      removeCard,
      wipe,
    };
  }, [ready, cards, nowMs, add, upsert, removeCard, wipe]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault outside VaultProvider');
  return ctx;
}
