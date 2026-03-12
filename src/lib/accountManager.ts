import { AccountManager, Accounts } from 'applesauce-accounts';

const { registerCommonAccountTypes } = Accounts;

// Singleton AccountManager — handles account persistence across page refreshes
export const accountManager = new AccountManager();
registerCommonAccountTypes(accountManager);

const ACCOUNTS_KEY = 'nostory-accounts';
const ACTIVE_KEY = 'nostory-active';

let initialized = false;

export async function initAccountManager(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Restore saved accounts
  const saved = localStorage.getItem(ACCOUNTS_KEY);
  if (saved) {
    try {
      await accountManager.fromJSON(JSON.parse(saved));
    } catch (e) {
      console.error('[AccountManager] Failed to restore accounts:', e);
      localStorage.removeItem(ACCOUNTS_KEY);
      localStorage.removeItem(ACTIVE_KEY);
      return;
    }
  }

  // Auto-save on any account change
  accountManager.accounts$.subscribe(() => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountManager.toJSON()));
  });

  // Restore active account
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId) {
    try {
      accountManager.setActive(activeId);
    } catch {
      // Account ID no longer valid
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  // Persist active account ID
  accountManager.active$.subscribe(account => {
    if (account) localStorage.setItem(ACTIVE_KEY, account.id);
    else localStorage.removeItem(ACTIVE_KEY);
  });
}
