// COMPONENT: Button
// PATTERN: forwardRef, CVA variants, loading state, icon slots
// FILE: components/common/Button.tsx

export const COMPONENT_SOURCE = `
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', isLoading = false,
     leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn('inline-flex items-center', className)}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="animate-spin" /> : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
`;

export const TEST_OUTPUT = `import * as React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import { Button } from '../Button';

jest.mock('lucide-react', () => ({
  Loader2: (props: any) => <svg data-testid="loader-icon" {...props} />,
}));

describe('Button', () => {
  it('renders children text', () => {
    renderWithProviders(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('is clickable and fires onClick handler', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    renderWithProviders(<Button onClick={handleClick}>Submit</Button>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    renderWithProviders(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when isLoading is true', () => {
    renderWithProviders(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading spinner when isLoading is true', () => {
    renderWithProviders(<Button isLoading>Save</Button>);
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('does not show loading spinner when isLoading is false', () => {
    renderWithProviders(<Button>Save</Button>);
    expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
  });

  it('renders left icon when provided', () => {
    renderWithProviders(
      <Button leftIcon={<span data-testid="left-icon">→</span>}>Next</Button>
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('renders right icon when provided', () => {
    renderWithProviders(
      <Button rightIcon={<span data-testid="right-icon">←</span>}>Back</Button>
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('hides right icon when loading', () => {
    renderWithProviders(
      <Button isLoading rightIcon={<span data-testid="right-icon">←</span>}>Back</Button>
    );
    expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument();
  });

  it('forwards ref to the button element', () => {
    const ref = React.createRef<HTMLButtonElement>();
    renderWithProviders(<Button ref={ref}>Ref test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('passes native button props through', () => {
    renderWithProviders(<Button type="submit" name="my-btn">Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('name', 'my-btn');
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    renderWithProviders(<Button disabled onClick={handleClick}>No click</Button>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('matches snapshot', () => {
    const { container } = renderWithProviders(<Button variant="destructive" size="lg">Delete</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
`;
