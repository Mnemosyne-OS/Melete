/**
 * Review.test.tsx — the wiring, not the pieces.
 *
 * schedule.ts is tested on its own and passes; that proves the arithmetic, not
 * that a click reaches it. This file mounts the real component and presses the
 * real buttons, because "every part is correct and nothing is connected" is a
 * failure mode a pure-logic suite reports as green.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Review } from './Review';
import { newCard } from '../lib/schedule';
import type { Card, Course } from '../lib/types';

const NOW = new Date(2026, 8, 1);

const card = (id: string, front: string): Card => newCard({ id, courseId: 'k1', front, back: `answer to ${front}` }, NOW);

const course: Course = {
  id: 'k1', title: 'Civil law', subject: 'Law', sourceKind: 'file', sourcePath: '/a.pdf',
  chars: 100, ocr: false, truncated: false, chunks: 3, ingestedAt: null,
  createdAt: NOW.toISOString(), retained: 'text',
};

function mount(due: Card[], onAnswer = vi.fn()) {
  const onLeave = vi.fn();
  render(<Review due={due} courses={[course]} goal={20} doneToday={0} onAnswer={onAnswer} onLeave={onLeave} />);
  return { onAnswer, onLeave };
}

describe('Review', () => {
  it('hides the answer until the student asks for it', () => {
    mount([card('c1', 'What is good faith?')]);
    expect(screen.getByText('What is good faith?')).toBeInTheDocument();
    expect(screen.queryByText('answer to What is good faith?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    expect(screen.getByText('answer to What is good faith?')).toBeInTheDocument();
  });

  it('reports a hit to the caller and moves on', () => {
    const { onAnswer } = mount([card('c1', 'first'), card('c2', 'second')]);
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]?.[1]).toBe(true);
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('brings a missed card back later in the same sitting', () => {
    const { onAnswer } = mount([card('c1', 'first'), card('c2', 'second')]);
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('Not yet'));
    expect(onAnswer.mock.calls[0]?.[1]).toBe(false);
    // 'second' is now in front; 'first' is behind it, not gone.
    expect(screen.getByText('second')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  it('folds the answer back down between cards', () => {
    mount([card('c1', 'first'), card('c2', 'second')]);
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.queryByText('answer to second')).not.toBeInTheDocument();
    expect(screen.getByText('Show the answer')).toBeInTheDocument();
  });

  it('ends the sitting with what was actually answered', () => {
    mount([card('c1', 'first')]);
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('Session finished')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 known, +2 XP')).toBeInTheDocument();
  });

  it('says there is nothing due instead of showing an empty card', () => {
    mount([]);
    expect(screen.getByText('Nothing due right now')).toBeInTheDocument();
    expect(screen.queryByText('Show the answer')).not.toBeInTheDocument();
  });
});
