import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPanel from '@/components/FilterPanel';

const defaultProps = {
  mediaType: '',
  includeDeleted: false,
  createdFrom: '',
  createdTo: '',
  sortBy: 'created_at' as const,
  sortOrder: 'desc' as const,
  onMediaTypeChange: jest.fn(),
  onIncludeDeletedChange: jest.fn(),
  onCreatedFromChange: jest.fn(),
  onCreatedToChange: jest.fn(),
  onSortByChange: jest.fn(),
  onSortOrderChange: jest.fn(),
  onReset: jest.fn(),
};

describe('FilterPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders sort-by select', () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByTestId('sort-by-select')).toBeInTheDocument();
  });

  test('renders sort-order select', () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByTestId('sort-order-select')).toBeInTheDocument();
  });

  test('sort-by select shows correct initial value', () => {
    render(<FilterPanel {...defaultProps} sortBy="original_filename" />);
    const select = screen.getByTestId('sort-by-select') as HTMLSelectElement;
    expect(select.value).toBe('original_filename');
  });

  test('sort-order select shows correct initial value', () => {
    render(<FilterPanel {...defaultProps} sortOrder="asc" />);
    const select = screen.getByTestId('sort-order-select') as HTMLSelectElement;
    expect(select.value).toBe('asc');
  });

  test('calls onSortByChange when sort-by changes', () => {
    render(<FilterPanel {...defaultProps} />);
    fireEvent.change(screen.getByTestId('sort-by-select'), {
      target: { value: 'original_filename' },
    });
    expect(defaultProps.onSortByChange).toHaveBeenCalledWith('original_filename');
  });

  test('calls onSortOrderChange when sort-order changes', () => {
    render(<FilterPanel {...defaultProps} />);
    fireEvent.change(screen.getByTestId('sort-order-select'), {
      target: { value: 'asc' },
    });
    expect(defaultProps.onSortOrderChange).toHaveBeenCalledWith('asc');
  });

  test('reset button resets sort fields', () => {
    render(<FilterPanel {...defaultProps} />);
    fireEvent.click(screen.getByTestId('filter-reset-btn'));
    expect(defaultProps.onReset).toHaveBeenCalledTimes(1);
  });

  test('sort-by select has aria-label for accessibility', () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByTestId('sort-by-select')).toHaveAttribute('aria-label', 'ソート対象');
  });

  test('sort-order select has aria-label for accessibility', () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByTestId('sort-order-select')).toHaveAttribute('aria-label', 'ソート順');
  });
});
