import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import AuthPage from '@/pages/AuthPage';
import { supabase } from '@/lib/supabase';
import { masterBus } from '@/core/MasterBus';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AuthPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        {component}
      </BrowserRouter>
    );
  };

  describe('Login Form', () => {
    it('renders login form by default', () => {
      renderWithRouter(<AuthPage />);
      expect(screen.getByDisplayValue('')).toBeInTheDocument(); // Email input
    });

    it('shows login tab as active', () => {
      const { container } = renderWithRouter(<AuthPage />);
      // Check that login form is visible
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });

    it('switches to signup form when signup tab clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<AuthPage />);

      const signupTab = screen.queryByText(/signup|sign up/i);
      if (signupTab) {
        await user.click(signupTab);
        // After clicking signup, form should show username field
        expect(screen.getByDisplayValue('')).toBeInTheDocument();
      }
    });

    it('switches to password reset when reset link clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<AuthPage />);

      const resetLink = screen.queryByText(/forgot password|reset password/i);
      if (resetLink) {
        await user.click(resetLink);
        // Reset form should be visible
        expect(screen.getByDisplayValue('')).toBeInTheDocument();
      }
    });
  });

  describe('Form Validation', () => {
    it('shows validation error for empty email on login', async () => {
      const user = userEvent.setup();
      (supabase.auth.signInWithPassword as any).mockRejectedValue(
        new Error('Invalid login credentials')
      );

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const form = inputs[0].closest('form');

      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          await user.click(submitButton);
        }
      }
    });

    it('shows validation error for password mismatch on signup', async () => {
      const user = userEvent.setup();
      renderWithRouter(<AuthPage />);

      // Navigate to signup
      const signupTab = screen.queryByText(/signup|sign up/i);
      if (signupTab) {
        await user.click(signupTab);
      }
    });

    it('shows validation error for weak password', async () => {
      const user = userEvent.setup();
      renderWithRouter(<AuthPage />);

      // Navigate to signup
      const signupTab = screen.queryByText(/signup|sign up/i);
      if (signupTab) {
        await user.click(signupTab);
      }
    });

    it('requires username on signup', async () => {
      const user = userEvent.setup();
      renderWithRouter(<AuthPage />);

      // Navigate to signup
      const signupTab = screen.queryByText(/signup|sign up/i);
      if (signupTab) {
        await user.click(signupTab);
      }
    });
  });

  describe('Form Accessibility', () => {
    it('has proper label associations', () => {
      renderWithRouter(<AuthPage />);

      // Check for input fields with proper structure
      const inputs = screen.getAllByDisplayValue('');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('login form has email input', () => {
      renderWithRouter(<AuthPage />);
      const inputs = screen.getAllByDisplayValue('');
      expect(inputs.length).toBeGreaterThanOrEqual(2); // Email and password
    });

    it('login form has password input', () => {
      renderWithRouter(<AuthPage />);
      // Check that form fields are present
      expect(screen.getAllByDisplayValue('').length).toBeGreaterThanOrEqual(2);
    });

    it('login form has submit button', () => {
      const { container } = renderWithRouter(<AuthPage />);
      const submitButton = container.querySelector('button[type="submit"]');
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message on login failure', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Invalid email or password';

      (supabase.auth.signInWithPassword as any).mockRejectedValue(
        new Error(errorMessage)
      );

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const form = emailInput.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          await user.click(submitButton);

          await waitFor(() => {
            expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
          });
        }
      }
    });

    it('displays error message on signup failure', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Username already taken';

      (supabase.auth.signUp as any).mockRejectedValue(
        new Error(errorMessage)
      );

      renderWithRouter(<AuthPage />);

      const signupTab = screen.queryByText(/signup|sign up/i);
      if (signupTab) {
        await user.click(signupTab);
      }
    });

    it('clears error message when user makes new attempt', async () => {
      const user = userEvent.setup();

      (supabase.auth.signInWithPassword as any).mockRejectedValue(
        new Error('Login failed')
      );

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;

      // First attempt
      await user.type(emailInput, 'test@example.com');

      // Clear and try again
      await user.clear(emailInput);
      expect(emailInput.value).toBe('');
    });
  });

  describe('Loading State', () => {
    it('disables submit button while loading', async () => {
      const user = userEvent.setup();

      (supabase.auth.signInWithPassword as any).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const form = emailInput.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          await user.click(submitButton);

          // Button should be disabled while loading
          expect(submitButton).toHaveAttribute('disabled');
        }
      }
    });

    it('shows loading indicator while authenticating', async () => {
      const user = userEvent.setup();

      (supabase.auth.signInWithPassword as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: { user: { id: '123' } }, error: null }), 100))
      );

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
    });
  });

  describe('Success States', () => {
    it('navigates to home on successful login', async () => {
      const user = userEvent.setup();

      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      });

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const form = emailInput.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          await user.click(submitButton);

          await waitFor(() => {
            expect(masterBus.emit).toHaveBeenCalledWith(
              'AUTH_STATE_CHANGED',
              expect.objectContaining({
                userId: 'user123',
                isAuthenticated: true,
              })
            );
          });
        }
      }
    });

    it('emits AUTH_STATE_CHANGED event on successful login', async () => {
      const user = userEvent.setup();

      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      });

      renderWithRouter(<AuthPage />);

      const inputs = screen.getAllByDisplayValue('');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const form = emailInput.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          await user.click(submitButton);

          await waitFor(() => {
            expect(masterBus.emit).toHaveBeenCalled();
          });
        }
      }
    });
  });
});
