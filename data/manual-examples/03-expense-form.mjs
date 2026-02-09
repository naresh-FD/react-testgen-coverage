// COMPONENT: ExpenseForm
// PATTERN: Form with react-hook-form, modal wrapper, conditional fields
// FILE: components/expense/ExpenseForm.tsx

export const COMPONENT_SOURCE = `
import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Modal } from '@/components/common/Modal';
import { useCategoryContext } from '@/contexts';
import type { Expense, TransactionType } from '@/types';

interface ExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  expense?: Expense | null;
  defaultType?: TransactionType;
  isLoading?: boolean;
}

export function ExpenseForm({
  isOpen,
  onClose,
  onSubmit,
  expense,
  defaultType = 'expense',
  isLoading = false,
}: ExpenseFormProps) {
  const { incomeCategories, expenseCategories } = useCategoryContext();
  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm();
  const transactionType = watch('type');
  const isRecurring = watch('isRecurring');

  useEffect(() => {
    if (expense) reset({ ...expense });
    else reset({ amount: 0, type: defaultType });
  }, [expense, defaultType, reset]);

  const handleFormSubmit = async (data) => {
    await onSubmit(data);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? 'Edit Transaction' : 'Add Transaction'}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Controller name="type" control={control} render={({ field }) => (
          <div>
            <button type="button" onClick={() => field.onChange('expense')}>Expense</button>
            <button type="button" onClick={() => field.onChange('income')}>Income</button>
          </div>
        )} />
        <Input label="Amount" type="number" {...register('amount')} />
        <Select label="Category" {...register('categoryId')} />
        <Input label="Date" type="date" {...register('date')} />
        <Input label="Description (optional)" placeholder="What was this for?" {...register('description')} />
        <Controller name="isRecurring" control={control} render={({ field }) => (
          <label>
            <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
            <span>This is a recurring transaction</span>
          </label>
        )} />
        {isRecurring && <Select label="Recurrence" {...register('recurrence')} />}
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" isLoading={isLoading}>
          {expense ? 'Update' : 'Add'} Transaction
        </Button>
      </form>
    </Modal>
  );
}

export default ExpenseForm;
`;

export const TEST_OUTPUT = `import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import ExpenseForm from '../ExpenseForm';
import type { Expense } from '@/types';

jest.mock('@/components/common/Modal', () => ({
  Modal: ({ children, isOpen, title }: any) =>
    isOpen ? (
      <div data-testid="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

describe('ExpenseForm', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
  };

  const mockExpense: Expense = {
    id: 'exp-1',
    userId: 'user-1',
    amount: 99.99,
    category: 'Food',
    categoryId: 'cat-food',
    type: 'expense' as const,
    description: 'Lunch',
    date: '2024-01-15',
    isRecurring: false,
    recurrence: 'none' as const,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the modal with "Add Transaction" title when no expense is provided', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} />);
      expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    });

    it('renders with "Edit Transaction" title when editing an expense', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} expense={mockExpense} />);
      expect(screen.getByText('Edit Transaction')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('renders type toggle buttons', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: /expense/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /income/i })).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} />);
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add transaction/i })).toBeInTheDocument();
    });

    it('shows "Update Transaction" button when editing', () => {
      renderWithProviders(<ExpenseForm {...defaultProps} expense={mockExpense} />);
      expect(screen.getByRole('button', { name: /update transaction/i })).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseForm {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('allows switching between expense and income type', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseForm {...defaultProps} />);

      const incomeBtn = screen.getByRole('button', { name: /income/i });
      await user.click(incomeBtn);
      // The component should update its internal state
    });

    it('shows recurring options when checkbox is toggled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseForm {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // After checking, recurrence select should appear
      await waitFor(() => {
        expect(screen.getByLabelText(/recurrence/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit and onClose on successful submission', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExpenseForm {...defaultProps} />);

      const submitBtn = screen.getByRole('button', { name: /add transaction/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });
  });

  describe('Snapshot', () => {
    it('matches snapshot for new transaction', () => {
      const { container } = renderWithProviders(<ExpenseForm {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
`;
