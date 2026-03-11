import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage with actual storage
const localStorageData: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageData[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageData[key];
  },
  clear: () => {
    for (const key in localStorageData) {
      delete localStorageData[key];
    }
  },
  key: (index: number) => {
    const keys = Object.keys(localStorageData);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(localStorageData).length;
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock Sentry
vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  withErrorBoundary: (component: any) => component,
  withScope: vi.fn((callback) => callback({ setContext: vi.fn() })),
  showReportDialog: vi.fn(),
}));

// Mock Supabase
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Mock MasterBus
vi.mock('../src/core/MasterBus', () => ({
  masterBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock framer-motion with proper React.createElement
vi.mock('framer-motion', async () => {
  const React = await vi.importActual('react');
  const actual = await vi.importActual('framer-motion');

  return {
    ...actual,
    motion: {
      div: (props: any) => React.createElement('div', { ...props }),
      button: (props: any) => React.createElement('button', { ...props }),
    },
    AnimatePresence: (props: any) => props.children,
  };
});
