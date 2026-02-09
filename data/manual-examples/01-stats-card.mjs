// COMPONENT: StatsCard
// PATTERN: Presentational with conditional rendering + loading state
// FILE: components/dashboard/StatsCard.tsx

export const COMPONENT_SOURCE = `
import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/common/Card';
import { Skeleton } from '@/components/common/Skeleton';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/helpers';

interface StatsCardProps {
  title: string;
  value: number;
  change?: number;
  changeLabel?: string;
  icon: ReactNode;
  variant?: 'default' | 'income' | 'expense' | 'balance';
  isCurrency?: boolean;
  isLoading?: boolean;
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel = 'vs last month',
  icon,
  variant = 'default',
  isCurrency = true,
  isLoading = false,
}: StatsCardProps) {
  const styles = variantStyles[variant];
  const isPositiveChange = change !== undefined && change >= 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={cn('rounded-full', styles.iconBg)}>
            <span className={styles.iconColor}>{icon}</span>
          </div>
          <p className={cn('text-2xl font-bold', styles.valueColor)}>
            {isCurrency ? formatCurrency(value) : value.toLocaleString()}
          </p>
          {change !== undefined && (
            <div className="flex items-center gap-1">
              <span className={cn(isPositiveChange ? 'text-success' : 'text-destructive')}>
                {isPositiveChange ? <ArrowUp /> : <ArrowDown />}
                {formatPercentage(Math.abs(change))}
              </span>
              <span>{changeLabel}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default StatsCard;
`;

export const TEST_OUTPUT = `import * as React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import StatsCard from '../StatsCard';

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = (props: any) => {
        const { initial, animate, exit, transition, ...rest } = props;
        const Tag = typeof tag === 'string' ? tag : 'div';
        return <Tag {...rest} />;
      };
      Component.displayName = \`motion.\${String(tag)}\`;
      return Component;
    },
  }),
}));

// Mock formatters
jest.mock('@/utils/formatters', () => ({
  formatCurrency: (val: number) => \`$\${val.toFixed(2)}\`,
  formatPercentage: (val: number) => \`\${val}%\`,
}));

describe('StatsCard', () => {
  const defaultProps = {
    title: 'Total Income',
    value: 5000,
    icon: <span data-testid="mock-icon">💰</span>,
  };

  it('renders the title and formatted value', () => {
    renderWithProviders(<StatsCard {...defaultProps} />);

    expect(screen.getByText('Total Income')).toBeInTheDocument();
    expect(screen.getByText('$5000.00')).toBeInTheDocument();
  });

  it('renders the icon', () => {
    renderWithProviders(<StatsCard {...defaultProps} />);

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('renders loading skeleton when isLoading is true', () => {
    const { container } = renderWithProviders(
      <StatsCard {...defaultProps} isLoading={true} />
    );

    // Should NOT render the title or value when loading
    expect(screen.queryByText('Total Income')).not.toBeInTheDocument();
    expect(screen.queryByText('$5000.00')).not.toBeInTheDocument();

    // Should render skeletons
    const skeletons = container.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays the change percentage when change prop is provided', () => {
    renderWithProviders(
      <StatsCard {...defaultProps} change={12.5} />
    );

    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('shows custom change label when provided', () => {
    renderWithProviders(
      <StatsCard {...defaultProps} change={5} changeLabel="vs last week" />
    );

    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });

  it('does not render change section when change is undefined', () => {
    renderWithProviders(<StatsCard {...defaultProps} />);

    expect(screen.queryByText('vs last month')).not.toBeInTheDocument();
  });

  it('renders raw number when isCurrency is false', () => {
    renderWithProviders(
      <StatsCard {...defaultProps} value={1500} isCurrency={false} />
    );

    expect(screen.getByText('1,500')).toBeInTheDocument();
  });

  it('renders negative change with down indicator styling', () => {
    renderWithProviders(
      <StatsCard {...defaultProps} change={-8.3} />
    );

    expect(screen.getByText('8.3%')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = renderWithProviders(
      <StatsCard {...defaultProps} change={10} variant="income" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
`;
