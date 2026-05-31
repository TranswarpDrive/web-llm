import { createClient } from '@supabase/supabase-js';
import type { Bindings } from '../types';

function isDevMode(env: Bindings): boolean {
  return !env.SUPABASE_URL || env.SUPABASE_URL === 'https://your-project.supabase.co';
}

async function verifyPbkdf2(password: string, saltBase64: string, hashBase64: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const storedHash = Uint8Array.from(atob(hashBase64), c => c.charCodeAt(0));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const derivedBytes = new Uint8Array(derived);

  // Constant-time comparison
  if (derivedBytes.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedBytes.length; i++) {
    diff |= derivedBytes[i] ^ storedHash[i];
  }
  return diff === 0;
}

export async function verifyPassword(
  username: string,
  password: string,
  env: Bindings
): Promise<{ userId: string; username: string } | null> {
  // Dev mode: use hardcoded credentials when Supabase isn't configured
  if (isDevMode(env)) {
    if (username !== 'admin') return null;

    const valid = await verifyPbkdf2(
      password,
      'hj75wIOWF7LgaEIe+bTRRuafTTCpsavJO8KTqF90EHA=',
      'yvVyr5Zxg4XpSKCyQJa4fZaTDNb3krM/a3e6yrYMPic='
    );

    if (!valid) return null;

    return { userId: 'dev-user-id', username: 'admin' };
  }

  // Production mode: query Supabase
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: user } = await supabase
    .from('users')
    .select('id, username, password_hash, password_salt')
    .eq('username', username)
    .single();

  if (!user) return null;

  const valid = await verifyPbkdf2(password, user.password_salt, user.password_hash);
  if (!valid) return null;

  return { userId: user.id, username: user.username };
}

export async function getUserById(
  userId: string,
  env: Bindings
): Promise<{ id: string; username: string } | null> {
  // Dev mode
  if (isDevMode(env)) {
    if (userId === 'dev-user-id') return { id: 'dev-user-id', username: 'admin' };
    return null;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: user } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', userId)
    .single();

  return user ? { id: user.id, username: user.username } : null;
}
