// COMPONENT: EmptyState
// PATTERN: Simple presentational, optional callback, icon slot
// FILE: components/common/EmptyState.tsx

export const COMPONENT_SOURCE = `
import type { ReactNode } from 'react';
import { Button } from '@/components/common/Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
`;

export const TEST_OUTPUT = `import * as React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  const defaultProps = {
    title: 'No expenses found',
  };

  it('renders the title', () => {
    renderWithProviders(<EmptyState {...defaultProps} />);
    expect(screen.getByText('No expenses found')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    renderWithProviders(
      <EmptyState {...defaultProps} description="Try adding your first expense." />
    );
    expect(screen.getByText('Try adding your first expense.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    renderWithProviders(<EmptyState {...defaultProps} />);
    expect(screen.queryByText(/try adding/i)).not.toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    renderWithProviders(
      <EmptyState {...defaultProps} icon={<span data-testid="empty-icon">📭</span>} />
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('does not render icon section when no icon provided', () => {
    const { container } = renderWithProviders(<EmptyState {...defaultProps} />);
    expect(container.querySelector('.mb-4')).not.toBeInTheDocument();
  });

  it('renders action button when both actionLabel and onAction are provided', () => {
    const onAction = jest.fn();
    renderWithProviders(
      <EmptyState {...defaultProps} actionLabel="Add Expense" onAction={onAction} />
    );
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
  });

  it('does not render action button when only actionLabel is provided', () => {
    renderWithProviders(
      <EmptyState {...defaultProps} actionLabel="Add Expense" />
    );
    expect(screen.queryByRole('button', { name: /add expense/i })).not.toBeInTheDocument();
  });

  it('calls onAction when action button is clicked', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    renderWithProviders(
      <EmptyState {...defaultProps} actionLabel="Add Expense" onAction={onAction} />
    );

    await user.click(screen.getByRole('button', { name: /add expense/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot with all props', () => {
    const { container } = renderWithProviders(
      <EmptyState
        title="No data"
        description="Nothing to show"
        icon={<span>🔍</span>}
        actionLabel="Refresh"
        onAction={jest.fn()}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
`;
