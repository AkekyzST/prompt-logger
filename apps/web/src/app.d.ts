// See https://svelte.dev/docs/kit/types#app
// for information about these interfaces.

export type UserRole = 'admin' | 'viewer';

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  accessibleSessionCount: number;
  accessibleTagCount: number;
}

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: AppUser | null;
      theme: 'light' | 'dark' | 'system';
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
