import { router } from 'expo-router';
import { useState } from 'react';
import { Notice } from '@/components/bits';
import { Button } from '@/components/Button';
import { Field, Screen, Title, TopBar } from '@/components/layout';
import { useData } from '@/state/data';

export default function AddFriend() {
  const data = useData();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await data.addFriend(email, name);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Couldn’t add them.';
      setError(/404|not found/i.test(msg) ? 'Nobody with that email uses CardVault yet. Ask them to sign in with Google first.' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button variant="primary" block label="Add friend" disabled={!validEmail || !data.online} busy={busy} onPress={add} />}>
      <TopBar back="Back" />
      <Title sub="Friends find each other by the email they use with Google.">Add a friend</Title>
      {!data.online ? (
        <Notice tone="info" icon="lock" title="Needs the CardVault server" body="This build isn’t connected to a server, so friends can’t be added yet. Demo data shows how it works." />
      ) : null}
      <Field label="Their Google email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
      <Field label="Name (only on your phone)" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Rahul Verma" />
      {error ? <Notice tone="bad" icon="alert" title="Not added" body={error} /> : null}
    </Screen>
  );
}
