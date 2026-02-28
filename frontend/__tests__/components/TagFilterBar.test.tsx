import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TagFilterBar from '@/components/TagFilterBar';
import { TagResponse } from '@/lib/types';

const tags: TagResponse[] = [
  { id: 1, name: 'nature',  media_count: 10, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'outdoor', media_count: 5,  created_at: '2024-01-01T00:00:00Z' },
  { id: 3, name: 'cat',     media_count: 0,  created_at: '2024-01-01T00:00:00Z' },
];

function openPopup() {
  const btn = screen.getByRole('button', { name: /タグで絞り込む/i });
  fireEvent.click(btn);
}

describe('TagFilterBar', () => {
  it('タグが0件のときは何も描画しない', () => {
    const { container } = render(
      <TagFilterBar tags={[]} activeTags={[]} onToggle={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('ポップアップを開くとタグが表示される', () => {
    render(<TagFilterBar tags={tags} activeTags={[]} onToggle={jest.fn()} />);
    openPopup();
    expect(screen.getByText('nature')).toBeInTheDocument();
    expect(screen.getByText('outdoor')).toBeInTheDocument();
  });

  it('タグをクリックすると onToggle が呼ばれる', () => {
    const onToggle = jest.fn();
    render(<TagFilterBar tags={tags} activeTags={[]} onToggle={onToggle} />);
    openPopup();
    fireEvent.click(screen.getByText('nature'));
    expect(onToggle).toHaveBeenCalledWith('nature');
  });

  it('activeTags に含まれるタグはチェックボックスが checked になる', () => {
    render(<TagFilterBar tags={tags} activeTags={['nature']} onToggle={jest.fn()} />);
    openPopup();
    const checkbox = screen.getByRole('checkbox', { name: /nature/i });
    expect(checkbox).toBeChecked();
  });

  it('複数タグが active でも全タグがポップアップに表示される', () => {
    render(<TagFilterBar tags={tags} activeTags={['nature', 'cat']} onToggle={jest.fn()} />);
    openPopup();
    const popup = screen.getByTestId('tag-filter-popup');
    expect(popup).toHaveTextContent('nature');
    expect(popup).toHaveTextContent('outdoor');
    expect(popup).toHaveTextContent('cat');
  });

  it('選択数がボタンラベルに表示される', () => {
    render(<TagFilterBar tags={tags} activeTags={['nature', 'cat']} onToggle={jest.fn()} />);
    expect(screen.getByText(/タグで絞り込む \(2\)/)).toBeInTheDocument();
  });

  it('media_count降順でタグが並ぶ', () => {
    render(<TagFilterBar tags={tags} activeTags={[]} onToggle={jest.fn()} />);
    openPopup();
    const labels = screen.getAllByRole('checkbox').map(cb => cb.closest('label')?.textContent ?? '');
    const firstIdx = labels.findIndex(l => l.includes('nature'));
    const secondIdx = labels.findIndex(l => l.includes('outdoor'));
    const thirdIdx = labels.findIndex(l => l.includes('cat'));
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
