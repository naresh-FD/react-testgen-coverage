// COMPONENT: ExpenseCard
// PATTERN: Interactive card with callback props, conditional checkbox, memo wrapper
// FILE: components/expense/ExpenseCard.tsx

export const COMPONENT_SOURCE = `
import { memo } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { useCategoryContext } from '@/contexts';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/helpers';
import type { Expense } from '@/types';

interface ExpenseCardProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  showCheckbox?: boolean;
}

export const ExpenseCard = memo(function ExpenseCard({
  expense,
  onEdit,
  onDelete,
  isSelected = false,
  onSelect,
  showCheckbox = false,
}: ExpenseCardProps) {
  const { getCategoryById } = useCategoryContext();
  const category = getCategoryById(expense.categoryId);
  const isIncome = expense.type === 'income';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={cn('rounded-lg border p-4', isSelected && 'border-primary bg-primary/5')}>
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect?.(expense.id)}
            aria-label={\`Select transaction \${expense.description || expense.category}\`}
          />
        )}
        <div className="flex-1">
          <p className="font-medium">{expense.description || category?.name || 'Transaction'}</p>
          <Badge variant="secondary">{category?.name}</Badge>
          {expense.isRecurring && <Badge variant="outline">Recurring</Badge>}
        </div>
        <p className={cn('font-semibold', isIncome ? 'text-success' : 'text-destructive')}>
          {isIncome ? '+' : '-'}{formatCurrency(expense.amount)}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(expense.date)}</p>
        <Button variant="ghost" size="icon" onClick={() => onEdit(expense)} aria-label="Edit transaction">
          <Edit />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(expense)} aria-label="Delete transaction">
          <Trash2 />
        </Button>
      </div>
    </motion.div>
  );
});

export default ExpenseCard;
`;

export const TEST_OUTPUT = `import * as React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import ExpenseCard from '../ExpenseCard';
import type { Expense } from '@/types';

jest.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = (props: any) => {
        const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
        const Tag = typeof tag === 'string' ? tag : 'div';
        return <Tag {...rest} />;
      };
      Component.displayName = \`motion.\${String(tag)}\`;
      return Component;
    },
  }),
}));

jest.mock('lucide-react', () => ({
  Edit: (props: any) => <svg data-testid="edit-icon" {...props} />,
  Trash2: (props: any) => <svg data-testid="trash-icon" {...props} />,
}));

jest.mock('@/utils/formatters', () => ({
  formatCurrency: (val: number) => \`$\${val.toFixed(2)}\`,
  formatDate: (date: string) => new Date(date).toLocaleDateString(),
}));

describe('ExpenseCard', () => {
  const mockExpense: Expense = {
    id: 'exp-1',
    userId: 'user-1',
    amount: 150.50,
    category: 'Food',
    categoryId: 'cat-food',
    type: 'expense',
    description: 'Grocery shopping',
    date: '2024-01-15',
    isRecurring: false,
    recurrence: 'none',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnSelect = jest.fn();

  const defaultProps = {
    expense: mockExpense,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the expense description', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.getByText('Grocery shopping')).toBeInTheDocument();
    });

    it('renders the formatted amount with minus sign for expenses', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.getByText('-$150.50')).toBeInTheDocument();
    });

    it('renders with plus sign for income type', () => {
      const incomeExpense = { ...mockExpense, type: 'income' as const };
      renderWithProviders(
        <ExpenseCard {...defaultProps} expense={incomeExpense} />
      );
      expect(screen.getByText('+$150.50')).toBeInTheDocument();
    });

    it('renders the formatted date', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.getByText('1/15/2024')).toBeInTheDocument();
    });

    it('shows Recurring badge when expense is recurring', () => {
      const recurringExpense = { ...mockExpense, isRecurring: true };
      renderWithProviders(
        <ExpenseCard {...defaultProps} expense={recurringExpense} />
      );
      expect(screen.getByText('Recurring')).toBeInTheDocument();
    });

    it('does not show Recurring badge for non-recurring expense', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.queryByText('Recurring')).not.toBeInTheDocument();
    });

    it('renders edit and delete buttons', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.getByRole('button', { name: /edit transaction/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete transaction/i })).toBeInTheDocument();
    });
  });

  describe('Checkbox', () => {
    it('does not render checkbox by default', () => {
      renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('renders checkbox when showCheckbox is true', () => {
      renderWithProviders(
        <ExpenseCard {...defaultProps} showCheckbox onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('checkbox reflects isSelected state', () => {
      renderWithProviders(
        <ExpenseCard {...defaultProps} showCheckbox isSelected onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('calls onSelect when checkbox is toggled', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseCard {...defaultProps} showCheckbox onSelect={mockOnSelect} />
      );

      await user.click(screen.getByRole('checkbox'));
      expect(mockOnSelect).toHaveBeenCalledWith('exp-1');
    });
  });

  describe('User Interactions', () => {
    it('calls onEdit with the expense when edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseCard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /edit transaction/i }));
      expect(mockOnEdit).toHaveBeenCalledTimes(1);
      expect(mockOnEdit).toHaveBeenCalledWith(mockExpense);
    });

    it('calls onDelete with the expense when delete button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseCard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /delete transaction/i }));
      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnDelete).toHaveBeenCalledWith(mockExpense);
    });
  });

  describe('Snapshot', () => {
    it('matches snapshot', () => {
      const { container } = renderWithProviders(<ExpenseCard {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
`;
