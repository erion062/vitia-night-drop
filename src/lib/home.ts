import type { User } from '../types';

export function homeFor(user: User | null | undefined) {
  if (user?.role === 'admin') return '/admin';
  if (user?.role === 'partner') return '/partner';
  return '/';
}
