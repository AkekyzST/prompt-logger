import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

export const prerender = false;

export function load(): void {
  if (!dev) {
    throw error(404, 'Not found');
  }
}
